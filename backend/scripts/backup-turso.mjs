// scripts/backup-turso.mjs — Read-only full backup of the Turso database.
//
// Usage (from backend/):  node scripts/backup-turso.mjs [outDir]
//
// Writes to C:\Backups\norcal-thrifting\<YYYY-MM-DD-HHmm>\ by default (outside
// the repo):
//   backup.sql          schema + every row as INSERTs, restorable into SQLite
//   <table>.json        JSON copy of each table's rows
//   manifest.json       per-table row counts + source DB, used by verify-backup.mjs
//
// Only SELECTs are issued against production. Rows are paged by rowid in
// chunks rather than one unbounded SELECT * — past bugs here came from silent
// row-limit defaults.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';

const PAGE_SIZE = 500;

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error('TURSO_DATABASE_URL is not set — refusing to back up the local fallback DB by accident.');
  process.exit(1);
}

const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN, intMode: 'bigint' });

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const outDir = process.argv[2] || path.join('C:\\Backups\\norcal-thrifting', stamp);
fs.mkdirSync(outDir, { recursive: true });

const quoteIdent = (name) => `"${String(name).replace(/"/g, '""')}"`;

function sqlLiteral(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
    return `X'${Buffer.from(v instanceof ArrayBuffer ? v : v.buffer).toString('hex')}'`;
  }
  return `'${String(v).replace(/'/g, "''")}'`;
}

function jsonValue(v) {
  if (typeof v === 'bigint') return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
  if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) {
    return { $base64: Buffer.from(v instanceof ArrayBuffer ? v : v.buffer).toString('base64') };
  }
  return v;
}

// Pages by rowid; falls back to LIMIT/OFFSET for WITHOUT ROWID tables.
async function* pageRows(table) {
  const t = quoteIdent(table);
  let useRowid = true;
  try {
    await client.execute(`SELECT rowid FROM ${t} LIMIT 1`);
  } catch {
    useRowid = false;
  }

  if (useRowid) {
    let last = null;
    for (;;) {
      const rs = await client.execute({
        sql: last === null
          ? `SELECT rowid AS __rowid, * FROM ${t} ORDER BY rowid LIMIT ?`
          : `SELECT rowid AS __rowid, * FROM ${t} WHERE rowid > ? ORDER BY rowid LIMIT ?`,
        args: last === null ? [PAGE_SIZE] : [last, PAGE_SIZE],
      });
      if (rs.rows.length === 0) return;
      yield { columns: rs.columns.filter((c) => c !== '__rowid'), rows: rs.rows };
      last = rs.rows[rs.rows.length - 1].__rowid;
      if (rs.rows.length < PAGE_SIZE) return;
    }
  } else {
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const rs = await client.execute({
        sql: `SELECT * FROM ${t} ORDER BY 1 LIMIT ? OFFSET ?`,
        args: [PAGE_SIZE, offset],
      });
      if (rs.rows.length === 0) return;
      yield { columns: rs.columns, rows: rs.rows };
      if (rs.rows.length < PAGE_SIZE) return;
    }
  }
}

const master = await client.execute(
  `SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name`,
);
const isInternal = (name) => name.startsWith('sqlite_') || name.startsWith('_litestream') || name.startsWith('libsql_');
const tables = master.rows.filter((r) => r.type === 'table' && !isInternal(r.name));
const others = master.rows.filter((r) => r.type !== 'table' && !isInternal(r.name));
const hasSequence = (await client.execute(`SELECT 1 FROM sqlite_master WHERE name = 'sqlite_sequence'`)).rows.length > 0;

const sqlPath = path.join(outDir, 'backup.sql');
const sql = fs.createWriteStream(sqlPath, { encoding: 'utf8' });
const write = (s) => new Promise((resolve) => (sql.write(s) ? resolve() : sql.once('drain', resolve)));

await write(`-- NorCal Thrifting Turso backup\n-- Taken: ${now.toISOString()}\n-- Source: ${url}\n`);
await write('PRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n\n');

const counts = {};
for (const { name, sql: createSql } of tables) {
  await write(`-- Table: ${name}\n${createSql};\n`);
  const json = [];
  let n = 0;
  for await (const { columns, rows } of pageRows(name)) {
    const colList = columns.map(quoteIdent).join(', ');
    for (const row of rows) {
      await write(`INSERT INTO ${quoteIdent(name)} (${colList}) VALUES (${columns.map((c) => sqlLiteral(row[c])).join(', ')});\n`);
      json.push(Object.fromEntries(columns.map((c) => [c, jsonValue(row[c])])));
      n++;
    }
  }
  await write('\n');
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(json, null, 2));

  // Cross-check the paged total against COUNT(*) so a paging bug can't silently truncate.
  const expected = Number((await client.execute(`SELECT COUNT(*) AS n FROM ${quoteIdent(name)}`)).rows[0].n);
  counts[name] = { rows: n, count: expected };
  console.log(`${name.padEnd(24)} ${String(n).padStart(7)} rows${n === expected ? '' : `  ⚠ COUNT(*) = ${expected}`}`);
}

if (hasSequence) {
  const seq = await client.execute(`SELECT name, seq FROM sqlite_sequence`);
  await write('-- AUTOINCREMENT counters\nDELETE FROM sqlite_sequence;\n');
  for (const r of seq.rows) {
    await write(`INSERT INTO sqlite_sequence (name, seq) VALUES (${sqlLiteral(r.name)}, ${sqlLiteral(r.seq)});\n`);
  }
  await write('\n');
}

// Indexes / triggers / views last, so inserts above aren't slowed by index maintenance.
for (const { type, name, sql: createSql } of others) {
  await write(`-- ${type}: ${name}\n${createSql};\n`);
}

await write('\nCOMMIT;\n');
await new Promise((resolve) => sql.end(resolve));

fs.writeFileSync(
  path.join(outDir, 'manifest.json'),
  JSON.stringify({ takenAt: now.toISOString(), source: url, counts }, null, 2),
);

const mismatched = Object.entries(counts).filter(([, c]) => c.rows !== c.count);
console.log(`\nBackup written to ${outDir}`);
if (mismatched.length) {
  console.error(`⚠ ${mismatched.length} table(s) paged a different row count than COUNT(*): ${mismatched.map(([t]) => t).join(', ')}`);
  process.exit(2);
}
