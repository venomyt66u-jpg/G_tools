import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  address TEXT NOT NULL UNIQUE,
  enc_blob TEXT NOT NULL,           -- JSON EncryptedBlob; never sent to client
  is_master INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,               -- mint | fund | list | accept_offer
  chain TEXT NOT NULL,
  wallet_address TEXT,
  collection TEXT,
  hash TEXT,
  status TEXT NOT NULL,             -- pending | confirmed | failed
  detail TEXT,                      -- JSON
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL,              -- INFO|SUCCESS|WARNING|ERROR|BLOCKCHAIN|MINT|WALLET|LISTING
  wallet TEXT,
  collection TEXT,
  tx_hash TEXT,
  status TEXT,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_logs_created ON logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at DESC);
`;

// Lazy singleton: the native binding is only loaded the first time the DB is
// actually used, not at module import. This keeps `next build` (which evaluates
// modules) from requiring the compiled binary, and lets the server boot fast.
type DBType = InstanceType<typeof Database>;
let _db: DBType | null = null;

function db(): DBType {
  if (_db) return _db;
  const DATA_DIR = process.env.GTOOLS_DATA_DIR || path.join(process.cwd(), ".data");
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const inst = new Database(path.join(DATA_DIR, "gtools.db"));
  inst.pragma("journal_mode = WAL");
  inst.pragma("foreign_keys = ON");
  inst.exec(SCHEMA);
  _db = inst;
  return inst;
}

export interface WalletRow {
  id: number;
  label: string;
  address: string;
  enc_blob: string;
  is_master: number;
  created_at: number;
}

export function addLog(entry: {
  level: string;
  wallet?: string;
  collection?: string;
  tx_hash?: string;
  status?: string;
  message: string;
}) {
  db().prepare(
    `INSERT INTO logs (level, wallet, collection, tx_hash, status, message, created_at)
     VALUES (@level, @wallet, @collection, @tx_hash, @status, @message, @created_at)`
  ).run({
    level: entry.level,
    wallet: entry.wallet ?? null,
    collection: entry.collection ?? null,
    tx_hash: entry.tx_hash ?? null,
    status: entry.status ?? null,
    message: entry.message,
    created_at: Date.now(),
  });
}

export function getLogs(opts: { limit?: number; level?: string; q?: string } = {}) {
  const limit = Math.min(opts.limit ?? 500, 2000);
  let sql = `SELECT * FROM logs`;
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  if (opts.level && opts.level !== "ALL") {
    where.push(`level = @level`);
    params.level = opts.level;
  }
  if (opts.q) {
    where.push(`(message LIKE @q OR wallet LIKE @q OR collection LIKE @q OR tx_hash LIKE @q)`);
    params.q = `%${opts.q}%`;
  }
  if (where.length) sql += ` WHERE ${where.join(" AND ")}`;
  sql += ` ORDER BY created_at DESC LIMIT ${limit}`;
  return db().prepare(sql).all(params);
}

export function recordTx(t: {
  kind: string;
  chain: string;
  wallet_address?: string;
  collection?: string;
  hash?: string;
  status: string;
  detail?: unknown;
}): number {
  const r = db()
    .prepare(
      `INSERT INTO transactions (kind, chain, wallet_address, collection, hash, status, detail, created_at)
       VALUES (@kind,@chain,@wallet_address,@collection,@hash,@status,@detail,@created_at)`
    )
    .run({
      kind: t.kind,
      chain: t.chain,
      wallet_address: t.wallet_address ?? null,
      collection: t.collection ?? null,
      hash: t.hash ?? null,
      status: t.status,
      detail: t.detail ? JSON.stringify(t.detail) : null,
      created_at: Date.now(),
    });
  return Number(r.lastInsertRowid);
}

export function updateTx(id: number, fields: { hash?: string; status?: string; detail?: unknown }) {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  if (fields.hash !== undefined) { sets.push("hash=@hash"); params.hash = fields.hash; }
  if (fields.status !== undefined) { sets.push("status=@status"); params.status = fields.status; }
  if (fields.detail !== undefined) { sets.push("detail=@detail"); params.detail = JSON.stringify(fields.detail); }
  if (!sets.length) return;
  db().prepare(`UPDATE transactions SET ${sets.join(", ")} WHERE id=@id`).run(params);
}

export function getTransactions(limit = 200) {
  return db().prepare(`SELECT * FROM transactions ORDER BY created_at DESC LIMIT ?`).all(Math.min(limit, 1000));
}

// Wallet CRUD. enc_blob is NEVER returned to the client layer — see wallets API.
export function insertWallet(w: { label: string; address: string; enc_blob: string }) {
  return db()
    .prepare(
      `INSERT INTO wallets (label, address, enc_blob, is_master, created_at)
       VALUES (@label, @address, @enc_blob, 0, @created_at)`
    )
    .run({ ...w, created_at: Date.now() });
}
export function listWallets(): WalletRow[] {
  return db().prepare(`SELECT * FROM wallets ORDER BY id ASC`).all() as WalletRow[];
}
export function getWalletByAddress(address: string): WalletRow | undefined {
  return db().prepare(`SELECT * FROM wallets WHERE address = ?`).get(address) as WalletRow | undefined;
}
export function renameWallet(id: number, label: string) {
  db().prepare(`UPDATE wallets SET label=? WHERE id=?`).run(label, id);
}
export function deleteWallet(id: number) {
  db().prepare(`DELETE FROM wallets WHERE id=?`).run(id);
}
export function setMaster(id: number) {
  const tx = db().transaction(() => {
    db().prepare(`UPDATE wallets SET is_master=0`).run();
    db().prepare(`UPDATE wallets SET is_master=1 WHERE id=?`).run(id);
  });
  tx();
}

export default db;  // db() accessor
