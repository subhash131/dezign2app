type TableRecord = {
  tableId: string;
  rows: Array<Record<string, unknown>>;
  updatedAt: number;
};

const DATABASE_NAME = "blueprint-simulation";
const STORE_NAME = "tables";
const memoryTables = new Map<string, TableRecord>();

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "tableId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Unable to open simulation database."));
  });
}

async function readRecord(tableId: string): Promise<TableRecord | undefined> {
  const database = await openDatabase();
  if (!database) return memoryTables.get(tableId);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(tableId);
    request.onsuccess = () => resolve(request.result as TableRecord | undefined);
    request.onerror = () => reject(request.error ?? new Error("Unable to read simulation table."));
  });
}

async function writeRecord(record: TableRecord) {
  const database = await openDatabase();
  if (!database) {
    memoryTables.set(record.tableId, clone(record));
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Unable to save simulation table."));
  });
}

export async function getSimulationTable(tableId: string, seedRows: Array<Record<string, unknown>> = []) {
  const existing = await readRecord(tableId);
  if (existing) return clone(existing.rows);
  const rows = clone(seedRows);
  await writeRecord({ tableId, rows, updatedAt: Date.now() });
  return rows;
}

export async function saveSimulationTable(tableId: string, rows: Array<Record<string, unknown>>) {
  await writeRecord({ tableId, rows: clone(rows), updatedAt: Date.now() });
}
