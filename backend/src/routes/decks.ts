import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../models/db';
import type { Deck } from 'shared';
import {
  addCardToDeck,
  removeCardFromDeck,
  validateDeck,
  computeDeckStats,
  getDeckCardRows,
  getMaybeboardRows,
  addToMaybeboard,
  removeFromMaybeboard,
  moveMaybeboardToMain,
  hydrateCards,
  formatDeckExport,
  type ExportFormat,
} from '../services/deckService';
import { parseDeckList } from '../services/importService';
import { searchCards } from '../services/scryfallService';

const router = Router();

// GET /api/decks/public/:token  — vista pubblica di un mazzo condiviso
router.get('/public/:token', (req, res) => {
  const db = getDb();
  const deck = db
    .prepare('SELECT * FROM decks WHERE share_token = ?')
    .get(req.params.token) as Record<string, unknown> | undefined;

  if (!deck) {
    return res.status(404).json({ message: 'Mazzo non trovato o link non valido.' });
  }

  const cards = getDeckCardRows(deck.id as string);
  const maybeboard = getMaybeboardRows(deck.id as string);
  return res.json({ ...deck, cards, maybeboard });
});

// GET /api/decks
router.get('/', (_req, res) => {
  const db = getDb();
  const decks = db.prepare('SELECT * FROM decks ORDER BY updated_at DESC').all() as Record<string, unknown>[];
  const result = decks.map((deck) => ({
    ...deck,
    cards: getDeckCardRows(deck.id as string),
  }));
  return res.json(result);
});

// GET /api/decks/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const deck = db.prepare('SELECT * FROM decks WHERE id = ?').get(req.params.id);

  if (!deck) {
    return res.status(404).json({ message: 'Mazzo non trovato.' });
  }

  const cards = getDeckCardRows(req.params.id);
  const maybeboard = getMaybeboardRows(req.params.id);
  return res.json({ ...deck, cards, maybeboard });
});

// POST /api/decks
router.post('/', (req, res) => {
  const { name, description, commander_id } = req.body as Partial<Deck & { commander_id: string }>;

  if (!name || !commander_id) {
    return res.status(400).json({ message: 'name e commander_id sono obbligatori.' });
  }

  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  db.prepare(
    'INSERT INTO decks (id, name, description, commander_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name, description ?? null, commander_id, now, now);

  // Aggiunge automaticamente il commander come prima carta del mazzo
  addCardToDeck(id, commander_id, 1, true);

  return res.status(201).json({ id, name, description, commander_id, created_at: now, updated_at: now });
});

// PUT /api/decks/:id
router.put('/:id', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM decks WHERE id = ?').get(req.params.id);

  if (!existing) {
    return res.status(404).json({ message: 'Mazzo non trovato.' });
  }

  const { name, description } = req.body as Partial<Deck>;
  const now = new Date().toISOString();

  db.prepare(
    'UPDATE decks SET name = COALESCE(?, name), description = COALESCE(?, description), updated_at = ? WHERE id = ?'
  ).run(name ?? null, description ?? null, now, req.params.id);

  return res.json({ id: req.params.id, updated_at: now });
});

// DELETE /api/decks/:id
router.delete('/:id', (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM decks WHERE id = ?').run(req.params.id);

  if (result.changes === 0) {
    return res.status(404).json({ message: 'Mazzo non trovato.' });
  }

  return res.status(204).send();
});

// ─── Gestione carte nel mazzo ──────────────────────────────────────────────

// POST /api/decks/:id/cards  — aggiunge una carta
router.post('/:id/cards', (req, res) => {
  const db = getDb();
  const deck = db.prepare('SELECT id FROM decks WHERE id = ?').get(req.params.id);

  if (!deck) {
    return res.status(404).json({ message: 'Mazzo non trovato.' });
  }

  const { card_id, quantity = 1, is_commander = false } = req.body as {
    card_id?: string;
    quantity?: number;
    is_commander?: boolean;
  };

  if (!card_id) {
    return res.status(400).json({ message: 'card_id è obbligatorio.' });
  }
  if (typeof quantity !== 'number' || quantity < 1) {
    return res.status(400).json({ message: 'quantity deve essere un intero >= 1.' });
  }

  addCardToDeck(req.params.id, card_id, quantity, is_commander);
  return res.status(201).json({ deck_id: req.params.id, card_id, quantity, is_commander });
});

// DELETE /api/decks/:id/cards/:cardId  — rimuove una carta
router.delete('/:id/cards/:cardId', (req, res) => {
  const removed = removeCardFromDeck(req.params.id, req.params.cardId);

  if (!removed) {
    return res.status(404).json({ message: 'Carta non trovata nel mazzo.' });
  }

  return res.status(204).send();
});

// GET /api/decks/:id/stats  — statistiche mazzo
router.get('/:id/stats', async (req, res) => {
  const db = getDb();
  const deck = db.prepare('SELECT id FROM decks WHERE id = ?').get(req.params.id);

  if (!deck) {
    return res.status(404).json({ message: 'Mazzo non trovato.' });
  }

  try {
    const stats = await computeDeckStats(req.params.id);
    return res.json(stats);
  } catch (err: unknown) {
    console.error('Errore calcolo stats:', err);
    return res.status(500).json({ message: 'Errore nel calcolo delle statistiche.' });
  }
});

// GET /api/decks/:id/validate  — validazione Commander
router.get('/:id/validate', async (req, res) => {
  const db = getDb();
  const deck = db.prepare('SELECT id FROM decks WHERE id = ?').get(req.params.id);

  if (!deck) {
    return res.status(404).json({ message: 'Mazzo non trovato.' });
  }

  try {
    const result = await validateDeck(req.params.id);
    return res.json(result);
  } catch (err: unknown) {
    console.error('Errore validazione mazzo:', err);
    return res.status(500).json({ message: 'Errore durante la validazione.' });
  }
});

// POST /api/decks/:id/import  — importa carte da testo (MTGO/Arena/Moxfield/plain)
router.post('/:id/import', async (req, res) => {
  const db = getDb();
  const deck = db
    .prepare('SELECT id, commander_id FROM decks WHERE id = ?')
    .get(req.params.id) as { id: string; commander_id: string } | undefined;

  if (!deck) {
    return res.status(404).json({ message: 'Mazzo non trovato.' });
  }

  const { text } = req.body as { text?: string };
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ message: 'Campo "text" obbligatorio.' });
  }

  const parsed = parseDeckList(text);
  if (parsed.length === 0) {
    return res.status(400).json({ message: 'Nessuna carta riconosciuta nel testo.' });
  }

  const existingRows = getDeckCardRows(deck.id);
  const existingIds = new Set(existingRows.map((r) => r.card_id));

  const imported: { name: string; id: string }[] = [];
  const notFound: string[] = [];
  const skipped: string[] = [];  // già presenti nel mazzo

  // Risoluzione sequenziale (rispetta rate limit Scryfall)
  for (const entry of parsed) {
    try {
      const result = await searchCards(`!"${entry.name}"`, 1);
      const card = result.data[0];
      if (!card) {
        notFound.push(entry.name);
        continue;
      }

      // Salta il commander (già nel mazzo come is_commander)
      if (card.id === deck.commander_id) {
        skipped.push(entry.name);
        continue;
      }

      // Salta carte già presenti
      if (existingIds.has(card.id)) {
        skipped.push(entry.name);
        continue;
      }

      addCardToDeck(deck.id, card.id, entry.quantity, false);
      existingIds.add(card.id);
      imported.push({ name: card.name, id: card.id });
    } catch {
      notFound.push(entry.name);
    }
  }

  return res.json({
    imported: imported.length,
    importedCards: imported,
    notFound,
    skipped,
    total: existingIds.size,
  });
});

// ─── Maybeboard ──────────────────────────────────────────────────────────

// GET /api/decks/:id/maybeboard
router.get('/:id/maybeboard', (req, res) => {
  const db = getDb();
  const deck = db.prepare('SELECT id FROM decks WHERE id = ?').get(req.params.id);
  if (!deck) return res.status(404).json({ message: 'Mazzo non trovato.' });
  return res.json(getMaybeboardRows(req.params.id));
});

// POST /api/decks/:id/maybeboard  — aggiunge carta al maybeboard
router.post('/:id/maybeboard', (req, res) => {
  const db = getDb();
  const deck = db.prepare('SELECT id FROM decks WHERE id = ?').get(req.params.id);
  if (!deck) return res.status(404).json({ message: 'Mazzo non trovato.' });

  const { card_id, quantity = 1 } = req.body as { card_id?: string; quantity?: number };
  if (!card_id) return res.status(400).json({ message: 'card_id è obbligatorio.' });

  addToMaybeboard(req.params.id, card_id, quantity);
  return res.status(201).json({ deck_id: req.params.id, card_id, quantity, is_maybeboard: 1 });
});

// DELETE /api/decks/:id/maybeboard/:cardId  — rimuove dal maybeboard
router.delete('/:id/maybeboard/:cardId', (req, res) => {
  const removed = removeFromMaybeboard(req.params.id, req.params.cardId);
  if (!removed) return res.status(404).json({ message: 'Carta non trovata nel maybeboard.' });
  return res.status(204).send();
});

// POST /api/decks/:id/maybeboard/:cardId/move  — sposta dal maybeboard al mazzo principale
router.post('/:id/maybeboard/:cardId/move', (req, res) => {
  const moved = moveMaybeboardToMain(req.params.id, req.params.cardId);
  if (!moved) return res.status(404).json({ message: 'Carta non trovata nel maybeboard.' });
  return res.json({ deck_id: req.params.id, card_id: req.params.cardId, moved: true });
});

// ─── Condivisione mazzo ────────────────────────────────────────────────────

// POST /api/decks/:id/share  — genera un token di condivisione pubblico
router.post('/:id/share', (req, res) => {
  const db = getDb();
  const deck = db.prepare('SELECT id, share_token FROM decks WHERE id = ?').get(req.params.id) as
    | { id: string; share_token: string | null }
    | undefined;

  if (!deck) return res.status(404).json({ message: 'Mazzo non trovato.' });

  const token = deck.share_token ?? randomUUID();
  db.prepare('UPDATE decks SET share_token = ? WHERE id = ?').run(token, deck.id);

  const origin = (req.headers.origin as string) ?? `http://localhost:5173`;
  return res.json({ share_token: token, shareUrl: `${origin}/share/${token}` });
});

// DELETE /api/decks/:id/share  — rimuove il link di condivisione
router.delete('/:id/share', (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM decks WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Mazzo non trovato.' });

  db.prepare('UPDATE decks SET share_token = NULL WHERE id = ?').run(req.params.id);
  return res.status(204).send();
});

// GET /api/decks/:id/export?format=txt|mtgo|moxfield
router.get('/:id/export', async (req, res) => {
  const db = getDb();
  const deck = db
    .prepare('SELECT id, name, commander_id FROM decks WHERE id = ?')
    .get(req.params.id) as { id: string; name: string; commander_id: string } | undefined;

  if (!deck) {
    return res.status(404).json({ message: 'Mazzo non trovato.' });
  }

  const format = (req.query.format as string) ?? 'txt';
  if (!['txt', 'mtgo', 'moxfield'].includes(format)) {
    return res.status(400).json({ message: 'Formato non supportato. Usa: txt, mtgo, moxfield.' });
  }

  try {
    const rows = getDeckCardRows(req.params.id);
    const cardMap = await hydrateCards(rows);
    const text = formatDeckExport(deck.name, deck.commander_id, rows, cardMap, format as ExportFormat);
    const safeFilename = deck.name.replace(/[^a-z0-9\-_\s]/gi, '').replace(/\s+/g, '_').toLowerCase();

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}-${format}.txt"`);
    return res.send(text);
  } catch (err: unknown) {
    console.error('Errore export:', err);
    return res.status(500).json({ message: "Errore durante l'export." });
  }
});

export default router;
