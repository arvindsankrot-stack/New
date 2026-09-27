// In-memory reactive store over the encrypted vault. Reads are synchronous
// (everything is decrypted at unlock); writes update memory first, then persist.
// A future remote-sync adapter would hook in at `persist`.

import { useSyncExternalStore } from "react";
import { todayISO } from "../domain/dates";
import { TABLES, type BaseRecord, type TableName, type Tables } from "./types";
import { vault } from "./vault";

/** Single local account. Swapped for the authenticated user id if a server backend is added. */
export const LOCAL_USER = "local-user";

type Data = { [K in TableName]: Tables[K][] };

function emptyData(): Data {
  return Object.fromEntries(TABLES.map((t) => [t, []])) as unknown as Data;
}

let data: Data = emptyData();
let version = 0;
const listeners = new Set<() => void>();

function emit() {
  version++;
  for (const l of listeners) l();
}

export function uid(): string {
  return crypto.randomUUID();
}

export function loadData(map: Map<TableName, BaseRecord[]>) {
  const d = emptyData() as Record<TableName, BaseRecord[]>;
  for (const [t, recs] of map) if (t in d) d[t] = recs;
  data = d as Data;
  emit();
}

export function clearData() {
  data = emptyData();
  emit();
}

export function all<K extends TableName>(table: K): Tables[K][] {
  return data[table];
}

export function get<K extends TableName>(table: K, id: string): Tables[K] | undefined {
  return data[table].find((r) => r.id === id);
}

export type Draft<T extends BaseRecord> = Omit<T, keyof BaseRecord> & Partial<BaseRecord>;

function stamp<T extends BaseRecord>(draft: Draft<T>, existing?: T): T {
  const now = new Date().toISOString();
  return {
    ...(existing ?? {}),
    ...draft,
    id: draft.id ?? existing?.id ?? uid(),
    user_id: LOCAL_USER,
    date: draft.date ?? existing?.date ?? todayISO(),
    created_at: existing?.created_at ?? draft.created_at ?? now,
    updated_at: now,
  } as T;
}

let persistError: ((e: unknown) => void) | null = null;
export function onPersistError(fn: (e: unknown) => void) {
  persistError = fn;
}

function persist(p: Promise<void>) {
  p.catch((e) => persistError?.(e));
}

export function upsert<K extends TableName>(table: K, draft: Draft<Tables[K]>): Tables[K] {
  const list = data[table];
  const existing = draft.id ? list.find((r) => r.id === draft.id) : undefined;
  const rec = stamp<Tables[K]>(draft, existing);
  data = { ...data, [table]: existing ? list.map((r) => (r.id === rec.id ? rec : r)) : [...list, rec] };
  emit();
  persist(vault.put(table, rec));
  return rec;
}

export function upsertMany<K extends TableName>(table: K, drafts: Draft<Tables[K]>[]): Tables[K][] {
  const recs = drafts.map((d) => stamp<Tables[K]>(d, d.id ? data[table].find((r) => r.id === d.id) : undefined));
  const ids = new Set(recs.map((r) => r.id));
  data = { ...data, [table]: [...data[table].filter((r) => !ids.has(r.id)), ...recs] };
  emit();
  persist(vault.putMany(recs.map((rec) => ({ table, rec }))));
  return recs;
}

export function remove(table: TableName, id: string) {
  data = { ...data, [table]: (data[table] as BaseRecord[]).filter((r) => r.id !== id) };
  emit();
  persist(vault.remove(table, id));
}

/** Plain-JSON export of every record (photos excluded; they're exported separately). */
export function exportPlain(): string {
  return JSON.stringify(
    { format: "transformation-coach-export", version: 1, exported_at: new Date().toISOString(), data },
    null,
    2,
  );
}

/** Merge a plain export into the store (records with the same id are replaced). */
export async function importPlain(json: string): Promise<number> {
  const parsed = JSON.parse(json);
  if (parsed.format !== "transformation-coach-export") throw new Error("Not a Transformation Coach export");
  let n = 0;
  const items: { table: TableName; rec: BaseRecord }[] = [];
  for (const t of TABLES) {
    const recs: BaseRecord[] = parsed.data?.[t] ?? [];
    if (!recs.length) continue;
    const byId = new Map((data[t] as BaseRecord[]).map((r) => [r.id, r]));
    for (const r of recs) {
      if (!r.id) continue;
      byId.set(r.id, { ...r, user_id: LOCAL_USER });
      items.push({ table: t, rec: r });
      n++;
    }
    data = { ...data, [t]: [...byId.values()] };
  }
  emit();
  await vault.putMany(items);
  return n;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useTable<K extends TableName>(table: K): Tables[K][] {
  return useSyncExternalStore(subscribe, () => data[table]);
}

/** Re-render on any data change. */
export function useVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}
