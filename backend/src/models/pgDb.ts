import { Pool } from 'pg';

let pool: Pool | null = null;

export function getPgPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL?.includes('localhost')
        ? false
        : { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function initPgDb(): Promise<void> {
  const client = await getPgPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS decks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        commander_id TEXT NOT NULL,
        share_token TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS deck_cards (
        deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        card_id TEXT NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 1,
        is_commander INTEGER NOT NULL DEFAULT 0,
        is_maybeboard INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (deck_id, card_id)
      );

      CREATE INDEX IF NOT EXISTS idx_deck_cards_deck_id ON deck_cards(deck_id);
    `);
    console.log('PostgreSQL inizializzato.');
  } finally {
    client.release();
  }
}
