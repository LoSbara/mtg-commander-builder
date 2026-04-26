import axios, { AxiosError } from 'axios';
import type { Card } from 'shared';
import type { EDHRecCard } from './edhrecService';

const OLLAMA_BASE = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL ?? 'llama3.2';

// ─── Tipi di risposta AI ────────────────────────────────────────────────────

export interface CardSuggestion {
  name: string;        // nome esatto della carta (in inglese)
  reason: string;      // perché è consigliata
  categories: string[];  // es. ["Rampa", "Utility"] — una carta può appartenere a più categorie
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

export interface CardCut {
  name: string;    // nome esatto carta da tagliare
  reason: string;  // perché tagliarla
}

export interface TrimSuggestions {
  analysis: string;     // analisi generale del mazzo sovrabbondante
  cuts: CardCut[];      // carte da tagliare (in ordine di priorità)
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

export function buildPrompt(commander: Card, currentCards: Card[], colorIdentity: string[], edhrecCards?: EDHRecCard[]): string {
  const existingNames = currentCards
    .filter((c) => c.name !== commander.name)
    .map((c) => c.name)
    .join(', ');

  const colorStr = colorIdentity.length === 0 ? 'colorless' : colorIdentity.join('');

  const colorNames: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };
  const colorFull = colorIdentity.length === 0
    ? 'Colorless'
    : colorIdentity.map((c) => colorNames[c] ?? c).join(', ');

  // Sezione EDHREC opzionale ─ inclusa solo se i dati sono disponibili
  const edhrecSection = edhrecCards && edhrecCards.length > 0
    ? `\n--- EDHREC COMMUNITY DATA for ${commander.name} ---
The following cards are popular in community decks for this commander.
Format: CardName | EDHREC synergy | inclusion in X% of similar decks | salt score (0=friendly, 4=very salty/frustrating)
${edhrecCards.slice(0, 30).map((c) =>
  `- ${c.name} | synergy: ${c.synergy > 0 ? '+' : ''}${(c.synergy * 100).toFixed(0)}% | ${c.inclusionRate}% of decks | salt: ${c.salt.toFixed(1)}/4.0`
).join('\n')}

Salt score guide: 0-1 = table-friendly card, 1-2 = mild, 2-3 = competitive/polarizing, 3-4 = very salty (infuriates opponents).
You SHOULD factor in EDHREC data: prefer high-synergy, high-inclusion cards when relevant.
You MAY also suggest non-EDHREC cards if they fit the strategy.
Balance salt score according to the deck's power level — mention salt in the reason when relevant.
--- END EDHREC DATA ---\n`
    : '';

  return `You are an expert Magic: The Gathering Commander (EDH) deckbuilder.

Commander: ${commander.name}
Color Identity: {${colorStr}} (${colorFull})
Type: ${commander.type_line}
Oracle Text: ${commander.oracle_text ?? 'N/A'}
${commander.power !== undefined ? `Power/Toughness: ${commander.power}/${commander.toughness}` : ''}
${currentCards.length > 1 ? `Already in deck: ${existingNames}` : 'Deck is empty (only commander so far)'}
${edhrecSection}
*** CRITICAL RULES — YOU MUST FOLLOW THESE EXACTLY ***
1. ONLY suggest cards that are 100% legal in {${colorStr}} color identity.
2. A card is legal ONLY if every mana symbol and color indicator on it is within {${colorStr}}.
3. NEVER suggest cards containing colors outside {${colorStr}}. For example:
${colorIdentity.length === 0
  ? '   - Only suggest colorless cards (no W, U, B, R, or G mana symbols anywhere on the card).'
  : `   - FORBIDDEN colors: ${['W','U','B','R','G'].filter(c => !colorIdentity.includes(c)).map(c => `{${c}} (${colorNames[c]})`).join(', ') || 'none'}.
   - LEGAL colors: ${colorIdentity.map(c => `{${c}} (${colorNames[c]})`).join(', ')} plus colorless {C}/{X}.`}
4. Colorless cards and artifacts with no colored mana symbols are always legal.
5. Basic lands of the legal colors are always legal.
*** END CRITICAL RULES ***

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
      "categories": ["one or more of: Sinergia|Rampa|Rimozione|Draw|Evasione|Protezione|Utility|Combo"]
    }
  ],
  "manaBase": {
    "totalLands": 36,
    "breakdown": "How to distribute the ${colorIdentity.length === 0 ? 1 : colorIdentity.length} color(s) across land types",
    "recommendations": ["specific land recommendation 1", "specific land recommendation 2", "specific land recommendation 3"]
  },
  "manaCurveAdvice": "Specific advice about mana curve for this commander's strategy"
}

Provide exactly 15 card suggestions covering different categories. A card can have multiple categories (e.g. a ramp spell that also draws cards → ["Rampa","Draw"]). All text in Italian except card names (always in English).`;
}

// ─── Prompt builder — Trim ───────────────────────────────────────────────────

export function buildTrimPrompt(commander: Card, nonCommanderCards: Card[], cutCount: number): string {
  const colorStr = commander.color_identity.length === 0 ? 'C' : commander.color_identity.join('');
  const cardList = nonCommanderCards
    .map((c) => `- ${c.name} | ${c.mana_cost ?? ''} | ${c.type_line} | "${c.oracle_text?.slice(0, 100) ?? ''}"`)
    .join('\n');

  return `You are an expert Magic: The Gathering Commander (EDH) deckbuilder.

Commander: ${commander.name}
Color Identity: {${colorStr}}
Oracle Text: ${commander.oracle_text ?? 'N/A'}

This deck has ${nonCommanderCards.length + 1} cards total (commander + ${nonCommanderCards.length} others).
It needs to be trimmed to exactly 100 cards (commander + 99 others).
You must identify exactly ${cutCount} cards to REMOVE.

Current non-commander cards:
${cardList}

*** YOUR TASK ***
Analyze the deck and identify the ${cutCount} weakest cards to cut.
Prioritize cutting:
1. Cards with poor synergy with the commander's strategy
2. Redundant effects (if 4 similar cards exist, cut the weaker ones)
3. Overcosted cards for what they do
4. Cards that slow down the deck's primary game plan
5. Excess lands if there are too many (>40)

Keep the best lands, ramp, card draw, removal, and synergy pieces.
Respect the commander's unique mechanics and win conditions.

Respond ONLY with valid JSON in this exact format (no markdown, no extra text):
{
  "analysis": "2-3 sentences analyzing the overall deck composition and why these cuts improve it",
  "cuts": [
    {
      "name": "Exact Card Name",
      "reason": "Brief reason in Italian (1-2 sentences) why this card is the weakest link"
    }
  ]
}

Provide exactly ${cutCount} cuts. Card names must be in English (exact). Reasons in Italian.`;
}

// ─── Trim con Ollama ─────────────────────────────────────────────────────────

export async function getTrimSuggestions(
  commander: Card,
  nonCommanderCards: Card[],
  cutCount: number,
  model?: string
): Promise<TrimSuggestions> {
  const targetModel = model ?? DEFAULT_MODEL;
  const prompt = buildTrimPrompt(commander, nonCommanderCards, cutCount);

  try {
    const response = await axios.post<{ message: { content: string } }>(
      `${OLLAMA_BASE}/api/chat`,
      {
        model: targetModel,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { temperature: 0.5, num_predict: 3000 },
      },
      { timeout: 180_000 }
    );

    const raw = response.data.message.content.trim();
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('JSON non trovato nella risposta trim.');

    let parsed: TrimSuggestions;
    try {
      parsed = JSON.parse(jsonMatch[0]) as TrimSuggestions;
    } catch {
      throw new Error('JSON malformato nella risposta trim.');
    }

    if (!Array.isArray(parsed.cuts)) parsed.cuts = [];
    if (!parsed.analysis) parsed.analysis = '';
    return parsed;
  } catch (err) {
    if (err instanceof AxiosError) {
      if (err.code === 'ECONNREFUSED') throw new Error('OLLAMA_NOT_RUNNING');
      if (err.response?.status === 404) throw new Error(`MODEL_NOT_FOUND: ${targetModel}`);
    }
    throw err;
  }
}

// ─── Chiamata a Ollama ──────────────────────────────────────────────────────

export async function getDeckSuggestions(
  commander: Card,
  currentCards: Card[],
  model?: string,
  edhrecCards?: EDHRecCard[]
): Promise<AISuggestions> {
  const targetModel = model ?? DEFAULT_MODEL;
  const prompt = buildPrompt(commander, currentCards, commander.color_identity, edhrecCards);

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
    // Normalizza categories: supporta sia array che stringa singola (per modelli vecchi)
    parsed.suggestions = parsed.suggestions.map((s) => {
      const raw = s as CardSuggestion & { category?: string };
      if (!Array.isArray(s.categories)) {
        s.categories = raw.category ? [raw.category] : [];
      }
      return s;
    });

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
