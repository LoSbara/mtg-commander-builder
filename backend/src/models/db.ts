import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'mtg_cache.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function initDb(): void {
  const database = getDb();

  // Soltanto la cache delle carte Scryfall rimane in SQLite
  // Mazzi e carte del mazzo sono su PostgreSQL (pgDb.ts)
  database.exec(`
    CREATE TABLE IF NOT EXISTS card_cache (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at INTEGER NOT NULL
    );
  `);

  console.log('Database SQLite (cache) inizializzato.');
}
