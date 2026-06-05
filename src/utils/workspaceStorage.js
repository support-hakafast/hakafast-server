const DB_NAME = 'hakafast_workspaces';
const DB_VERSION = 1;
const STORE = 'snapshots';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function snapshotKey(trackSlug, workspaceId) {
  return `${trackSlug}:${workspaceId}`;
}

export async function saveLocalSnapshot(trackSlug, workspaceId, snapshot) {
  if (!trackSlug || !workspaceId) return;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ ...snapshot, savedAt: Date.now() }, snapshotKey(trackSlug, workspaceId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore quota / private mode */
  }
}

export async function loadLocalSnapshot(trackSlug, workspaceId) {
  if (!trackSlug || !workspaceId) return null;
  try {
    const db = await openDb();
    const data = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(snapshotKey(trackSlug, workspaceId));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return data;
  } catch {
    return null;
  }
}

export async function clearLocalSnapshot(trackSlug, workspaceId) {
  if (!trackSlug || !workspaceId) return;
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(snapshotKey(trackSlug, workspaceId));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}
