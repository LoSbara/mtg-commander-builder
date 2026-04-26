import { Router } from 'express';
import { getPgPool } from '../models/pgDb';
import { getCardById } from '../services/scryfallService';
import { getDeckCardRows, hydrateCards } from '../services/deckService';
import {
  isAIAvailable,
  getAvailableModels,
  getDeckSuggestions,
  getTrimSuggestions,
  getDeckWeaknesses,
  getCardReplacement,
  getActiveProvider,
} from '../services/aiService';
import { searchCards } from '../services/scryfallService';
import { getCommanderRecommendations } from '../services/edhrecService';

const router = Router();

// GET /api/ai/status  — verifica disponibilità AI e provider attivo
router.get('/status', async (_req, res) => {
  const provider = getActiveProvider();
  const available = await isAIAvailable();
  const models = available ? await getAvailableModels() : [];
  return res.json({ available, models, provider });
});

// POST /api/ai/decks/:id/suggest  — genera suggerimenti AI per il mazzo
router.post('/decks/:id/suggest', async (req, res) => {
  const pool = getPgPool();
  const deckRes = await pool.query<{ id: string; name: string; commander_id: string }>(
    'SELECT id, name, commander_id FROM decks WHERE id = $1', [req.params.id]
  );
  const deck = deckRes.rows[0];

  if (!deck) {
    return res.status(404).json({ message: 'Mazzo non trovato.' });
  }

  const { model } = req.body as { model?: string };

  // Verifica disponibilità AI (Groq o Ollama)
  const available = await isAIAvailable();
  if (!available) {
    const provider = getActiveProvider();
    return res.status(503).json({
      message: provider === 'groq' ? 'GROQ_NOT_CONFIGURED' : 'OLLAMA_NOT_RUNNING',
      detail: provider === 'groq'
        ? 'GROQ_API_KEY non impostata. Aggiungila nel file .env'
        : 'Ollama non è in esecuzione. Avvia il servizio con: ollama serve',
    });
  }

  try {
    // Carica commander e carte attuali del mazzo
    const commander = await getCardById(deck.commander_id);
    const rows = await getDeckCardRows(deck.id);
    const cardMap = await hydrateCards(rows);
    const currentCards = Array.from(cardMap.values());

    // Recupera dati EDHREC per il commander (non blocca se non disponibili)
    const edhrecCards = await getCommanderRecommendations(commander.name);
    if (edhrecCards.length > 0) {
      console.log(`[AI] EDHREC: ${edhrecCards.length} carte disponibili per ${commander.name}`);
    }

    // Genera suggerimenti via LLM, includendo i dati EDHREC nel prompt
    const suggestions = await getDeckSuggestions(commander, currentCards, model, edhrecCards);

    // Risolve i nomi delle carte su Scryfall in modo sequenziale (rispetta rate limit)
    // e filtra le carte illegali per color identity
    const commanderColors = commander.color_identity;
    const resolvedSuggestions: { name: string; reason: string; categories: string[]; card: unknown }[] = [];

    for (const s of suggestions.suggestions.slice(0, 20)) {
      if (resolvedSuggestions.length >= 15) break;
      try {
        const result = await searchCards(`!"${s.name}"`, 1);
        const card = result.data[0] ?? null;

        // Filtra carta illegale per color identity (safety net server-side)
        if (card) {
          const cardColors: string[] = [...((card as { color_identity?: string[] }).color_identity ?? [])];
          const isLegal = cardColors.every((c) => (commanderColors as string[]).includes(c));
          if (!isLegal) {
            console.warn(`AI suggerito carta illegale filtrata: ${card.name} (${cardColors.join('')}) fuori da {${commanderColors.join('')}}`);
            continue;
          }
        }

        resolvedSuggestions.push({ ...s, card });
      } catch {
        resolvedSuggestions.push({ ...s, card: null });
      }
    }

    return res.json({
      ...suggestions,
      suggestions: resolvedSuggestions,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Errore AI suggest:', msg);

    if (msg.startsWith('OLLAMA_NOT_RUNNING') || msg.startsWith('MODEL_NOT_FOUND') ||
        msg.startsWith('GROQ_INVALID_KEY') || msg.startsWith('GROQ_RATE_LIMIT') ||
        msg.startsWith('GROQ_NOT_CONFIGURED')) {
      return res.status(503).json({ message: msg });
    }

    return res.status(500).json({ message: 'Errore durante la generazione dei suggerimenti AI.' });
  }
});

// POST /api/ai/decks/:id/trim  — AI suggerisce quali carte tagliare (mazzo >100)
router.post('/decks/:id/trim', async (req, res) => {
  const pool = getPgPool();
  const deckRes = await pool.query<{ id: string; name: string; commander_id: string }>(
    'SELECT id, name, commander_id FROM decks WHERE id = $1', [req.params.id]
  );
  const deck = deckRes.rows[0];

  if (!deck) {
    return res.status(404).json({ message: 'Mazzo non trovato.' });
  }

  const available = await isAIAvailable();
  if (!available) {
    const provider = getActiveProvider();
    return res.status(503).json({
      message: provider === 'groq' ? 'GROQ_NOT_CONFIGURED' : 'OLLAMA_NOT_RUNNING',
    });
  }

  try {
    const { model } = req.body as { model?: string };
    const commander = await getCardById(deck.commander_id);
    const rows = await getDeckCardRows(deck.id);
    const cardMap = await hydrateCards(rows);

    const totalCards = rows.reduce((s, r) => s + r.quantity, 0);
    if (totalCards <= 100) {
      return res.status(400).json({
        message: `Il mazzo ha ${totalCards} carte — non serve tagliare (limite 100).`,
      });
    }

    const cutCount = totalCards - 100;
    const nonCommanderCards = rows
      .filter((r) => r.is_commander !== 1)
      .flatMap((r) => {
        const card = cardMap.get(r.card_id);
        return card ? Array(r.quantity).fill(card) : [];
      })
      // Deduplication: se quantity>1 per terre base, includi una sola copia per non confondere il modello
      .filter((card, idx, arr) => arr.findIndex((c) => c.id === card.id) === idx) as import('shared').Card[];

    const result = await getTrimSuggestions(commander, nonCommanderCards, cutCount, model);

    return res.json({ cutCount, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Errore AI trim:', msg);
    if (msg.startsWith('OLLAMA_NOT_RUNNING') || msg.startsWith('MODEL_NOT_FOUND') ||
        msg.startsWith('GROQ_INVALID_KEY') || msg.startsWith('GROQ_RATE_LIMIT') ||
        msg.startsWith('GROQ_NOT_CONFIGURED')) {
      return res.status(503).json({ message: msg });
    }
    return res.status(500).json({ message: "Errore durante l'analisi del taglio." });
  }
});

// POST /api/ai/decks/:id/analyze  — analisi debolezze/punti di forza del mazzo
router.post('/decks/:id/analyze', async (req, res) => {
  const pool = getPgPool();
  const deckRes = await pool.query<{ id: string; name: string; commander_id: string }>(
    'SELECT id, name, commander_id FROM decks WHERE id = $1', [req.params.id]
  );
  const deck = deckRes.rows[0];

  if (!deck) return res.status(404).json({ message: 'Mazzo non trovato.' });

  const { model } = req.body as { model?: string };

  const available = await isAIAvailable();
  if (!available) {
    const provider = getActiveProvider();
    return res.status(503).json({
      message: provider === 'groq' ? 'GROQ_NOT_CONFIGURED' : 'OLLAMA_NOT_RUNNING',
    });
  }

  try {
    const commander = await getCardById(deck.commander_id);
    const rows = await getDeckCardRows(deck.id);
    const cardMap = await hydrateCards(rows);
    const currentCards = Array.from(cardMap.values());

    const result = await getDeckWeaknesses(commander, currentCards, model);
    return res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Errore AI analyze:', msg);
    if (msg.startsWith('OLLAMA_NOT_RUNNING') || msg.startsWith('MODEL_NOT_FOUND') || msg.startsWith('GROQ_')) {
      return res.status(503).json({ message: msg });
    }
    return res.status(500).json({ message: "Errore durante l'analisi del mazzo." });
  }
});

// POST /api/ai/decks/:id/replace  — suggerisci sostituzione per una carta specifica
router.post('/decks/:id/replace', async (req, res) => {
  const pool = getPgPool();
  const deckRes = await pool.query<{ id: string; name: string; commander_id: string }>(
    'SELECT id, name, commander_id FROM decks WHERE id = $1', [req.params.id]
  );
  const deck = deckRes.rows[0];

  if (!deck) return res.status(404).json({ message: 'Mazzo non trovato.' });

  const { card_id, model } = req.body as { card_id?: string; model?: string };
  if (!card_id) return res.status(400).json({ message: 'card_id è obbligatorio.' });

  const available = await isAIAvailable();
  if (!available) {
    const provider = getActiveProvider();
    return res.status(503).json({
      message: provider === 'groq' ? 'GROQ_NOT_CONFIGURED' : 'OLLAMA_NOT_RUNNING',
    });
  }

  try {
    const commander = await getCardById(deck.commander_id);
    const rows = await getDeckCardRows(deck.id);
    const cardMap = await hydrateCards(rows);
    const cardToReplace = cardMap.get(card_id) ?? await getCardById(card_id);
    const currentCards = Array.from(cardMap.values());

    const result = await getCardReplacement(commander, currentCards, cardToReplace, model);

    // Risolvi le alternative su Scryfall, filtra per color identity
    const commanderColors = commander.color_identity;
    const resolvedAlts: { name: string; reason: string; categories: string[]; bracket: number; isGameChanger: boolean; isMassLandDenial: boolean; card: unknown }[] = [];

    for (const alt of result.alternatives.slice(0, 10)) {
      if (resolvedAlts.length >= 5) break;
      try {
        const found = await searchCards(`!"${alt.name}"`, 1);
        const card = found.data[0] ?? null;
        if (card) {
          const cardColors: string[] = [...((card as { color_identity?: string[] }).color_identity ?? [])];
          const isLegal = cardColors.every((c) => (commanderColors as string[]).includes(c));
          if (!isLegal) continue;
        }
        resolvedAlts.push({ ...alt, card });
      } catch {
        resolvedAlts.push({ ...alt, card: null });
      }
    }

    return res.json({ cardToReplace: result.cardToReplace, alternatives: resolvedAlts });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Errore AI replace:', msg);
    if (msg.startsWith('OLLAMA_NOT_RUNNING') || msg.startsWith('MODEL_NOT_FOUND') || msg.startsWith('GROQ_')) {
      return res.status(503).json({ message: msg });
    }
    return res.status(500).json({ message: 'Errore durante la generazione dei sostituti.' });
  }
});

export default router;
