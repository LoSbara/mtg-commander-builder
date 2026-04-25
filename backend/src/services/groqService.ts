/**
 * groqService.ts — provider AI basato su Groq (cloud, gratuito).
 *
 * Groq offre inferenza ultra-rapida su modelli come llama-3.3-70b.
 * Configurare GROQ_API_KEY nel .env per attivare questo provider.
 * API key: https://console.groq.com
 */

import Groq from 'groq-sdk';
import type { Card } from 'shared';
import type { AISuggestions, TrimSuggestions } from './ollamaService';
import { buildPrompt, buildTrimPrompt } from './ollamaService';

// Modelli supportati da Groq (free tier)
export const GROQ_MODELS = [
  'llama-3.3-70b-versatile',   // migliore qualità, ideale per MTG
  'llama-3.1-8b-instant',      // più veloce, buono per test
  'mixtral-8x7b-32768',        // buon compromesso
] as const;

export const DEFAULT_GROQ_MODEL = GROQ_MODELS[0];

export function isGroqConfigured(): boolean {
  return !!process.env.GROQ_API_KEY;
}

export async function getTrimSuggestionsGroq(
  commander: Card,
  nonCommanderCards: Card[],
  cutCount: number,
  model?: string
): Promise<TrimSuggestions> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_NOT_CONFIGURED');

  const targetModel = model ?? DEFAULT_GROQ_MODEL;
  const prompt = buildTrimPrompt(commander, nonCommanderCards, cutCount);

  const client = new Groq({ apiKey });
  let content: string;
  try {
    const completion = await client.chat.completions.create({
      model: targetModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 3000,
    });
    content = completion.choices[0]?.message?.content ?? '';
  } catch (err: unknown) {
    const anyErr = err as { status?: number };
    if (anyErr.status === 401) throw new Error('GROQ_INVALID_KEY');
    if (anyErr.status === 404) throw new Error(`MODEL_NOT_FOUND: ${targetModel}`);
    if (anyErr.status === 429) throw new Error('GROQ_RATE_LIMIT');
    throw err;
  }

  const jsonMatch = content.trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('JSON non trovato nella risposta trim Groq.');

  let parsed: TrimSuggestions;
  try {
    parsed = JSON.parse(jsonMatch[0]) as TrimSuggestions;
  } catch {
    throw new Error('JSON malformato nella risposta trim Groq.');
  }

  if (!Array.isArray(parsed.cuts)) parsed.cuts = [];
  if (!parsed.analysis) parsed.analysis = '';
  return parsed;
}

export async function getSuggestionsGroq(
  commander: Card,
  currentCards: Card[],
  model?: string
): Promise<AISuggestions> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_NOT_CONFIGURED: GROQ_API_KEY non impostata.');
  }

  const targetModel = model ?? DEFAULT_GROQ_MODEL;
  const prompt = buildPrompt(commander, currentCards, commander.color_identity);

  const client = new Groq({ apiKey });

  let content: string;
  try {
    const completion = await client.chat.completions.create({
      model: targetModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 2048,
    });
    content = completion.choices[0]?.message?.content ?? '';
  } catch (err: unknown) {
    // Groq restituisce errori con codice status
    const anyErr = err as { status?: number; message?: string };
    if (anyErr.status === 401) {
      throw new Error('GROQ_INVALID_KEY: API key Groq non valida. Controlla GROQ_API_KEY nel .env');
    }
    if (anyErr.status === 404) {
      throw new Error(`MODEL_NOT_FOUND: Modello "${targetModel}" non disponibile su Groq.`);
    }
    if (anyErr.status === 429) {
      throw new Error('GROQ_RATE_LIMIT: Rate limit Groq raggiunto. Riprova tra qualche secondo.');
    }
    throw err;
  }

  const jsonMatch = content.trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Il modello non ha restituito JSON valido.');
  }

  let parsed: AISuggestions;
  try {
    parsed = JSON.parse(jsonMatch[0]) as AISuggestions;
  } catch {
    throw new Error('JSON malformato nella risposta di Groq.');
  }

  // Normalizzazione
  if (!Array.isArray(parsed.suggestions)) parsed.suggestions = [];
  if (!parsed.overview) parsed.overview = '';
  if (!parsed.manaBase) parsed.manaBase = { totalLands: 36, breakdown: '', recommendations: [] };
  if (!parsed.manaCurveAdvice) parsed.manaCurveAdvice = '';

  return parsed;
}
