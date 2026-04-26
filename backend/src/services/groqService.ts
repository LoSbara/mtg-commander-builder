/**
 * groqService.ts — provider AI basato su Groq (cloud, gratuito).
 *
 * Groq offre inferenza ultra-rapida su modelli come llama-3.3-70b.
 * Configurare GROQ_API_KEY nel .env per attivare questo provider.
 * API key: https://console.groq.com
 */

import Groq from 'groq-sdk';
import type { Card } from 'shared';
import type { AISuggestions, TrimSuggestions, WeaknessAnalysis } from './ollamaService';
import { buildPrompt, buildTrimPrompt, buildWeaknessPrompt } from './ollamaService';
import type { EDHRecCard } from './edhrecService';

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
  model?: string,
  edhrecCards?: EDHRecCard[]
): Promise<AISuggestions> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_NOT_CONFIGURED: GROQ_API_KEY non impostata.');
  }

  const targetModel = model ?? DEFAULT_GROQ_MODEL;
  const prompt = buildPrompt(commander, currentCards, commander.color_identity, edhrecCards);

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
  // Normalizza categories, bracket, isGameChanger, isMassLandDenial
  parsed.suggestions = parsed.suggestions.map((s) => {
    const raw = s as AISuggestions['suggestions'][0] & { category?: string };
    if (!Array.isArray(s.categories)) {
      s.categories = raw.category ? [raw.category] : [];
    }
    if (!s.bracket || s.bracket < 1 || s.bracket > 5) s.bracket = 2;
    s.isGameChanger = !!s.isGameChanger;
    s.isMassLandDenial = !!s.isMassLandDenial;
    return s;
  });

  return parsed;
}

export async function getWeaknessAnalysisGroq(
  commander: Card,
  currentCards: Card[],
  model?: string
): Promise<WeaknessAnalysis> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_NOT_CONFIGURED');

  const selectedModel = model ?? DEFAULT_GROQ_MODEL;
  const prompt = buildWeaknessPrompt(commander, currentCards);

  const client = new Groq({ apiKey });
  let content: string;
  try {
    const completion = await client.chat.completions.create({
      model: selectedModel,
      messages: [
        {
          role: 'system',
          content: 'You are an expert Magic: The Gathering Commander deck analyst. Always respond with valid JSON only, no markdown.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.6,
      max_tokens: 2000,
    });
    content = completion.choices[0]?.message?.content ?? '';
  } catch (err: unknown) {
    const anyErr = err as { status?: number };
    if (anyErr.status === 401) throw new Error('GROQ_INVALID_KEY');
    if (anyErr.status === 429) throw new Error('GROQ_RATE_LIMIT');
    throw err;
  }
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Risposta Groq non contiene JSON valido.');

  let parsed: WeaknessAnalysis;
  try {
    parsed = JSON.parse(jsonMatch[0]) as WeaknessAnalysis;
  } catch {
    throw new Error('JSON malformato nella risposta Groq.');
  }

  // Normalizzazione
  if (!parsed.overallAssessment) parsed.overallAssessment = '';
  if (!Array.isArray(parsed.weaknesses)) parsed.weaknesses = [];
  if (!Array.isArray(parsed.strengths)) parsed.strengths = [];
  if (!Array.isArray(parsed.winConditions)) parsed.winConditions = [];
  if (!parsed.bracket || parsed.bracket < 1 || parsed.bracket > 5) parsed.bracket = 2;
  parsed.weaknesses = parsed.weaknesses.map((w) => ({
    category: w.category || '',
    severity: (['low', 'medium', 'high'] as const).includes(w.severity) ? w.severity : 'medium',
    description: w.description || '',
    suggestions: Array.isArray(w.suggestions) ? w.suggestions : [],
  }));

  return parsed;
}
