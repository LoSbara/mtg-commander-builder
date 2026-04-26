import axios from 'axios';

// ─── Tipi Commander Spellbook API v2 ──────────────────────────────────────

export interface SpellbookCard {
  card: { name: string; oracleId: string };
}

export interface SpellbookFeature {
  feature: { name: string; description: string };
}

export interface SpellbookCombo {
  id: number | string;
  uses: SpellbookCard[];
  requires: SpellbookFeature[];
  produces: SpellbookFeature[];
  description?: string;
  steps?: string;
  colorIdentity: string[];
  spoiler?: boolean;
  popularity?: number;
}

export interface FindCombosResult {
  results: SpellbookCombo[];     // tutte le carte del combo presenti nel mazzo
  potential: SpellbookCombo[];   // alcune carte del combo presenti nel mazzo
}

// ─── Query Commander Spellbook ─────────────────────────────────────────────
// Documentazione: https://commanderspellbook.com/api/v2/
// Endpoint find-my-combos: https://backend.commanderspellbook.com/find-my-combos/
// Parametro q: `identity<=WUBRG card:"Name1" card:"Name2" ...`

const SPELLBOOK_BASE = 'https://backend.commanderspellbook.com';

export async function findCombosForDeck(
  cardNames: string[],
  colorIdentity: string[]
): Promise<FindCombosResult> {
  const identity = colorIdentity.length > 0 ? colorIdentity.join('') : 'WUBRG';

  // Limita a 80 carte per evitare URL troppo lunghi; il commander va sempre
  const namesToSend = cardNames.slice(0, 80);
  const cardParts = namesToSend.map((n) => `card:"${n}"`).join(' ');
  const q = `identity<=${identity} ${cardParts}`;

  try {
    const resp = await axios.get<FindCombosResult>(`${SPELLBOOK_BASE}/find-my-combos/`, {
      params: { q },
      timeout: 20_000,
      headers: { Accept: 'application/json' },
    });

    const data = resp.data;
    return {
      results: (data.results ?? []).sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)),
      potential: (data.potential ?? [])
        .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
        .slice(0, 30), // limita i potenziali a 30 più popolari
    };
  } catch (err) {
    // Fallback silenzioso — il servizio esterno potrebbe non essere raggiungibile
    console.warn('[ComboService] Commander Spellbook non raggiungibile:', (err as Error).message);
    return { results: [], potential: [] };
  }
}
