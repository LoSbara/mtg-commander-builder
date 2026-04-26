/**
 * edhrecService.ts — integrazione con EDHREC per suggerimenti carte basati su
 * popolarità nella community, sinergia con il commander e "salt score".
 *
 * Usa le API JSON pubbliche di EDHREC (non ufficiali ma ampiamente usate).
 * I risultati sono cachati in memoria per 24h per ridurre le chiamate esterne.
 *
 * Salt score: punteggio 0-4 che indica quanto una carta "infastidisce" gli avversari.
 *   0-1 = carta amichevole, 1-2 = moderata, 2-3 = competitiva, 3-4 = molto ostica.
 */

import axios from 'axios';

export interface EDHRecCard {
  name: string;
  synergy: number;       // % di sinergia con il commander (positivo = buona sinergia)
  salt: number;          // salt score 0-4 (quanto infastidisce gli avversari)
  inclusionRate: number; // % dei mazzi con questo commander che incluono questa carta
  numDecks: number;      // numero assoluto di mazzi che la includono
  tag: string;           // sezione EDHREC (highsynergy, ramp, removal, ecc.)
}

// Cache in memoria con TTL 24h
const cache = new Map<string, { data: EDHRecCard[]; ts: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Converte il nome di un commander nel formato slug EDHREC.
 * Es: "Atraxa, Praetors' Voice" → "atraxa-praetors-voice"
 */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[',\.!?:()\[\]\/\\]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Estrae le carte da un singolo cardlist entry EDHREC.
 */
function extractFromCardlist(
  cardlist: Record<string, unknown>,
  tag: string,
  seen: Set<string>,
  result: EDHRecCard[],
  limit: number
): void {
  const cardviews = cardlist.cardviews;
  if (!Array.isArray(cardviews)) return;

  for (const cv of cardviews) {
    if (result.length >= limit) break;
    const card = cv as Record<string, unknown>;
    const name = typeof card.name === 'string' ? card.name : null;
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const numDecks = typeof card.num_decks === 'number' ? card.num_decks : 0;
    const potentialDecks = typeof card.potential_decks === 'number' ? card.potential_decks : 1;

    result.push({
      name,
      synergy: typeof card.synergy === 'number' ? card.synergy : 0,
      salt: typeof card.salt === 'number' ? card.salt : 0,
      inclusionRate: potentialDecks > 0 ? Math.round((numDecks / potentialDecks) * 100) : 0,
      numDecks,
      tag,
    });
  }
}

/**
 * Naviga la risposta JSON EDHREC ed estrae le carte rilevanti.
 * Prioritizza: highsynergy → top → ramp → removal → draw → creatures → artifacts
 */
function parseEDHRecResponse(data: unknown): EDHRecCard[] {
  try {
    const root = data as Record<string, unknown>;
    const container = root?.container as Record<string, unknown> | undefined;
    const jsonDict = container?.json_dict as Record<string, unknown> | undefined;
    const cardlists = jsonDict?.cardlists;

    if (!Array.isArray(cardlists)) return [];

    const priorityTags = ['highsynergy', 'top', 'ramp', 'removal', 'draw', 'creatures', 'instants', 'sorceries', 'artifacts', 'enchantments', 'lands'];
    const seen = new Set<string>();
    const result: EDHRecCard[] = [];

    for (const tag of priorityTags) {
      const list = cardlists.find(
        (l: unknown) => (l as Record<string, unknown>).tag === tag
      ) as Record<string, unknown> | undefined;
      if (!list) continue;
      extractFromCardlist(list, tag, seen, result, 60);
    }

    return result;
  } catch {
    return [];
  }
}

/**
 * Recupera i suggerimenti EDHREC per un dato commander.
 * Se EDHREC non è raggiungibile, restituisce array vuoto (non blocca il flusso AI).
 */
export async function getCommanderRecommendations(commanderName: string): Promise<EDHRecCard[]> {
  const cacheKey = commanderName.toLowerCase().trim();
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  const slug = toSlug(commanderName);
  const url = `https://json.edhrec.com/pages/commanders/${slug}.json`;

  try {
    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: {
        'User-Agent': 'MTG-Commander-Builder/1.0 (educational project)',
        'Accept': 'application/json',
      },
    });

    const cards = parseEDHRecResponse(data);
    cache.set(cacheKey, { data: cards, ts: Date.now() });
    console.log(`[EDHREC] ${commanderName}: ${cards.length} carte caricate`);
    return cards;
  } catch (err) {
    console.warn(`[EDHREC] Dati non disponibili per "${commanderName}" (${(err as Error).message})`);
    return [];
  }
}
