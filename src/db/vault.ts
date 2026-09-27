// Encrypted IndexedDB vault. Each record is stored as {id, table, iv, ct};
// nothing readable about the user's health is ever written to disk. Photos live
// in a separate blob store that is decrypted on demand, not at unlock.

import { deriveKey, fromB64, open, openBytes, PBKDF2_ITERATIONS, randomBytes, seal, sealBytes, toB64 } from "./crypto";
import type { BaseRecord, TableName } from "./types";

const DB_NAME = "tc-vault";
const DB_VERSION = 1;
const VERIFIER = "transformation-coach:v1";

interface Row {
  id: string;
  table: TableName;
  iv: Uint8Array<ArrayBuffer>;
  ct: ArrayBuffer;
}

interface VaultMeta {
  k: "vault";
  salt: Uint8Array<ArrayBuffer>;
  iterations: number;
  iv: Uint8Array<ArrayBuffer>;
  ct: ArrayBuffer;
  failed_attempts: number;
  locked_until: number;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "k" });
      if (!db.objectStoreNames.contains("records")) {
        const s = db.createObjectStore("records", { keyPath: "id" });
        s.createIndex("table", "table");
      }
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "id" });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export class WrongPasscodeError extends Error {}
export class TooManyAttemptsError extends Error {
  constructor(public retryAt: number) {
    super("Too many attempts");
  }
}

export class Vault {
  private db: IDBDatabase | null = null;
  private key: CryptoKey | null = null;

  private async conn(): Promise<IDBDatabase> {
    if (!this.db) this.db = await openDb();
    return this.db;
  }

  get unlocked(): boolean {
    return this.key !== null;
  }

  private async meta(): Promise<VaultMeta | undefined> {
    const db = await this.conn();
    return req(db.transaction("meta").objectStore("meta").get("vault")) as Promise<VaultMeta | undefined>;
  }

  private async putMeta(m: VaultMeta): Promise<void> {
    const db = await this.conn();
    const tx = db.transaction("meta", "readwrite");
    tx.objectStore("meta").put(m);
    await txDone(tx);
  }

  async isInitialized(): Promise<boolean> {
    return (await this.meta()) !== undefined;
  }

  async create(passcode: string, iterations = PBKDF2_ITERATIONS): Promise<void> {
    const salt = randomBytes(16);
    const key = await deriveKey(passcode, salt, iterations);
    const { iv, ct } = await seal(key, VERIFIER);
    await this.putMeta({ k: "vault", salt, iterations, iv, ct, failed_attempts: 0, locked_until: 0 });
    this.key = key;
  }

  /** Returns every decrypted record grouped by table. */
  async unlock(passcode: string): Promise<Map<TableName, BaseRecord[]>> {
    const m = await this.meta();
    if (!m) throw new Error("Vault not initialised");
    if (m.locked_until > Date.now()) throw new TooManyAttemptsError(m.locked_until);
    const key = await deriveKey(passcode, m.salt, m.iterations);
    let ok = false;
    try {
      ok = (await open<string>(key, { iv: m.iv, ct: m.ct })) === VERIFIER;
    } catch {
      ok = false;
    }
    if (!ok) {
      const failed = m.failed_attempts + 1;
      // Back off after 5 failures: 30s, 60s, 120s ... capped at 1h.
      const lockMs = failed >= 5 ? Math.min(3_600_000, 30_000 * 2 ** (failed - 5)) : 0;
      await this.putMeta({ ...m, failed_attempts: failed, locked_until: lockMs ? Date.now() + lockMs : 0 });
      throw new WrongPasscodeError("Incorrect passcode");
    }
    if (m.failed_attempts) await this.putMeta({ ...m, failed_attempts: 0, locked_until: 0 });
    this.key = key;
    return this.loadAll();
  }

  lock(): void {
    this.key = null;
  }

  private requireKey(): CryptoKey {
    if (!this.key) throw new Error("Vault is locked");
    return this.key;
  }

  private async loadAll(): Promise<Map<TableName, BaseRecord[]>> {
    const key = this.requireKey();
    const db = await this.conn();
    const rows = (await req(db.transaction("records").objectStore("records").getAll())) as Row[];
    const out = new Map<TableName, BaseRecord[]>();
    for (const row of rows) {
      const rec = await open<BaseRecord>(key, row);
      const list = out.get(row.table) ?? [];
      list.push(rec);
      out.set(row.table, list);
    }
    return out;
  }

  async put(table: TableName, rec: BaseRecord): Promise<void> {
    const key = this.requireKey();
    const { iv, ct } = await seal(key, rec);
    const db = await this.conn();
    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").put({ id: `${table}:${rec.id}`, table, iv, ct } satisfies Row);
    await txDone(tx);
  }

  async putMany(items: { table: TableName; rec: BaseRecord }[]): Promise<void> {
    const key = this.requireKey();
    const rows: Row[] = [];
    for (const { table, rec } of items) rows.push({ id: `${table}:${rec.id}`, table, ...(await seal(key, rec)) });
    const db = await this.conn();
    const tx = db.transaction("records", "readwrite");
    const store = tx.objectStore("records");
    for (const r of rows) store.put(r);
    await txDone(tx);
  }

  async remove(table: TableName, id: string): Promise<void> {
    const db = await this.conn();
    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").delete(`${table}:${id}`);
    await txDone(tx);
  }

  async putBlob(id: string, bytes: Uint8Array<ArrayBuffer>, mime: string): Promise<void> {
    const key = this.requireKey();
    const sealed = await sealBytes(key, bytes);
    const meta = await seal(key, { mime });
    const db = await this.conn();
    const tx = db.transaction("blobs", "readwrite");
    tx.objectStore("blobs").put({ id, ...sealed, mimeIv: meta.iv, mimeCt: meta.ct });
    await txDone(tx);
  }

  async getBlob(id: string): Promise<Blob | null> {
    const key = this.requireKey();
    const db = await this.conn();
    const row = await req(db.transaction("blobs").objectStore("blobs").get(id));
    if (!row) return null;
    const bytes = await openBytes(key, { iv: row.iv, ct: row.ct });
    const { mime } = await open<{ mime: string }>(key, { iv: row.mimeIv, ct: row.mimeCt });
    return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
  }

  async removeBlob(id: string): Promise<void> {
    const db = await this.conn();
    const tx = db.transaction("blobs", "readwrite");
    tx.objectStore("blobs").delete(id);
    await txDone(tx);
  }

  async listBlobIds(): Promise<string[]> {
    const db = await this.conn();
    return (await req(db.transaction("blobs").objectStore("blobs").getAllKeys())) as string[];
  }

  /** Verify the current passcode, then re-encrypt everything under a new one. */
  async changePasscode(current: string, next: string): Promise<void> {
    const m = await this.meta();
    if (!m) throw new Error("Vault not initialised");
    const oldKey = await deriveKey(current, m.salt, m.iterations);
    try {
      if ((await open<string>(oldKey, { iv: m.iv, ct: m.ct })) !== VERIFIER) throw new Error();
    } catch {
      throw new WrongPasscodeError("Incorrect passcode");
    }
    const salt = randomBytes(16);
    const newKey = await deriveKey(next, salt, m.iterations);
    const db = await this.conn();
    const rows = (await req(db.transaction("records").objectStore("records").getAll())) as Row[];
    const blobs = await req(db.transaction("blobs").objectStore("blobs").getAll());
    const newRows: Row[] = [];
    for (const r of rows) newRows.push({ ...r, ...(await seal(newKey, await open(oldKey, r))) });
    const newBlobs = [];
    for (const b of blobs) {
      const bytes = (await openBytes(oldKey, { iv: b.iv, ct: b.ct })) as Uint8Array<ArrayBuffer>;
      const mime = await open(oldKey, { iv: b.mimeIv, ct: b.mimeCt });
      const s = await sealBytes(newKey, bytes);
      const mm = await seal(newKey, mime);
      newBlobs.push({ id: b.id, ...s, mimeIv: mm.iv, mimeCt: mm.ct });
    }
    const v = await seal(newKey, VERIFIER);
    const tx = db.transaction(["records", "blobs", "meta"], "readwrite");
    for (const r of newRows) tx.objectStore("records").put(r);
    for (const b of newBlobs) tx.objectStore("blobs").put(b);
    tx.objectStore("meta").put({ ...m, salt, iv: v.iv, ct: v.ct, failed_attempts: 0, locked_until: 0 } satisfies VaultMeta);
    await txDone(tx);
    this.key = newKey;
  }

  /** Encrypted backup: an export that can only be restored with the same passcode. */
  async exportEncrypted(): Promise<string> {
    const m = await this.meta();
    const db = await this.conn();
    const rows = (await req(db.transaction("records").objectStore("records").getAll())) as Row[];
    const blobs = await req(db.transaction("blobs").objectStore("blobs").getAll());
    return JSON.stringify({
      format: "transformation-coach-backup",
      version: 1,
      exported_at: new Date().toISOString(),
      meta: m && { salt: toB64(m.salt), iterations: m.iterations, iv: toB64(m.iv), ct: toB64(m.ct) },
      records: rows.map((r) => ({ id: r.id, table: r.table, iv: toB64(r.iv), ct: toB64(r.ct) })),
      blobs: blobs.map((b) => ({
        id: b.id,
        iv: toB64(b.iv),
        ct: toB64(b.ct),
        mimeIv: toB64(b.mimeIv),
        mimeCt: toB64(b.mimeCt),
      })),
    });
  }

  /** Replace the vault with an encrypted backup. The caller must then unlock with the backup's passcode. */
  async restoreEncrypted(json: string): Promise<void> {
    const data = JSON.parse(json);
    if (data.format !== "transformation-coach-backup" || !data.meta) throw new Error("Not a Transformation Coach backup");
    await this.wipe();
    const db = await this.conn();
    const tx = db.transaction(["records", "blobs", "meta"], "readwrite");
    tx.objectStore("meta").put({
      k: "vault",
      salt: fromB64(data.meta.salt),
      iterations: data.meta.iterations,
      iv: fromB64(data.meta.iv),
      ct: fromB64(data.meta.ct).buffer,
      failed_attempts: 0,
      locked_until: 0,
    } satisfies VaultMeta);
    for (const r of data.records)
      tx.objectStore("records").put({ id: r.id, table: r.table, iv: fromB64(r.iv), ct: fromB64(r.ct).buffer });
    for (const b of data.blobs ?? [])
      tx.objectStore("blobs").put({
        id: b.id,
        iv: fromB64(b.iv),
        ct: fromB64(b.ct).buffer,
        mimeIv: fromB64(b.mimeIv),
        mimeCt: fromB64(b.mimeCt).buffer,
      });
    await txDone(tx);
  }

  /** Permanently delete every record, photo and the passcode verifier. */
  async wipe(): Promise<void> {
    const db = await this.conn();
    const tx = db.transaction(["records", "blobs", "meta"], "readwrite");
    tx.objectStore("records").clear();
    tx.objectStore("blobs").clear();
    tx.objectStore("meta").clear();
    await txDone(tx);
    this.key = null;
  }
}

export const vault = new Vault();
