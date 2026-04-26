// ─── Colori MTG ────────────────────────────────────────────────────────────

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G';

// ─── Carta (Scryfall) ──────────────────────────────────────────────────────

export interface Card {
  id: string;
  name: string;
  mana_cost: string | null;
  cmc: number;
  type_line: string;
  oracle_text: string;
  colors: ManaColor[];
  color_identity: ManaColor[];
  legalities: Record<string, string>;
  image_uris?: {
    small: string;
    normal: string;
    large: string;
    art_crop: string;
  };
  card_faces?: CardFace[];
  set: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'mythic' | 'special' | 'bonus';
  prices?: {
    eur?: string | null;
    usd?: string | null;
  };
  power?: string;
  toughness?: string;
  loyalty?: string;
  keywords?: string[];
}

export interface CardFace {
  name: string;
  mana_cost: string;
  type_line: string;
  oracle_text: string;
  colors: ManaColor[];
  image_uris?: Card['image_uris'];
}

// ─── Voce nel mazzo (come restituita dal backend) ──────────────────────────

export interface DeckCardRow {
  deck_id: string;
  card_id: string;
  quantity: number;
  is_commander: number;   // 0 | 1
  is_maybeboard?: number; // 0 | 1
}

// ─── Mazzo (come restituito dal backend) ───────────────────────────────────

export interface Deck {
  id: string;
  name: string;
  description?: string | null;
  commander_id: string;
  cards: DeckCardRow[];
  maybeboard?: DeckCardRow[];
  share_token?: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Stats del mazzo ───────────────────────────────────────────────────────

export interface DeckStats {
  totalCards: number;
  manaCurve: Record<number, number>;
  colorDistribution: Record<ManaColor, number>;
  typeDistribution: {
    creatures: number;
    instants: number;
    sorceries: number;
    enchantments: number;
    artifacts: number;
    planeswalkers: number;
    lands: number;
    other: number;
  };
  averageCmc: number;
  estimatedPriceEur?: number;
  estimatedPriceUsd?: number;
  functionalStats?: {
    ramp: number;
    draw: number;
    removal: number;
    boardWipe: number;
    counter: number;
    tutor: number;
    protection: number;
  };
}

// ─── Analisi debolezze AI ─────────────────────────────────────────────────

export interface DeckWeakness {
  category: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  suggestions: string[];
}

export interface WeaknessAnalysis {
  overallAssessment: string;
  bracket: 1 | 2 | 3 | 4 | 5;
  weaknesses: DeckWeakness[];
  strengths: string[];
  winConditions: string[];
}

// ─── Validazione ──────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Risposta Scryfall ────────────────────────────────────────────────────

export interface ScryfallSearchResponse {
  object: 'list';
  total_cards: number;
  has_more: boolean;
  next_page?: string;
  data: Card[];
}

// ─── Sostituzione carta via AI ────────────────────────────────────────────

export interface CardReplacementAlt {
  name: string;
  reason: string;
  categories: string[];
  bracket: 1 | 2 | 3 | 4 | 5;
  isGameChanger: boolean;
  isMassLandDenial: boolean;
}

export interface CardReplacementResult {
  cardToReplace: string;
  alternatives: CardReplacementAlt[];
}

export interface ApiError {
  message: string;
  status?: number;
}
