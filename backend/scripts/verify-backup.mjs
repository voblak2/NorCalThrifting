// scripts/verify-backup.mjs — Restore a backup into a throwaway local SQLite
// file and compare per-table row counts against production and the manifest.
//
// Usage (from backend/):  node scripts/verify-backup.mjs <backupDir>
//
// Restores into ./data/backup-verify.db (relative path — the native libsql
// binding rejects Git-Bash POSIX absolute paths). Production is only read.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';

const backupDir = process.argv[2];
if (!backupDir) {
  console.error('Usage: node scripts/verify-backup.mjs <backupDir>');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(backupDir, 'manifest.json'), 'utf8'));
const restorePath = './data/backup-verify.db';
for (const f of [restorePath, `${restorePath}-wal`, `${restorePath}-shm`]) fs.rmSync(f, { force: true });

const local = createClient({ url: `file:${restorePath}` });
await local.executeMultiple(fs.readFileSync(path.join(backupDir, 'backup.sql'), 'utf8'));

const prod = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

const objects = async (c) =>
  (await c.execute(`SELECT type || ':' || name AS o FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY 1`)).rows.map((r) => r.o);
const count = async (c, t) => Number((await c.execute(`SELECT COUNT(*) AS n FROM "${t.replace(/"/g, '""')}"`)).rows[0].n);

let problems = 0;
console.log(`${'table'.padEnd(24)} ${'prod'.padStart(7)} ${'backup'.padStart(7)} ${'restored'.padStart(8)}`);
for (const table of Object.keys(manifest.counts)) {
  const p = await count(prod, table);
  const b = manifest.counts[table].rows;
  const r = await count(local, table);
  const ok = p === b && b === r;
  if (!ok) problems++;
  console.log(`${table.padEnd(24)} ${String(p).padStart(7)} ${String(b).padStart(7)} ${String(r).padStart(8)}  ${ok ? 'OK' : 'MISMATCH'}`);
}

const [prodObjs, localObjs] = [await objects(prod), await objects(local)];
const missing = prodObjs.filter((o) => !localObjs.includes(o));
const extra = localObjs.filter((o) => !prodObjs.includes(o));
if (missing.length || extra.length) {
  problems++;
  console.log(`Schema objects missing from restore: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`);
} else {
  console.log(`Schema: all ${prodObjs.length} tables/indexes match`);
}

const integrity = (await local.execute('PRAGMA integrity_check')).rows[0][0];
console.log(`Restored DB integrity_check: ${integrity}`);
if (integrity !== 'ok') problems++;

local.close();
console.log(problems ? `\n✗ ${problems} problem(s) found` : '\n✓ Backup verified');
process.exit(problems ? 2 : 0);
