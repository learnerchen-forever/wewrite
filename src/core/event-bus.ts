// Lightweight Pub/Sub event bus for decoupled module communication

import type { EventBusMessage } from './interfaces';
import { createLogger } from '../utils/logger';

const log = createLogger('EventBus');

type Listener = (message: EventBusMessage) => void;

export class EventBus {
  private listeners: Map<string, Set<Listener>> = new Map();

  on(type: string, listener: Listener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
    return () => this.listeners.get(type)?.delete(listener);
  }

  emit(message: EventBusMessage): void {
    const listeners = this.listeners.get(message.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(message);
        } catch (err) {
          log.error('listener error', { type: message.type, err: String(err) });
        }
      }
    }
  }

  off(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  clear(): void {
    this.listeners.clear();
  }
}

// Singleton instance
export const eventBus = new EventBus();
