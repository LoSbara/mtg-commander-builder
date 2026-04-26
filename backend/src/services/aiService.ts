/**
 * aiService.ts — facade dual-mode: Groq (cloud) se GROQ_API_KEY è impostata,
 * altrimenti Ollama (locale).
 *
 * La route /api/ai/* usa esclusivamente questo modulo.
 */

import type { Card } from 'shared';
import type { EDHRecCard } from './edhrecService';
import {
  isOllamaAvailable,
  getAvailableModels as getOllamaModels,
  getDeckSuggestions as getDeckSuggestionsOllama,
  getTrimSuggestions as getTrimSuggestionsOllama,
  getDeckWeaknesses as getDeckWeaknessesOllama,
  getCardReplacement as getCardReplacementOllama,
} from './ollamaService';
import {
  isGroqConfigured,
  GROQ_MODELS,
  getSuggestionsGroq,
  getTrimSuggestionsGroq,
  getWeaknessAnalysisGroq,
  getCardReplacementGroq,
} from './groqService';

export type { AISuggestions, CardSuggestion, ManaSuggestion, TrimSuggestions, CardCut, WeaknessAnalysis, DeckWeakness, CardReplacementResult, CardReplacementAlt } from './ollamaService';
export type AIProvider = 'groq' | 'ollama';

export function getActiveProvider(): AIProvider {
  return isGroqConfigured() ? 'groq' : 'ollama';
}

export async function isAIAvailable(): Promise<boolean> {
  if (getActiveProvider() === 'groq') {
    return isGroqConfigured(); // la chiave c'è → consideriamo disponibile
  }
  return isOllamaAvailable();
}

export async function getAvailableModels(): Promise<string[]> {
  if (getActiveProvider() === 'groq') {
    return [...GROQ_MODELS];
  }
  return getOllamaModels();
}

export async function getDeckSuggestions(
  commander: Card,
  currentCards: Card[],
  model?: string,
  edhrecCards?: EDHRecCard[]
): Promise<Awaited<ReturnType<typeof getDeckSuggestionsOllama>>> {
  if (getActiveProvider() === 'groq') {
    return getSuggestionsGroq(commander, currentCards, model, edhrecCards);
  }
  return getDeckSuggestionsOllama(commander, currentCards, model, edhrecCards);
}

export async function getTrimSuggestions(
  commander: Card,
  nonCommanderCards: Card[],
  cutCount: number,
  model?: string
): Promise<Awaited<ReturnType<typeof getTrimSuggestionsOllama>>> {
  if (getActiveProvider() === 'groq') {
    return getTrimSuggestionsGroq(commander, nonCommanderCards, cutCount, model);
  }
  return getTrimSuggestionsOllama(commander, nonCommanderCards, cutCount, model);
}

export async function getDeckWeaknesses(
  commander: Card,
  currentCards: Card[],
  model?: string
): Promise<Awaited<ReturnType<typeof getDeckWeaknessesOllama>>> {
  if (getActiveProvider() === 'groq') {
    return getWeaknessAnalysisGroq(commander, currentCards, model);
  }
  return getDeckWeaknessesOllama(commander, currentCards, model);
}

export async function getCardReplacement(
  commander: Card,
  currentCards: Card[],
  cardToReplace: Card,
  model?: string
): Promise<Awaited<ReturnType<typeof getCardReplacementOllama>>> {
  if (getActiveProvider() === 'groq') {
    return getCardReplacementGroq(commander, currentCards, cardToReplace, model);
  }
  return getCardReplacementOllama(commander, currentCards, cardToReplace, model);
}
