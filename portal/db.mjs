// DevCan Games account database (SQLite, one file under DEVCAN_DIR/db). Nightly copies go to DEVCAN_DIR/backups (14 kept).
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

export function openDb(dataDir) {
  const dir = path.join(dataDir, 'db');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = new Database(path.join(dir, 'devcan.sqlite'));
  db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON'); db.pragma('busy_timeout = 3000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, email_verified INTEGER NOT NULL DEFAULT 0,
      pass_hash TEXT, google_sub TEXT UNIQUE, name TEXT NOT NULL UNIQUE, age_ok_at TEXT NOT NULL, terms_ok_at TEXT NOT NULL,
      created_at TEXT NOT NULL, last_login_at TEXT);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS tokens (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, kind TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS saves (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, game TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL,
      updated_at TEXT NOT NULL, PRIMARY KEY (user_id, game, key));`);
  scheduleBackups(db, path.join(dataDir, 'backups'));
  return db;
}

function scheduleBackups(db, dir) {
  const run = async () => {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const day = new Date().toISOString().slice(0, 10), file = path.join(dir, `devcan-${day}.sqlite`);
      if (!fs.existsSync(file)) { await db.backup(file); fs.chmodSync(file, 0o600); }
      const old = fs.readdirSync(dir).filter((f) => /^devcan-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort().slice(0, -14);
      for (const f of old) fs.unlinkSync(path.join(dir, f));
      db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
      db.prepare('DELETE FROM tokens WHERE expires_at < ?').run(Date.now());
    } catch (err) { console.error('backup failed', err); }
  };
  setTimeout(run, 60_000).unref(); setInterval(run, 6 * 3600_000).unref(); // a copy per day, checked every 6 hours
}
