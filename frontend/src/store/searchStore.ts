import { create } from 'zustand';
import type { Card } from 'shared';
import * as api from '../api';

interface SearchStore {
  // Ricerca carte generica
  query: string;
  results: Card[];
  page: number;
  hasMore: boolean;
  searching: boolean;
  searchError: string | null;

  // Ricerca commander
  commanderQuery: string;
  commanderResults: Card[];
  commanderSearching: boolean;

  setQuery: (q: string) => void;
  search: (query: string, page?: number) => Promise<void>;
  searchMore: () => Promise<void>;
  clearSearch: () => void;

  setCommanderQuery: (q: string) => void;
  searchCommanders: (query: string) => Promise<void>;
  clearCommanderSearch: () => void;
}

export const useSearchStore = create<SearchStore>((set, get) => ({
  query: '',
  results: [],
  page: 1,
  hasMore: false,
  searching: false,
  searchError: null,

  commanderQuery: '',
  commanderResults: [],
  commanderSearching: false,

  setQuery: (q) => set({ query: q }),

  search: async (query, page = 1) => {
    if (!query.trim()) return;
    set({ searching: true, searchError: null, ...(page === 1 ? { results: [] } : {}) });
    try {
      const { data } = await api.searchCards(query.trim(), page);
      set((s) => ({
        results: page === 1 ? data.data : [...s.results, ...data.data],
        page,
        hasMore: data.has_more,
        query,
      }));
    } catch (err) {
      set({ searchError: api.extractErrorMessage(err) });
    } finally {
      set({ searching: false });
    }
  },

  searchMore: async () => {
    const { query, page, hasMore, searching } = get();
    if (!hasMore || searching) return;
    await get().search(query, page + 1);
  },

  clearSearch: () => set({ query: '', results: [], page: 1, hasMore: false, searchError: null }),

  setCommanderQuery: (q) => set({ commanderQuery: q }),

  searchCommanders: async (query) => {
    if (!query.trim()) return;
    set({ commanderSearching: true });
    try {
      const { data } = await api.searchCommanders(query.trim());
      set({ commanderResults: data.data });
    } catch (err) {
      set({ commanderResults: [] });
    } finally {
      set({ commanderSearching: false });
    }
  },

  clearCommanderSearch: () =>
    set({ commanderQuery: '', commanderResults: [], commanderSearching: false }),
}));
