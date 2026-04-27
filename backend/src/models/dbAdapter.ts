/**
 * dbAdapter.ts — Astrae l'accesso al DB unificando PostgreSQL (produzione) e
 * SQLite (sviluppo locale, quando DATABASE_URL non è impostata).
 *
 * Entrambi espongono una singola funzione:
 *   dbQuery<T>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>
 *
 * Il SQL usato nel codebase è scritto in dialetto PostgreSQL ($1, $2, …).
 * L'adapter SQLite converte i placeholder $N in ? prima di eseguire la query.
 */

import type { Pool } from 'pg';

// Risultato normalizzato (sottoinsieme di pg.QueryResult)
export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export type DbAdapter = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
};

// ─── Adattatore PostgreSQL ────────────────────────────────────────────────

function pgAdapter(pool: Pool): DbAdapter {
  return {
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      const res = await pool.query(sql, params);
      return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
    },
  };
}

// ─── Adattatore SQLite ────────────────────────────────────────────────────

function pgToSqlite(sql: string): string {
  // Converte $1, $2, … → ?
  return sql.replace(/\$\d+/g, '?');
}

function sqliteAdapter(dbPath: string): DbAdapter {
  // Import dinamico così better-sqlite3 non viene caricato in produzione (dove non è installato)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Inizializza schema
  db.exec(`
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

  return {
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      const converted = pgToSqlite(sql);
      const trimmed = sql.trim().toUpperCase();

      // Statements che non ritornano righe
      const isWrite =
        trimmed.startsWith('INSERT') ||
        trimmed.startsWith('UPDATE') ||
        trimmed.startsWith('DELETE') ||
        trimmed.startsWith('CREATE') ||
        trimmed.startsWith('DROP');

      if (isWrite) {
        const stmt = db.prepare(converted);
        const info = stmt.run(...params);
        return { rows: [] as T[], rowCount: info.changes };
      } else {
        const stmt = db.prepare(converted);
        const rows = stmt.all(...params) as T[];
        return { rows, rowCount: rows.length };
      }
    },
  };
}

// ─── Factory globale ──────────────────────────────────────────────────────

let _adapter: DbAdapter | null = null;

export function getDb(): DbAdapter {
  if (!_adapter) {
    throw new Error('DB non inizializzato — chiama initDbAdapter() prima di usare getDb()');
  }
  return _adapter;
}

export async function initDbAdapter(): Promise<void> {
  if (process.env.DATABASE_URL) {
    // Produzione: PostgreSQL
    const { Pool } = await import('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost')
        ? false
        : { rejectUnauthorized: false },
    });

    // Inizializza schema PG
    const client = await pool.connect();
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

    _adapter = pgAdapter(pool);
  } else {
    // Sviluppo locale: SQLite
    const path = await import('path');
    const dbPath = path.join(process.cwd(), 'data', 'local.db');

    // Crea la directory se non esiste
    const fs = await import('fs');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    _adapter = sqliteAdapter(dbPath);
    console.log(`SQLite locale inizializzato: ${dbPath}`);
  }
}
