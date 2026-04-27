import { Router } from 'express';
import { randomUUID } from 'crypto';
import { getDb } from '../models/dbAdapter';
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
import { searchCards, getCardById } from '../services/scryfallService';
import { findCombosForDeck } from '../services/comboService';

const router = Router();

// GET /api/decks/public/:token  — vista pubblica di un mazzo condiviso
router.get('/public/:token', async (req, res) => {
  const pool = getDb();
  const deckRes = await pool.query('SELECT * FROM decks WHERE share_token = $1', [req.params.token]);
  const deck = deckRes.rows[0] as Record<string, unknown> | undefined;

  if (!deck) {
    return res.status(404).json({ message: 'Mazzo non trovato o link non valido.' });
  }

  const cards = await getDeckCardRows(deck.id as string);
  const maybeboard = await getMaybeboardRows(deck.id as string);
  return res.json({ ...deck, cards, maybeboard });
});

// GET /api/decks
router.get('/', async (_req, res) => {
  const pool = getDb();
  const decksRes = await pool.query('SELECT * FROM decks ORDER BY updated_at DESC');
  const result = await Promise.all(
    decksRes.rows.map(async (deck: Record<string, unknown>) => ({
      ...deck,
      cards: await getDeckCardRows(deck.id as string),
    }))
  );
  return res.json(result);
});

// GET /api/decks/:id
router.get('/:id', async (req, res) => {
  const pool = getDb();
  const deckRes = await pool.query('SELECT * FROM decks WHERE id = $1', [req.params.id]);
  const deck = deckRes.rows[0];

  if (!deck) {
    return res.status(404).json({ message: 'Mazzo non trovato.' });
  }

  const cards = await getDeckCardRows(req.params.id);
  const maybeboard = await getMaybeboardRows(req.params.id);
  return res.json({ ...deck, cards, maybeboard });
});

// POST /api/decks
router.post('/', async (req, res) => {
  const { name, description, commander_id } = req.body as Partial<Deck & { commander_id: string }>;

  if (!name || !commander_id) {
    return res.status(400).json({ message: 'name e commander_id sono obbligatori.' });
  }

  const pool = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  await pool.query(
    'INSERT INTO decks (id, name, description, commander_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, name, description ?? null, commander_id, now, now]
  );

  // Aggiunge automaticamente il commander come prima carta del mazzo
  await addCardToDeck(id, commander_id, 1, true);

  return res.status(201).json({ id, name, description, commander_id, created_at: now, updated_at: now });
});

// PUT /api/decks/:id
router.put('/:id', async (req, res) => {
  const pool = getDb();
  const existing = await pool.query('SELECT id FROM decks WHERE id = $1', [req.params.id]);

  if (existing.rows.length === 0) {
    return res.status(404).json({ message: 'Mazzo non trovato.' });
  }

  const { name, description } = req.body as Partial<Deck>;
  const now = new Date().toISOString();

  await pool.query(
    'UPDATE decks SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = $3 WHERE id = $4',
    [name ?? null, description ?? null, now, req.params.id]
  );

  return res.json({ id: req.params.id, updated_at: now });
});

// DELETE /api/decks/:id
router.delete('/:id', async (req, res) => {
  const pool = getDb();
  const res2 = await pool.query('DELETE FROM decks WHERE id = $1', [req.params.id]);

  if ((res2.rowCount ?? 0) === 0) {
    return res.status(404).json({ message: 'Mazzo non trovato.' });
  }

  return res.status(204).send();
});

// ─── Gestione carte nel mazzo ──────────────────────────────────────────────

// POST /api/decks/:id/cards  — aggiunge una carta
router.post('/:id/cards', async (req, res) => {
  const pool = getDb();
  const deck = await pool.query('SELECT id FROM decks WHERE id = $1', [req.params.id]);

  if (deck.rows.length === 0) {
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

  await addCardToDeck(req.params.id, card_id, quantity, is_commander);
  return res.status(201).json({ deck_id: req.params.id, card_id, quantity, is_commander });
});

// DELETE /api/decks/:id/cards/:cardId  — rimuove una carta
router.delete('/:id/cards/:cardId', async (req, res) => {
  const removed = await removeCardFromDeck(req.params.id, req.params.cardId);

  if (!removed) {
    return res.status(404).json({ message: 'Carta non trovata nel mazzo.' });
  }

  return res.status(204).send();
});

// GET /api/decks/:id/stats  — statistiche mazzo
router.get('/:id/stats', async (req, res) => {
  const pool = getDb();
  const deck = await pool.query('SELECT id FROM decks WHERE id = $1', [req.params.id]);

  if (deck.rows.length === 0) {
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
  const pool = getDb();
  const deck = await pool.query('SELECT id FROM decks WHERE id = $1', [req.params.id]);

  if (deck.rows.length === 0) {
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

// GET /api/decks/:id/combos  — ricerca combo Commander Spellbook
router.get('/:id/combos', async (req, res) => {
  const pool = getDb();
  const deckRes = await pool.query<{ commander_id: string }>(
    'SELECT commander_id FROM decks WHERE id = $1',
    [req.params.id]
  );
  const deckRow = deckRes.rows[0];

  if (!deckRow) {
    return res.status(404).json({ message: 'Mazzo non trovato.' });
  }

  try {
    const rows = await getDeckCardRows(req.params.id);
    const cardMap = await hydrateCards(rows);

    // Nomi di tutte le carte nel mazzo
    const cardNames: string[] = [];
    for (const row of rows) {
      const card = cardMap.get(row.card_id);
      if (card) cardNames.push(card.name);
    }

    // Color identity dal commander
    const commander = await getCardById(deckRow.commander_id);
    const colorIdentity = commander.color_identity as string[];

    const combos = await findCombosForDeck(cardNames, colorIdentity);
    return res.json(combos);
  } catch (err: unknown) {
    console.error('Errore ricerca combo:', err);
    return res.status(500).json({ message: 'Errore nella ricerca dei combo.' });
  }
});

// POST /api/decks/:id/import  — importa carte da testo (MTGO/Arena/Moxfield/plain)
router.post('/:id/import', async (req, res) => {
  const pool = getDb();
  const deckRes = await pool.query<{ id: string; commander_id: string }>(
    'SELECT id, commander_id FROM decks WHERE id = $1',
    [req.params.id]
  );
  const deck = deckRes.rows[0];

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

  const existingRows = await getDeckCardRows(deck.id);
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

      await addCardToDeck(deck.id, card.id, entry.quantity, false);
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
router.get('/:id/maybeboard', async (req, res) => {
  const pool = getDb();
  const deck = await pool.query('SELECT id FROM decks WHERE id = $1', [req.params.id]);
  if (deck.rows.length === 0) return res.status(404).json({ message: 'Mazzo non trovato.' });
  return res.json(await getMaybeboardRows(req.params.id));
});

// POST /api/decks/:id/maybeboard  — aggiunge carta al maybeboard
router.post('/:id/maybeboard', async (req, res) => {
  const pool = getDb();
  const deck = await pool.query('SELECT id FROM decks WHERE id = $1', [req.params.id]);
  if (deck.rows.length === 0) return res.status(404).json({ message: 'Mazzo non trovato.' });

  const { card_id, quantity = 1 } = req.body as { card_id?: string; quantity?: number };
  if (!card_id) return res.status(400).json({ message: 'card_id è obbligatorio.' });

  await addToMaybeboard(req.params.id, card_id, quantity);
  return res.status(201).json({ deck_id: req.params.id, card_id, quantity, is_maybeboard: 1 });
});

// DELETE /api/decks/:id/maybeboard/:cardId  — rimuove dal maybeboard
router.delete('/:id/maybeboard/:cardId', async (req, res) => {
  const removed = await removeFromMaybeboard(req.params.id, req.params.cardId);
  if (!removed) return res.status(404).json({ message: 'Carta non trovata nel maybeboard.' });
  return res.status(204).send();
});

// POST /api/decks/:id/maybeboard/:cardId/move  — sposta dal maybeboard al mazzo principale
router.post('/:id/maybeboard/:cardId/move', async (req, res) => {
  const moved = await moveMaybeboardToMain(req.params.id, req.params.cardId);
  if (!moved) return res.status(404).json({ message: 'Carta non trovata nel maybeboard.' });
  return res.json({ deck_id: req.params.id, card_id: req.params.cardId, moved: true });
});

// ─── Condivisione mazzo ────────────────────────────────────────────────────

// POST /api/decks/:id/share  — genera un token di condivisione pubblico
router.post('/:id/share', async (req, res) => {
  const pool = getDb();
  const deckRes = await pool.query<{ id: string; share_token: string | null }>(
    'SELECT id, share_token FROM decks WHERE id = $1',
    [req.params.id]
  );
  const deck = deckRes.rows[0];

  if (!deck) return res.status(404).json({ message: 'Mazzo non trovato.' });

  const token = deck.share_token ?? randomUUID();
  await pool.query('UPDATE decks SET share_token = $1 WHERE id = $2', [token, deck.id]);

  const origin = (req.headers.origin as string) ?? `http://localhost:5173`;
  return res.json({ share_token: token, shareUrl: `${origin}/share/${token}` });
});

// DELETE /api/decks/:id/share  — rimuove il link di condivisione
router.delete('/:id/share', async (req, res) => {
  const pool = getDb();
  const existing = await pool.query('SELECT id FROM decks WHERE id = $1', [req.params.id]);
  if (existing.rows.length === 0) return res.status(404).json({ message: 'Mazzo non trovato.' });

  await pool.query('UPDATE decks SET share_token = NULL WHERE id = $1', [req.params.id]);
  return res.status(204).send();
});

// GET /api/decks/:id/export?format=txt|mtgo|moxfield
router.get('/:id/export', async (req, res) => {
  const pool = getDb();
  const deckRes = await pool.query<{ id: string; name: string; commander_id: string }>(
    'SELECT id, name, commander_id FROM decks WHERE id = $1',
    [req.params.id]
  );
  const deck = deckRes.rows[0];

  if (!deck) {
    return res.status(404).json({ message: 'Mazzo non trovato.' });
  }

  const format = (req.query.format as string) ?? 'txt';
  if (!['txt', 'mtgo', 'moxfield'].includes(format)) {
    return res.status(400).json({ message: 'Formato non supportato. Usa: txt, mtgo, moxfield.' });
  }

  try {
    const rows = await getDeckCardRows(req.params.id);
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
