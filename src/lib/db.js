const DB_NAME = "shot-recorder";
const STORE = "captures";
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putCapture(record) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(record);
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getCapture(id) {
  if (typeof id !== "string" || id.length === 0) return null;
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const record = await requestToPromise(tx.objectStore(STORE).get(id));
  db.close();
  return record || null;
}

export async function forgetOldCaptures(maxAgeMs = 2 * 24 * 60 * 60 * 1000) {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  const store = tx.objectStore(STORE);
  const all = await requestToPromise(store.getAll());
  const cutoff = Date.now() - maxAgeMs;
  for (const record of all) {
    if (!record.createdAt || record.createdAt < cutoff) store.delete(record.id);
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
