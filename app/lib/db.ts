import type { ActiveWalk, CheckIn, WalkRecord } from "../types";

const DB_NAME = "horeki-local";
const DB_VERSION = 2;
const RECORDS_STORE = "walkRecords";
const STATE_STORE = "appState";
const CHECK_INS_STORE = "checkIns";
const ACTIVE_KEY = "activeWalk";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(RECORDS_STORE)) {
        const records = database.createObjectStore(RECORDS_STORE, { keyPath: "id" });
        records.createIndex("startedAt", "startedAt");
      }
      if (!database.objectStoreNames.contains(STATE_STORE)) {
        database.createObjectStore(STATE_STORE);
      }
      if (!database.objectStoreNames.contains(CHECK_INS_STORE)) {
        const checkIns = database.createObjectStore(CHECK_INS_STORE, { keyPath: "id" });
        checkIns.createIndex("checkedInAt", "checkedInAt");
        checkIns.createIndex("spotId", "spotId");
        checkIns.createIndex("walkId", "walkId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(storeName: string, mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export function getWalkRecords() {
  return transact<WalkRecord[]>(RECORDS_STORE, "readonly", (store) => store.getAll()).then((records) =>
    records.sort((a, b) => b.startedAt - a.startedAt),
  );
}

export function saveWalkRecord(record: WalkRecord) {
  return transact<IDBValidKey>(RECORDS_STORE, "readwrite", (store) => store.put(record));
}

export function saveActiveWalk(walk: ActiveWalk) {
  return transact<IDBValidKey>(STATE_STORE, "readwrite", (store) => store.put(walk, ACTIVE_KEY));
}

export function getActiveWalk() {
  return transact<ActiveWalk | undefined>(STATE_STORE, "readonly", (store) => store.get(ACTIVE_KEY));
}

export function clearActiveWalk() {
  return transact<undefined>(STATE_STORE, "readwrite", (store) => store.delete(ACTIVE_KEY));
}

export function getCheckIns() {
  return transact<CheckIn[]>(CHECK_INS_STORE, "readonly", (store) => store.getAll()).then((checkIns) =>
    checkIns.sort((a, b) => b.checkedInAt - a.checkedInAt),
  );
}

export function saveCheckIn(checkIn: CheckIn) {
  return transact<IDBValidKey>(CHECK_INS_STORE, "readwrite", (store) => store.put(checkIn));
}
