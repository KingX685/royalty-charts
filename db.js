const DB_NAME = 'royalty-charts';
const DB_VERSION = 1;

let dbPromise;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('journals')) {
        db.createObjectStore('journals', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('trades')) {
        const store = db.createObjectStore('trades', { keyPath: 'id' });
        store.createIndex('journalId', 'journalId', { unique: false });
        store.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains('confluenceTemplates')) {
        const store = db.createObjectStore('confluenceTemplates', { keyPath: 'journalId' });
        store.createIndex('journalId', 'journalId', { unique: true });
      }
      if (!db.objectStoreNames.contains('appSettings')) {
        db.createObjectStore('appSettings', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
  return dbPromise;
}

async function withStore(storeName, mode, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = callback(store, tx);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

export function getAllJournals() {
  return withStore('journals', 'readonly', (store) => store.getAll());
}

export function addJournal(journal) {
  return withStore('journals', 'readwrite', (store) => store.put(journal));
}

export function updateJournal(journal) {
  return withStore('journals', 'readwrite', (store) => store.put(journal));
}

export function deleteJournal(id) {
  return withStore('journals', 'readwrite', (store, tx) => {
    store.delete(id);
    const tradesStore = tx.db.transaction('trades', 'readwrite').objectStore('trades');
    const index = tradesStore.index('journalId');
    index.openCursor(IDBKeyRange.only(id)).onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        tradesStore.delete(cursor.primaryKey);
        cursor.continue();
      }
    };
    tx.db.transaction('confluenceTemplates', 'readwrite').objectStore('confluenceTemplates').delete(id);
  });
}

export async function getTradesByJournal(journalId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('trades', 'readonly');
    const store = tx.objectStore('trades');
    const index = store.index('journalId');
    const request = index.getAll(IDBKeyRange.only(journalId));
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export function addTrade(trade) {
  return withStore('trades', 'readwrite', (store) => store.put(trade));
}

export function updateTrade(trade) {
  return withStore('trades', 'readwrite', (store) => store.put(trade));
}

export function deleteTrade(id) {
  return withStore('trades', 'readwrite', (store) => store.delete(id));
}

export async function getTradesByDate(journalId, date) {
  const trades = await getTradesByJournal(journalId);
  return trades.filter((trade) => trade.closeDate === date && trade.status === 'Closed');
}

export async function getConfluenceTemplate(journalId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('confluenceTemplates', 'readonly');
    const store = tx.objectStore('confluenceTemplates');
    const request = store.get(journalId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function saveConfluenceTemplate(journalId, items) {
  return withStore('confluenceTemplates', 'readwrite', (store) =>
    store.put({ journalId, items })
  );
}

export async function getAppSetting(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('appSettings', 'readonly');
    const store = tx.objectStore('appSettings');
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function saveAppSetting(setting) {
  return withStore('appSettings', 'readwrite', (store) => store.put(setting));
}
