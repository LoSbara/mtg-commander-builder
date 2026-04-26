import axios, { AxiosError } from 'axios';
import type { Card, ScryfallSearchResponse, Deck, DeckStats, ValidationResult } from 'shared';

const http = axios.create({ baseURL: '/api' });

// Estrae il messaggio d'errore dall'API in modo uniforme
export function extractErrorMessage(err: unknown): string {
  if (err instanceof AxiosError) {
    return (err.response?.data as { message?: string })?.message ?? err.message;
  }
  return String(err);
}

// ─── Cards ─────────────────────────────────────────────────────────────────

export const searchCards = (query: string, page = 1) =>
  http.get<ScryfallSearchResponse>('/cards/search', { params: { q: query, page } });

export const getCard = (id: string) =>
  http.get<Card>(`/cards/${id}`);

export const searchCommanders = (query: string) =>
  http.get<ScryfallSearchResponse>('/commanders/search', { params: { q: query } });

// ─── Decks ─────────────────────────────────────────────────────────────────

export const getDecks = () =>
  http.get<Deck[]>('/decks');

export const getDeck = (id: string) =>
  http.get<Deck>(`/decks/${id}`);

export const createDeck = (data: { name: string; description?: string; commander_id: string }) =>
  http.post<Deck>('/decks', data);

export const updateDeck = (id: string, data: { name?: string; description?: string }) =>
  http.put<{ id: string; updated_at: string }>(`/decks/${id}`, data);

export const deleteDeck = (id: string) =>
  http.delete(`/decks/${id}`);

export const addCardToDeck = (deckId: string, cardId: string, quantity = 1, isCommander = false) =>
  http.post(`/decks/${deckId}/cards`, { card_id: cardId, quantity, is_commander: isCommander });

export const removeCardFromDeck = (deckId: string, cardId: string) =>
  http.delete(`/decks/${deckId}/cards/${cardId}`);

export const getDeckStats = (id: string) =>
  http.get<DeckStats>(`/decks/${id}/stats`);

export const validateDeck = (id: string) =>
  http.get<ValidationResult>(`/decks/${id}/validate`);

// ─── AI ─────────────────────────────────────────────────────────────────────

export interface CardSuggestion {
  name: string;
  reason: string;
  categories: string[];
  card: Card | null;
}

export interface ManaSuggestion {
  totalLands: number;
  breakdown: string;
  recommendations: string[];
}

export interface AISuggestions {
  overview: string;
  suggestions: CardSuggestion[];
  manaBase: ManaSuggestion;
  manaCurveAdvice: string;
}

export interface OllamaStatus {
  available: boolean;
  models: string[];
  provider: 'groq' | 'ollama';
}

export interface CardCut {
  name: string;
  reason: string;
}

export interface TrimSuggestions {
  cutCount: number;
  analysis: string;
  cuts: CardCut[];
}

export interface ImportResult {
  imported: number;
  importedCards: { name: string; id: string }[];
  notFound: string[];
  skipped: string[];
  total: number;
}

export const getAIStatus = () =>
  http.get<OllamaStatus>('/ai/status');

export const getAISuggestions = (deckId: string, model?: string) =>
  http.post<AISuggestions>(`/ai/decks/${deckId}/suggest`, { model });

export const getAITrimSuggestions = (deckId: string, model?: string) =>
  http.post<TrimSuggestions>(`/ai/decks/${deckId}/trim`, { model });

export const importDeck = (deckId: string, text: string) =>
  http.post<ImportResult>(`/decks/${deckId}/import`, { text });
