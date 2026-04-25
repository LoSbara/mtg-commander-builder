import { create } from 'zustand';
import type { Deck } from 'shared';
import * as api from '../api';

interface DeckStore {
  decks: Deck[];
  currentDeck: Deck | null;
  loading: boolean;
  error: string | null;

  fetchDecks: () => Promise<void>;
  fetchDeck: (id: string) => Promise<void>;
  createDeck: (name: string, description: string, commanderId: string) => Promise<Deck | null>;
  deleteDeck: (id: string) => Promise<void>;
  addCard: (deckId: string, cardId: string, quantity?: number) => Promise<void>;
  removeCard: (deckId: string, cardId: string) => Promise<void>;
  clearCurrentDeck: () => void;
}

export const useDeckStore = create<DeckStore>((set, get) => ({
  decks: [],
  currentDeck: null,
  loading: false,
  error: null,

  fetchDecks: async () => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.getDecks();
      set({ decks: data });
    } catch (err) {
      set({ error: api.extractErrorMessage(err) });
    } finally {
      set({ loading: false });
    }
  },

  fetchDeck: async (id) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.getDeck(id);
      set({ currentDeck: data });
    } catch (err) {
      set({ error: api.extractErrorMessage(err) });
    } finally {
      set({ loading: false });
    }
  },

  createDeck: async (name, description, commanderId) => {
    set({ loading: true, error: null });
    try {
      const { data } = await api.createDeck({ name, description, commander_id: commanderId });
      set((s) => ({ decks: [data, ...s.decks] }));
      return data;
    } catch (err) {
      set({ error: api.extractErrorMessage(err) });
      return null;
    } finally {
      set({ loading: false });
    }
  },

  deleteDeck: async (id) => {
    try {
      await api.deleteDeck(id);
      set((s) => ({ decks: s.decks.filter((d) => d.id !== id) }));
      if (get().currentDeck?.id === id) set({ currentDeck: null });
    } catch (err) {
      set({ error: api.extractErrorMessage(err) });
    }
  },

  addCard: async (deckId, cardId, quantity = 1) => {
    try {
      await api.addCardToDeck(deckId, cardId, quantity);
      // Ricarica il mazzo aggiornato
      const { data } = await api.getDeck(deckId);
      set({ currentDeck: data });
    } catch (err) {
      set({ error: api.extractErrorMessage(err) });
    }
  },

  removeCard: async (deckId, cardId) => {
    try {
      await api.removeCardFromDeck(deckId, cardId);
      const { data } = await api.getDeck(deckId);
      set({ currentDeck: data });
    } catch (err) {
      set({ error: api.extractErrorMessage(err) });
    }
  },

  clearCurrentDeck: () => set({ currentDeck: null }),
}));
