// API key encryption using platform-appropriate mechanisms
//
// IMPORTANT — security posture: the AES key below ships inside the plugin
// bundle, so this is NOT cryptographically strong protection against someone
// with access to the vault + the plugin code. It exists to (a) avoid storing
// plaintext secrets in data.json, (b) defeat casual reading / fingerprinting.
// Random per-value IVs ensure identical secrets never produce identical
// ciphertext.
//
// Formats:
//   enc_web2_  — AES-256-GCM with a random 12-byte IV; value = base64(iv || ct)
//   enc_web_   — LEGACY: AES-256-GCM with a fixed zero IV; value = base64(ct)
//                (still decrypted for backward compatibility)
//   enc_desk_  — LEGACY: Electron safeStorage (desktop). Modern Electron
//                removed the `remote` module, so these can no longer be
//                decrypted; decryptValue() returns '' to force re-entry.
//   enc_       — LEGACY fallback: plain base64 (not encrypted at all)

import { createLogger } from './logger';

const log = createLogger('Encryption');

const DESKTOP_PREFIX = 'enc_desk_';
const WEBCRYPTO_PREFIX = 'enc_web_';
const WEBCRYPTO2_PREFIX = 'enc_web2_';
const ENCRYPTION_PREFIX = 'enc_';
const DECRYPTION_PREFIX = 'dec_';

// Exactly 32 chars = 32 bytes for AES-256-GCM. Ships in the bundle — see the
// security note at the top of this file.
const KEY_STRING = 'wewrite.v2.obsidian-plugin.aesxx';
const ENCRYPTION_KEY_BYTES = new TextEncoder().encode(KEY_STRING);
const ALGORITHM: AesGcmParams = { name: 'AES-GCM', iv: new Uint8Array(12) };

async function getWebCryptoKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', ENCRYPTION_KEY_BYTES, ALGORITHM.name, false, ['encrypt', 'decrypt']);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function isEncrypted(value: string): boolean {
  return value.startsWith(DESKTOP_PREFIX) || value.startsWith(WEBCRYPTO_PREFIX)
    || value.startsWith(WEBCRYPTO2_PREFIX) || value.startsWith(ENCRYPTION_PREFIX);
}

function isDecrypted(value: string): boolean {
  return value.startsWith(DECRYPTION_PREFIX);
}

/**
 * Encrypt an API key or secret value.
 * Idempotent: if already encrypted, returns as-is.
 * Uses AES-256-GCM with a random IV (new format enc_web2_).
 */
export async function encryptValue(value: string): Promise<string> {
  if (!value || isEncrypted(value)) return value;

  const rawValue = isDecrypted(value) ? value.slice(DECRYPTION_PREFIX.length) : value;

  try {
    const key = await getWebCryptoKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(rawValue);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

    // iv || ciphertext, base64-encoded
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encrypted), iv.length);
    return WEBCRYPTO2_PREFIX + arrayBufferToBase64(combined.buffer);
  } catch (err) {
    log.warn('encryption failed, fallback to base64', { err: String(err) });
    return ENCRYPTION_PREFIX + btoa(rawValue);
  }
}

/**
 * Decrypt a previously encrypted value.
 * Returns the decrypted string, '' for legacy values that can no longer be
 * decrypted (enc_desk_), or the original if not encrypted.
 */
export async function decryptValue(value: string): Promise<string> {
  if (!value) return value;
  if (isDecrypted(value)) return value.slice(DECRYPTION_PREFIX.length);

  try {
    if (value.startsWith(WEBCRYPTO2_PREFIX)) {
      const key = await getWebCryptoKey();
      const combined = base64ToArrayBuffer(value.slice(WEBCRYPTO2_PREFIX.length));
      const iv = combined.slice(0, 12);
      const ct = combined.slice(12);
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
      return new TextDecoder().decode(decrypted);
    }

    if (value.startsWith(WEBCRYPTO_PREFIX)) {
      // Legacy: fixed zero IV
      const key = await getWebCryptoKey();
      const encrypted = base64ToArrayBuffer(value.slice(WEBCRYPTO_PREFIX.length));
      const decrypted = await crypto.subtle.decrypt(ALGORITHM, key, encrypted);
      return new TextDecoder().decode(decrypted);
    }

    if (value.startsWith(DESKTOP_PREFIX)) {
      // Legacy Electron safeStorage values — the `remote` module was removed
      // from modern Electron, so these are undecryptable. Return '' so the
      // account is flagged invalid and the user re-enters the secret instead
      // of silently shipping the ciphertext as a credential.
      log.warn('legacy enc_desk_ value cannot be decrypted on this platform — clearing secret, please re-enter it');
      return '';
    }

    if (value.startsWith(ENCRYPTION_PREFIX)) {
      return atob(value.slice(ENCRYPTION_PREFIX.length));
    }

    return value; // not encrypted
  } catch (err) {
    log.warn('decryption failed, returning raw value', { err: String(err) });
    return value;
  }
}

/**
 * Encrypt all API keys and secrets in a settings object.
 * Fields ending with 'apiKey' or 'appSecret' are encrypted in place.
 */
export async function encryptSettingsKeys(settings: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = { ...settings };
  const keysToEncrypt = Object.keys(result).filter(
    (k) => k.toLowerCase().includes('apikey') || k.toLowerCase().includes('appsecret') || k === 'syncPassword',
  );

  for (const key of keysToEncrypt) {
    const value = result[key];
    if (typeof value === 'string' && value.length > 0) {
      (result as Record<string, unknown>)[key] = await encryptValue(value);
    }
  }

  // Handle arrays of accounts
  for (const arrayKey of ['wechatAccounts', 'aiTextAccounts', 'aiImageGenAccounts']) {
    const arr = result[arrayKey];
    if (Array.isArray(arr)) {
      (result as Record<string, unknown>)[arrayKey] = await Promise.all(
        arr.map(async (item: Record<string, unknown>) => {
          const encrypted = { ...item };
          for (const k of Object.keys(encrypted)) {
            if (k.toLowerCase().includes('apikey') || k.toLowerCase().includes('appsecret')) {
              const v = encrypted[k];
              if (typeof v === 'string' && v.length > 0) {
                encrypted[k] = await encryptValue(v);
              }
            }
          }
          return encrypted;
        }),
      );
    }
  }

  return result;
}

/**
 * Decrypt all API keys and secrets in a raw settings object.
 * Inverse of encryptSettingsKeys — used when importing data that may contain
 * encrypted keys (e.g., from a data.json backup rather than an export file).
 * Fields ending with 'apiKey' or 'appSecret' are decrypted in place.
 * Non-encrypted values pass through unchanged.
 */
export async function decryptSettingsKeys(raw: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = { ...raw };
  const keysToDecrypt = Object.keys(result).filter(
    (k) => k.toLowerCase().includes('apikey') || k.toLowerCase().includes('appsecret') || k === 'syncPassword',
  );

  for (const key of keysToDecrypt) {
    const value = result[key];
    if (typeof value === 'string' && value.length > 0) {
      (result as Record<string, unknown>)[key] = await decryptValue(value);
    }
  }

  // Handle arrays of accounts
  for (const arrayKey of ['wechatAccounts', 'aiTextAccounts', 'aiImageGenAccounts']) {
    const arr = result[arrayKey];
    if (Array.isArray(arr)) {
      (result as Record<string, unknown>)[arrayKey] = await Promise.all(
        arr.map(async (item: Record<string, unknown>) => {
          const decrypted = { ...item };
          for (const k of Object.keys(decrypted)) {
            if (k.toLowerCase().includes('apikey') || k.toLowerCase().includes('appsecret')) {
              const v = decrypted[k];
              if (typeof v === 'string' && v.length > 0) {
                decrypted[k] = await decryptValue(v);
              }
            }
          }
          return decrypted;
        }),
      );
    }
  }

  return result;
}
