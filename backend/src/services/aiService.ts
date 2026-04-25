/**
 * aiService.ts — facade dual-mode: Groq (cloud) se GROQ_API_KEY è impostata,
 * altrimenti Ollama (locale).
 *
 * La route /api/ai/* usa esclusivamente questo modulo.
 */

import type { Card } from 'shared';
import {
  isOllamaAvailable,
  getAvailableModels as getOllamaModels,
  getDeckSuggestions as getDeckSuggestionsOllama,
} from './ollamaService';
import {
  isGroqConfigured,
  GROQ_MODELS,
  getDeckSuggestionsGroq,
} from './groqService';

export type { AISuggestions, CardSuggestion, ManaSuggestion } from './ollamaService';
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
  model?: string
): Promise<Awaited<ReturnType<typeof getDeckSuggestionsOllama>>> {
  if (getActiveProvider() === 'groq') {
    return getDeckSuggestionsGroq(commander, currentCards, model);
  }
  return getDeckSuggestionsOllama(commander, currentCards, model);
}
