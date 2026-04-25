import axios, { AxiosError } from 'axios';
import type { Card } from 'shared';

const OLLAMA_BASE = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2';

// ─── Tipi di risposta AI ────────────────────────────────────────────────────

export interface CardSuggestion {
  name: string;        // nome esatto della carta (in inglese)
  reason: string;      // perché è consigliata
  category: string;    // es. "Sinergia", "Rampa", "Rimozione", "Evasione", "Draw", "Mana base"
}

export interface AISuggestions {
  overview: string;          // breve analisi strategica del commander
  suggestions: CardSuggestion[];
  manaBase: ManaSuggestion;
  manaCurveAdvice: string;   // consigli sulla curva di mana
}

export interface ManaSuggestion {
  totalLands: number;
  breakdown: string;   // es. "36 terre: 15 base, 10 dual, 5 fetch, 3 utility, 3 MDFCs"
  recommendations: string[];
}

// ─── Controllo disponibilità Ollama ─────────────────────────────────────────

export async function isOllamaAvailable(): Promise<boolean> {
  try {
    await axios.get(`${OLLAMA_BASE}/api/tags`, { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export async function getAvailableModels(): Promise<string[]> {
  try {
    const resp = await axios.get<{ models: { name: string }[] }>(`${OLLAMA_BASE}/api/tags`);
    return resp.data.models.map((m) => m.name);
  } catch {
    return [];
  }
}

// ─── Prompt builder ──────────────────────────────────────────────────────────

export function buildPrompt(commander: Card, currentCards: Card[], colorIdentity: string[]): string {
  const existingNames = currentCards
    .filter((c) => c.name !== commander.name)
    .map((c) => c.name)
    .join(', ');

  const colorStr = colorIdentity.length === 0 ? 'colorless' : colorIdentity.join('');

  return `You are an expert Magic: The Gathering Commander (EDH) deckbuilder.

Commander: ${commander.name}
Color Identity: {${colorStr}}
Type: ${commander.type_line}
Oracle Text: ${commander.oracle_text ?? 'N/A'}
${commander.power !== undefined ? `Power/Toughness: ${commander.power}/${commander.toughness}` : ''}
${currentCards.length > 1 ? `Already in deck: ${existingNames}` : 'Deck is empty (only commander so far)'}

Analyze the commander and provide a structured JSON response with deck building advice.
Suggest cards that synergize with this specific commander's strategy.
Do NOT suggest cards already in the deck.
Focus on the commander's unique mechanics and win conditions.

Respond ONLY with valid JSON in this exact format (no markdown, no explanation outside JSON):
{
  "overview": "2-3 sentences describing the commander's strategy and key win conditions",
  "suggestions": [
    {
      "name": "Exact Card Name",
      "reason": "Why this card works with the commander",
      "category": "one of: Sinergia|Rampa|Rimozione|Draw|Evasione|Protezione|Utility|Combo"
    }
  ],
  "manaBase": {
    "totalLands": 36,
    "breakdown": "How to distribute the ${colorIdentity.length === 0 ? 1 : colorIdentity.length} color(s) across land types",
    "recommendations": ["specific land recommendation 1", "specific land recommendation 2", "specific land recommendation 3"]
  },
  "manaCurveAdvice": "Specific advice about mana curve for this commander's strategy"
}

Provide exactly 15 card suggestions covering different categories. All text in Italian except card names (always in English).`;
}

// ─── Chiamata a Ollama ──────────────────────────────────────────────────────

export async function getDeckSuggestions(
  commander: Card,
  currentCards: Card[],
  model?: string
): Promise<AISuggestions> {
  const targetModel = model ?? DEFAULT_MODEL;
  const prompt = buildPrompt(commander, currentCards, commander.color_identity);

  try {
    const response = await axios.post<{ message: { content: string } }>(
      `${OLLAMA_BASE}/api/chat`,
      {
        model: targetModel,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 2048,
        },
      },
      { timeout: 120_000 } // 2 minuti — i modelli locali sono più lenti
    );

    const raw = response.data.message.content.trim();

    // Estrae il JSON dalla risposta (il modello potrebbe aggiungere testo)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Il modello non ha restituito JSON valido.');
    }

    let parsed: AISuggestions;
    try {
      parsed = JSON.parse(jsonMatch[0]) as AISuggestions;
    } catch {
      throw new Error('JSON malformato nella risposta del modello.');
    }

    // Normalizzazione minima
    if (!Array.isArray(parsed.suggestions)) parsed.suggestions = [];
    if (!parsed.overview) parsed.overview = '';
    if (!parsed.manaBase) parsed.manaBase = { totalLands: 36, breakdown: '', recommendations: [] };
    if (!parsed.manaCurveAdvice) parsed.manaCurveAdvice = '';

    return parsed;
  } catch (err) {
    if (err instanceof AxiosError) {
      if (err.code === 'ECONNREFUSED') {
        throw new Error('OLLAMA_NOT_RUNNING: Ollama non è in esecuzione. Avvia Ollama con: ollama serve');
      }
      if (err.response?.status === 404) {
        throw new Error(`MODEL_NOT_FOUND: Modello "${targetModel}" non trovato. Scaricalo con: ollama pull ${targetModel}`);
      }
    }
    throw err;
  }
}
