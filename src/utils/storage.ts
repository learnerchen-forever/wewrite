/**
 * Storage utility for WeWrite plugin
 * Provides platform-agnostic storage interface
 * Uses localforage for both desktop and mobile
 */

import localforage from 'localforage';

// Storage interface
export interface StorageInterface {
  get(id: string): Promise<any>;
  put(doc: any): Promise<void>;
  find(query: any): Promise<any[]>;
  bulkDocs(docs: any[]): Promise<any>;
  remove(id: string, rev?: string): Promise<void>;
}

// LocalForage implementation
class LocalForageStorage implements StorageInterface {
  private store: LocalForage;

  constructor(name: string) {
    this.store = localforage.createInstance({
      name: 'wewrite',
      storeName: name
    });
  }

  async get(id: string): Promise<any> {
    const doc = await this.store.getItem(id);
    if (!doc) {
      throw { status: 404, message: 'Document not found' };
    }
    return doc;
  }

  async put(doc: any): Promise<void> {
    if (!doc._id) {
      throw new Error('Document must have an _id');
    }
    
    const existingDoc: any = await this.store.getItem(doc._id);
    if (existingDoc) {
      // Update existing document
      doc._rev = (parseInt((existingDoc as any)._rev || '0') + 1).toString();
    } else {
      // Create new document
      doc._rev = '1';
    }
    
    await this.store.setItem(doc._id, doc);
  }

  async find(query: any): Promise<any[]> {
    const docs: any[] = [];
    await this.store.iterate((value) => {
      if (this.matchesQuery(value, query.selector)) {
        docs.push(value);
      }
    });
    return docs;
  }

  private matchesQuery(doc: any, selector: any): boolean {
    if (!selector) return true;
    
    for (const [key, condition] of Object.entries(selector)) {
      if (typeof condition === 'object' && condition !== null) {
        const typedCondition = condition as any;
        if (typedCondition.$eq !== undefined && doc[key] !== typedCondition.$eq) {
          return false;
        }
      } else if (doc[key] !== condition) {
        return false;
      }
    }
    return true;
  }

  async bulkDocs(docs: any[]): Promise<any> {
    const results = [];
    
    for (const doc of docs) {
      if (doc._deleted) {
        // Delete document
        try {
          await this.store.removeItem(doc._id);
          results.push({ ok: true, id: doc._id, rev: doc._rev });
        } catch (error) {
          results.push({ ok: false, id: doc._id, error: 'not_found' });
        }
      } else {
        // Create or update document
        try {
          const existingDoc: any = await this.store.getItem(doc._id);
          if (existingDoc) {
            doc._rev = (parseInt((existingDoc as any)._rev || '0') + 1).toString();
          } else {
            doc._rev = '1';
          }
          await this.store.setItem(doc._id, doc);
          results.push({ ok: true, id: doc._id, rev: doc._rev });
        } catch (error) {
          results.push({ ok: false, id: doc._id, error: 'error' });
        }
      }
    }
    
    return results;
  }

  async remove(id: string, rev?: string): Promise<void> {
    const doc = await this.store.getItem(id);
    if (!doc) {
      throw { status: 404, message: 'Document not found' };
    }
    await this.store.removeItem(id);
  }
}

// Factory function to create storage instance
export function createStorage(name: string): StorageInterface {
  return new LocalForageStorage(name);
}

// Export storage instances for different purposes
export const settingsStorage = createStorage('settings');
export const assetsStorage = createStorage('wechat-assets');
export const draftStorage = createStorage('local-drafts');