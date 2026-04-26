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
  // Esclude carte del maybeboard dalla lista principale
  return db
    .prepare('SELECT * FROM deck_cards WHERE deck_id = ? AND (is_maybeboard IS NULL OR is_maybeboard = 0)')
    .all(deckId) as DeckCardRow[];
}

export function getMaybeboardRows(deckId: string): DeckCardRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM deck_cards WHERE deck_id = ? AND is_maybeboard = 1')
    .all(deckId) as DeckCardRow[];
}

export function addToMaybeboard(deckId: string, cardId: string, quantity: number): void {
  const db = getDb();
  const existing = db
    .prepare('SELECT quantity, is_maybeboard FROM deck_cards WHERE deck_id = ? AND card_id = ?')
    .get(deckId, cardId) as { quantity: number; is_maybeboard: number } | undefined;

  if (existing) {
    // Sposta al maybeboard se era nel main deck
    db.prepare(
      'UPDATE deck_cards SET quantity = quantity + ?, is_maybeboard = 1 WHERE deck_id = ? AND card_id = ?'
    ).run(quantity, deckId, cardId);
  } else {
    db.prepare(
      'INSERT INTO deck_cards (deck_id, card_id, quantity, is_commander, is_maybeboard) VALUES (?, ?, ?, 0, 1)'
    ).run(deckId, cardId, quantity);
  }
  db.prepare('UPDATE decks SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), deckId);
}

export function removeFromMaybeboard(deckId: string, cardId: string): boolean {
  const db = getDb();
  const result = db
    .prepare('DELETE FROM deck_cards WHERE deck_id = ? AND card_id = ? AND is_maybeboard = 1')
    .run(deckId, cardId);
  if (result.changes > 0) {
    db.prepare('UPDATE decks SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), deckId);
  }
  return result.changes > 0;
}

export function moveMaybeboardToMain(deckId: string, cardId: string): boolean {
  const db = getDb();
  const result = db
    .prepare('UPDATE deck_cards SET is_maybeboard = 0 WHERE deck_id = ? AND card_id = ? AND is_maybeboard = 1')
    .run(deckId, cardId);
  if (result.changes > 0) {
    db.prepare('UPDATE decks SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), deckId);
  }
  return result.changes > 0;
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

  // Supporto partner commanders: color identity = unione di tutti i commander
  const commanderColorIdentity = new Set<ManaColor>(commander.color_identity);
  const commanderRows = rows.filter((r) => r.is_commander === 1);

  if (commanderRows.length === 2) {
    const partnerRow = commanderRows.find((r) => r.card_id !== deckRow.commander_id);
    if (partnerRow) {
      const partner = cardMap.get(partnerRow.card_id);
      if (partner) {
        for (const c of partner.color_identity) commanderColorIdentity.add(c);
        const cmd1HasPartner = commander.oracle_text?.toLowerCase().includes('partner') ?? false;
        const cmd2HasPartner = partner.oracle_text?.toLowerCase().includes('partner') ?? false;
        if (!cmd1HasPartner || !cmd2HasPartner) {
          errors.push('Entrambi i commander debbono avere la keyword "Partner" o "Partner with".');
        }
      }
    }
  } else if (commanderRows.length > 2) {
    errors.push(`Il mazzo ha ${commanderRows.length} commander — massimo 2 (partner).`);
  }

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

  // Statistiche funzionali
  const functional = { ramp: 0, draw: 0, removal: 0, boardWipe: 0, counter: 0, tutor: 0, protection: 0 };
  for (const row of rows) {
    const card = cardMap.get(row.card_id);
    if (!card) continue;
    for (const cat of detectFunctional(card)) {
      (functional as Record<string, number>)[cat]++;
    }
  }
  stats.functionalStats = functional;

  return stats;
}

function detectFunctional(card: Card): string[] {
  const text = (card.oracle_text ?? '').toLowerCase();
  const type = (card.type_line ?? '').toLowerCase();
  const isLand = type.includes('land');
  const cats: string[] = [];

  // RAMP: non-land mana producers + land-fetching spells
  if (!isLand) {
    if (
      text.includes('add {') ||
      text.includes('add one mana') ||
      text.includes('add two mana') ||
      text.includes('add three mana') ||
      text.includes('add mana of any color')
    ) {
      cats.push('ramp');
    } else if (
      text.includes('search your library for') &&
      (text.includes(' land card') || text.includes(' land onto'))
    ) {
      cats.push('ramp');
    }
  }

  // DRAW
  if (
    text.includes('draw a card') ||
    text.includes('draws a card') ||
    text.includes('draw cards') ||
    /draw (x|\d+|two|three|four|five) cards?/.test(text)
  ) {
    cats.push('draw');
  }

  // BOARD WIPE (check before removal to avoid double-counting)
  const isBoardWipe =
    text.includes('destroy all') ||
    text.includes('exile all') ||
    (text.includes('each creature') && (text.includes('destroy') || text.includes('exile') || / -\d+\/-\d+/.test(text))) ||
    (/all creatures/.test(text) && (text.includes('destroy') || text.includes('exile')));
  if (isBoardWipe) cats.push('boardWipe');

  // REMOVAL (single-target, not a board wipe)
  if (
    !isBoardWipe &&
    (
      text.includes('destroy target') ||
      text.includes('exile target') ||
      (text.includes('return target') && text.includes("to its owner's hand"))
    )
  ) {
    cats.push('removal');
  }

  // COUNTER MAGIC
  if (
    text.includes('counter target spell') ||
    text.includes('counter target creature') ||
    text.includes('counter target artifact') ||
    text.includes('counter target activated') ||
    text.includes('counter that spell')
  ) {
    cats.push('counter');
  }

  // TUTOR (search for non-land)
  if (
    !isLand &&
    text.includes('search your library for') &&
    !text.includes(' land card') &&
    !text.includes('basic land') &&
    !text.includes('land onto')
  ) {
    cats.push('tutor');
  }

  // PROTECTION
  if (
    !isLand &&
    (
      text.includes('hexproof') ||
      text.includes('indestructible') ||
      text.includes('shroud') ||
      text.includes('protection from')
    )
  ) {
    cats.push('protection');
  }

  return cats;
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
