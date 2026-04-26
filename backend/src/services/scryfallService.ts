import axios, { AxiosError } from 'axios';
import type { Card, ScryfallSearchResponse } from 'shared';

const SCRYFALL_BASE = 'https://api.scryfall.com';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 ore

// ─── Axios instance con headers obbligatori ────────────────────────────────

const scryfall = axios.create({
  baseURL: SCRYFALL_BASE,
  headers: {
    'User-Agent': 'MTGCommanderDeckCreator/0.1 (github.com/mtg-deck-creator)',
    Accept: 'application/json',
  },
});

// ─── Rate limiter ──────────────────────────────────────────────────────────

const lastRequestAt: Record<'slow' | 'fast', number> = { slow: 0, fast: 0 };

async function throttle(type: 'slow' | 'fast'): Promise<void> {
  const minGap = type === 'slow' ? 500 : 100;
  const elapsed = Date.now() - lastRequestAt[type];
  if (elapsed < minGap) {
    await new Promise<void>((resolve) => setTimeout(resolve, minGap - elapsed));
  }
  lastRequestAt[type] = Date.now();
}

// ─── Cache in memoria (Map con TTL) ───────────────────────────────────────
// Sostituisce SQLite/better-sqlite3 — funziona anche in produzione senza
// dipendenze native. I dati durano per tutta la sessione del processo.

const memCache = new Map<string, { card: Card; cachedAt: number }>();

function getCachedCard(id: string): Card | null {
  const entry = memCache.get(id);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    memCache.delete(id);
    return null;
  }
  return entry.card;
}

function setCachedCard(card: Card): void {
  memCache.set(card.id, { card, cachedAt: Date.now() });
}

// ─── Gestione errori Scryfall ──────────────────────────────────────────────

function handleScryfallError(err: unknown): never {
  if (err instanceof AxiosError) {
    const status = err.response?.status;
    if (status === 429) {
      throw new Error('RATE_LIMITED: Troppe richieste a Scryfall. Riprova tra qualche secondo.');
    }
    if (status === 404) {
      throw new Error('NOT_FOUND: Carta non trovata su Scryfall.');
    }
    const scryfallMsg = (err.response?.data as Record<string, unknown>)?.details;
    if (scryfallMsg) throw new Error(`SCRYFALL_ERROR: ${scryfallMsg}`);
  }
  throw err;
}

// ─── Scryfall API wrappers ─────────────────────────────────────────────────

export async function searchCards(
  query: string,
  page = 1
): Promise<ScryfallSearchResponse> {
  await throttle('slow'); // /cards/search: limite 2 req/s
  try {
    const response = await scryfall.get<ScryfallSearchResponse>('/cards/search', {
      params: { q: query, page, format: 'json' },
    });
    return response.data;
  } catch (err) {
    return handleScryfallError(err);
  }
}

export async function getCardById(id: string): Promise<Card> {
  const cached = getCachedCard(id);
  if (cached) return cached;

  await throttle('fast'); // /cards/:id: limite 10 req/s
  try {
    const response = await scryfall.get<Card>(`/cards/${id}`);
    setCachedCard(response.data);
    return response.data;
  } catch (err) {
    return handleScryfallError(err);
  }
}

export async function searchCommanders(query: string): Promise<ScryfallSearchResponse> {
  // is:commander filtra solo le carte legali come commander
  const commanderQuery = `(${query}) is:commander`;
  return searchCards(commanderQuery);
}
