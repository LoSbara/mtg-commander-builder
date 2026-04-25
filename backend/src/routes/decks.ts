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
  hydrateCards,
  formatDeckExport,
  type ExportFormat,
} from '../services/deckService';

const router = Router();

// GET /api/decks
router.get('/', (_req, res) => {
  const db = getDb();
  const decks = db.prepare('SELECT * FROM decks ORDER BY updated_at DESC').all();
  return res.json(decks);
});

// GET /api/decks/:id
router.get('/:id', (req, res) => {
  const db = getDb();
  const deck = db.prepare('SELECT * FROM decks WHERE id = ?').get(req.params.id);

  if (!deck) {
    return res.status(404).json({ message: 'Mazzo non trovato.' });
  }

  const cards = getDeckCardRows(req.params.id);
  return res.json({ ...deck, cards });
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
