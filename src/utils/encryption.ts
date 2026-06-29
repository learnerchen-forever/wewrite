// API key encryption using platform-appropriate mechanisms
// Desktop: Electron safeStorage (when available)
// Mobile/Web: Web Crypto API (AES-GCM)
// Fallback: Base64 obfuscation (not cryptographically secure, last resort)

import { createLogger } from './logger';

const log = createLogger('Encryption');

const DESKTOP_PREFIX = 'enc_desk_';
const WEBCRYPTO_PREFIX = 'enc_web_';
const ENCRYPTION_PREFIX = 'enc_';
const DECRYPTION_PREFIX = 'dec_';

// Web Crypto constants
// Exactly 32 chars = 32 bytes for AES-256-GCM
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

// Detect if we're in an Electron environment with safeStorage available
function hasElectronSafeStorage(): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron');
    return electron?.remote?.safeStorage?.isEncryptionAvailable?.() ?? false;
  } catch {
    return false;
  }
}

function isEncrypted(value: string): boolean {
  return value.startsWith(DESKTOP_PREFIX) || value.startsWith(WEBCRYPTO_PREFIX) || value.startsWith(ENCRYPTION_PREFIX);
}

function isDecrypted(value: string): boolean {
  return value.startsWith(DECRYPTION_PREFIX);
}

/**
 * Encrypt an API key or secret value.
 * Idempotent: if already encrypted, returns as-is.
 * Uses Electron safeStorage if available, falls back to Web Crypto AES-GCM.
 */
export async function encryptValue(value: string): Promise<string> {
  if (!value || isEncrypted(value)) return value;

  const rawValue = isDecrypted(value) ? value.slice(DECRYPTION_PREFIX.length) : value;

  try {
    // Try Electron safeStorage first
    if (hasElectronSafeStorage()) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const safeStorage = require('electron').remote.safeStorage;
      const encrypted = safeStorage.encryptString(rawValue) as Buffer;
      return DESKTOP_PREFIX + encrypted.toString('base64');
    }

    // Fallback to Web Crypto API
    const key = await getWebCryptoKey();
    const encoded = new TextEncoder().encode(rawValue);
    const encrypted = await crypto.subtle.encrypt(ALGORITHM, key, encoded);
    return WEBCRYPTO_PREFIX + arrayBufferToBase64(encrypted);
  } catch (err) {
    log.warn('encryption failed, fallback to base64', { err: String(err) });
    return ENCRYPTION_PREFIX + btoa(rawValue);
  }
}

/**
 * Decrypt a previously encrypted value.
 * Returns the decrypted string, or the original if not encrypted.
 */
export async function decryptValue(value: string): Promise<string> {
  if (!value) return value;
  if (isDecrypted(value)) return value.slice(DECRYPTION_PREFIX.length);

  try {
    if (value.startsWith(DESKTOP_PREFIX)) {
      if (hasElectronSafeStorage()) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const safeStorage = require('electron').remote.safeStorage;
        const buffer = Buffer.from(value.slice(DESKTOP_PREFIX.length), 'base64');
        return safeStorage.decryptString(buffer);
      }
      return value; // can't decrypt without Electron
    }

    if (value.startsWith(WEBCRYPTO_PREFIX)) {
      const key = await getWebCryptoKey();
      const encrypted = base64ToArrayBuffer(value.slice(WEBCRYPTO_PREFIX.length));
      const decrypted = await crypto.subtle.decrypt(ALGORITHM, key, encrypted);
      return new TextDecoder().decode(decrypted);
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
    (k) => k.toLowerCase().includes('apikey') || k.toLowerCase().includes('appsecret'),
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
    (k) => k.toLowerCase().includes('apikey') || k.toLowerCase().includes('appsecret'),
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
