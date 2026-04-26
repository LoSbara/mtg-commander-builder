import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(__dirname, '..', 'data', 'mtg_cache.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export function initDb(): void {
  const database = getDb();

  // Cache delle carte Scryfall (evita richieste ripetute)
  database.exec(`
    CREATE TABLE IF NOT EXISTS card_cache (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,            -- JSON serializzato della carta
      cached_at INTEGER NOT NULL     -- Unix timestamp
    );

    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      commander_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deck_cards (
      deck_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      is_commander INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (deck_id, card_id),
      FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE
    );
  `);

  // Migrazioni (sicure da eseguire più volte: ignorano errori se la colonna esiste già)
  try { database.exec(`ALTER TABLE deck_cards ADD COLUMN is_maybeboard INTEGER NOT NULL DEFAULT 0`); } catch { /* già presente */ }
  try { database.exec(`ALTER TABLE decks ADD COLUMN share_token TEXT`); } catch { /* già presente */ }

  console.log('Database SQLite inizializzato.');
}
