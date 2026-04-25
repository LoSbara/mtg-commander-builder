import type { Card, ManaColor, DeckStats } from 'shared';
import { getDb } from '../models/db';
import { getCardById } from './scryfallService';

// ─── Tipi interni ──────────────────────────────────────────────────────────

export interface DeckCardRow {
  deck_id: string;
  card_id: string;
  quantity: number;
  is_commander: number; // SQLite usa 0/1
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// Terre base che possono avere duplicati
const BASIC_LAND_TYPES = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'];

function isBasicLand(card: Card): boolean {
  return BASIC_LAND_TYPES.some((basic) => card.type_line.includes(`Basic Land — ${basic}`) || card.type_line === `Basic Land`);
}

// ─── Lettura carte dal DB ──────────────────────────────────────────────────

export function getDeckCardRows(deckId: string): DeckCardRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM deck_cards WHERE deck_id = ?')
    .all(deckId) as DeckCardRow[];
}

// Carica gli oggetti Card completi dal cache SQLite per ogni voce del mazzo
export async function hydrateCards(rows: DeckCardRow[]): Promise<Map<string, Card>> {
  const cardMap = new Map<string, Card>();
  // Sequenziale — evita race condition sulla throttle condivisa del servizio Scryfall
  for (const row of rows) {
    if (cardMap.has(row.card_id)) continue; // stesso card_id in più righe non può accadere, ma per sicurezza
    try {
      const card = await getCardById(row.card_id);
      cardMap.set(row.card_id, card);
    } catch (err) {
      console.error(`Idratazione carta ${row.card_id} fallita:`, err);
    }
  }
  return cardMap;
}

// ─── Validazione mazzo ─────────────────────────────────────────────────────

export async function validateDeck(deckId: string): Promise<ValidationResult> {
  const db = getDb();
  const errors: string[] = [];

  // Recupera il commander
  const deckRow = db.prepare('SELECT commander_id FROM decks WHERE id = ?').get(deckId) as
    | { commander_id: string }
    | undefined;

  if (!deckRow) {
    return { valid: false, errors: ['Mazzo non trovato.'] };
  }

  const rows = getDeckCardRows(deckId);
  const cardMap = await hydrateCards(rows);
  const commander = await getCardById(deckRow.commander_id);

  const commanderColorIdentity = new Set<ManaColor>(commander.color_identity);

  // 1. Conteggio totale (commander incluso)
  const totalCards = rows.reduce((sum, r) => sum + r.quantity, 0);
  if (totalCards !== 100) {
    errors.push(`Il mazzo ha ${totalCards} carte invece di 100.`);
  }

  // 2. Commander nel mazzo
  const commanderInDeck = rows.find((r) => r.is_commander === 1);
  if (!commanderInDeck) {
    errors.push('Il commander non è presente nel mazzo.');
  }

  // 3. Duplicati e color identity
  for (const row of rows) {
    const card = cardMap.get(row.card_id);
    if (!card) continue;

    // Duplicati (max 1 copia, eccetto terre base)
    if (row.quantity > 1 && !isBasicLand(card)) {
      errors.push(`"${card.name}" ha ${row.quantity} copie (massimo 1 per le non-terre-base).`);
    }

    // Color identity
    for (const color of card.color_identity) {
      if (!commanderColorIdentity.has(color)) {
        errors.push(
          `"${card.name}" ha color identity {${color}} non compatibile con il commander.`
        );
        break;
      }
    }

    // Legalità Commander
    if (card.legalities['commander'] === 'banned') {
      errors.push(`"${card.name}" è bannata nel formato Commander.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// ─── Statistiche mazzo ─────────────────────────────────────────────────────

export async function computeDeckStats(deckId: string): Promise<DeckStats> {
  const rows = getDeckCardRows(deckId);
  const cardMap = await hydrateCards(rows);

  const stats: DeckStats = {
    totalCards: 0,
    manaCurve: {},
    colorDistribution: { W: 0, U: 0, B: 0, R: 0, G: 0 },
    typeDistribution: {
      creatures: 0,
      instants: 0,
      sorceries: 0,
      enchantments: 0,
      artifacts: 0,
      planeswalkers: 0,
      lands: 0,
      other: 0,
    },
    averageCmc: 0,
  };

  let totalCmc = 0;
  let nonLandCount = 0;
  let estimatedPriceEur = 0;
  let hasPrices = false;

  for (const row of rows) {
    const card = cardMap.get(row.card_id);
    if (!card) continue;

    const qty = row.quantity;
    stats.totalCards += qty;

    // Curva di mana (escludiamo le terre)
    const typeLine = card.type_line.toLowerCase();
    const isLand = typeLine.includes('land');

    if (!isLand) {
      const cmcKey = Math.min(card.cmc, 7); // raggruppiamo 7+
      stats.manaCurve[cmcKey] = (stats.manaCurve[cmcKey] ?? 0) + qty;
      totalCmc += card.cmc * qty;
      nonLandCount += qty;
    }

    // Distribuzione per tipo
    if (isLand) stats.typeDistribution.lands += qty;
    else if (typeLine.includes('creature')) stats.typeDistribution.creatures += qty;
    else if (typeLine.includes('instant')) stats.typeDistribution.instants += qty;
    else if (typeLine.includes('sorcery')) stats.typeDistribution.sorceries += qty;
    else if (typeLine.includes('enchantment')) stats.typeDistribution.enchantments += qty;
    else if (typeLine.includes('artifact')) stats.typeDistribution.artifacts += qty;
    else if (typeLine.includes('planeswalker')) stats.typeDistribution.planeswalkers += qty;
    else stats.typeDistribution.other += qty;

    // Distribuzione colori (per carta, non per copia)
    for (const color of card.color_identity) {
      stats.colorDistribution[color] += qty;
    }

    // Prezzo stimato EUR
    const price = card.prices?.eur;
    if (price) {
      estimatedPriceEur += parseFloat(price) * qty;
      hasPrices = true;
    }
  }

  stats.averageCmc = nonLandCount > 0 ? Math.round((totalCmc / nonLandCount) * 100) / 100 : 0;
  if (hasPrices) stats.estimatedPriceEur = Math.round(estimatedPriceEur * 100) / 100;

  return stats;
}

// ─── Aggiunta/rimozione carte ──────────────────────────────────────────────

export function addCardToDeck(
  deckId: string,
  cardId: string,
  quantity: number,
  isCommander: boolean
): void {
  const db = getDb();

  // Verifica se già presente
  const existing = db
    .prepare('SELECT quantity FROM deck_cards WHERE deck_id = ? AND card_id = ?')
    .get(deckId, cardId) as { quantity: number } | undefined;

  if (existing) {
    db.prepare(
      'UPDATE deck_cards SET quantity = quantity + ? WHERE deck_id = ? AND card_id = ?'
    ).run(quantity, deckId, cardId);
  } else {
    db.prepare(
      'INSERT INTO deck_cards (deck_id, card_id, quantity, is_commander) VALUES (?, ?, ?, ?)'
    ).run(deckId, cardId, quantity, isCommander ? 1 : 0);
  }

  // Aggiorna updated_at del mazzo
  db.prepare('UPDATE decks SET updated_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    deckId
  );
}

export function removeCardFromDeck(deckId: string, cardId: string): boolean {
  const db = getDb();
  const result = db
    .prepare('DELETE FROM deck_cards WHERE deck_id = ? AND card_id = ?')
    .run(deckId, cardId);

  if (result.changes > 0) {
    db.prepare('UPDATE decks SET updated_at = ? WHERE id = ?').run(
      new Date().toISOString(),
      deckId
    );
  }

  return result.changes > 0;
}

// ─── Export mazzo ──────────────────────────────────────────────────────────

export type ExportFormat = 'txt' | 'mtgo' | 'moxfield';

function groupByType(
  rows: DeckCardRow[],
  cardMap: Map<string, Card>,
  commanderId: string
): Record<string, Array<{ card: Card; qty: number }>> {
  const groups: Record<string, Array<{ card: Card; qty: number }>> = {
    Commander: [],
    Creature: [],
    Instant: [],
    Sorcery: [],
    Enchantment: [],
    Artifact: [],
    Planeswalker: [],
    Land: [],
    Other: [],
  };

  for (const row of rows) {
    const card = cardMap.get(row.card_id);
    if (!card) continue;
    const entry = { card, qty: row.quantity };

    if (row.is_commander === 1 || row.card_id === commanderId) {
      groups['Commander'].push(entry);
    } else {
      const tl = card.type_line.toLowerCase();
      if (tl.includes('land')) groups['Land'].push(entry);
      else if (tl.includes('creature')) groups['Creature'].push(entry);
      else if (tl.includes('instant')) groups['Instant'].push(entry);
      else if (tl.includes('sorcery')) groups['Sorcery'].push(entry);
      else if (tl.includes('enchantment')) groups['Enchantment'].push(entry);
      else if (tl.includes('artifact')) groups['Artifact'].push(entry);
      else if (tl.includes('planeswalker')) groups['Planeswalker'].push(entry);
      else groups['Other'].push(entry);
    }
  }

  for (const g of Object.values(groups)) {
    g.sort((a, b) => a.card.name.localeCompare(b.card.name));
  }

  return groups;
}

export function formatDeckExport(
  deckName: string,
  commanderId: string,
  rows: DeckCardRow[],
  cardMap: Map<string, Card>,
  format: ExportFormat
): string {
  const lines: string[] = [];
  const totalCards = rows.reduce((s, r) => s + r.quantity, 0);

  if (format === 'txt') {
    lines.push(`// Mazzo: ${deckName}`);
    lines.push(`// Totale: ${totalCards} carte`);
    lines.push('');

    const groups = groupByType(rows, cardMap, commanderId);
    const groupLabels: [string, string][] = [
      ['Commander', 'Commander'],
      ['Creature', 'Creature'],
      ['Instant', 'Istantanei'],
      ['Sorcery', 'Stregonerie'],
      ['Enchantment', 'Incantesimi'],
      ['Artifact', 'Artefatti'],
      ['Planeswalker', 'Planeswalker'],
      ['Land', 'Terre'],
      ['Other', 'Altro'],
    ];

    for (const [key, label] of groupLabels) {
      const group = groups[key];
      if (group.length === 0) continue;
      const count = group.reduce((s, e) => s + e.qty, 0);
      lines.push(`${label} (${count})`);
      for (const { card, qty } of group) {
        lines.push(`${qty} ${card.name}`);
      }
      lines.push('');
    }
  } else if (format === 'mtgo') {
    // Commander prima, poi il resto in ordine alfabetico per nome
    const sorted = [...rows].sort((a, b) => {
      if (a.is_commander !== b.is_commander) return b.is_commander - a.is_commander;
      const nameA = cardMap.get(a.card_id)?.name ?? '';
      const nameB = cardMap.get(b.card_id)?.name ?? '';
      return nameA.localeCompare(nameB);
    });
    for (const row of sorted) {
      const card = cardMap.get(row.card_id);
      if (card) lines.push(`${row.quantity} ${card.name}`);
    }
  } else {
    // moxfield — come MTGO ma con *CMDR* sul commander
    const sorted = [...rows].sort((a, b) => {
      if (a.is_commander !== b.is_commander) return b.is_commander - a.is_commander;
      const nameA = cardMap.get(a.card_id)?.name ?? '';
      const nameB = cardMap.get(b.card_id)?.name ?? '';
      return nameA.localeCompare(nameB);
    });
    for (const row of sorted) {
      const card = cardMap.get(row.card_id);
      if (!card) continue;
      const marker = row.is_commander === 1 || row.card_id === commanderId ? ' *CMDR*' : '';
      lines.push(`${row.quantity} ${card.name}${marker}`);
    }
  }

  return lines.join('\n');
}
