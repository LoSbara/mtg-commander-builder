// SQLite rimosso — la cache Scryfall è ora in memoria (Map con TTL in scryfallService.ts).
// I mazzi e le carte del mazzo sono su PostgreSQL (pgDb.ts).

export function initDb(): void {
  // Nessuna operazione richiesta: SQLite non è più usato.
  console.log('Cache Scryfall: in-memory (no SQLite).');
}
