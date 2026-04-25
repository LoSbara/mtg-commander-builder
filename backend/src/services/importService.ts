/**
 * importService.ts — parser di liste mazzo in vari formati.
 *
 * Formati supportati:
 * - MTGO/Moxfield:    "1 Lightning Bolt"
 * - Arena:            "1 Lightning Bolt (MH3) 123"
 * - Con suffisso x:   "4x Mountain"
 * - Solo nome:        "Lightning Bolt"
 * - Sezioni:          "// Commander", "// Deck", "// Sideboard", "# Lands"
 */

export interface ParsedCard {
  quantity: number;
  name: string;
}

// Rimuove appendici Arena: (SET) numero, varianti foil, ecc.
function cleanCardName(raw: string): string {
  return raw
    .replace(/\s+\([A-Z0-9]{2,6}\)\s+\d+.*/i, '') // Arena: (SET) 123
    .replace(/\s+\*[A-Z]+\*\s*$/i, '')              // *F*, *E*, ecc.
    .trim();
}

export function parseDeckList(text: string): ParsedCard[] {
  const results: ParsedCard[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();

    // Righe vuote o commenti/sezioni
    if (!line) continue;
    if (line.startsWith('//') || line.startsWith('#')) continue;
    if (/^(deck|sideboard|commander|companion)$/i.test(line)) continue;

    // Formato: "1 Card Name" oppure "4x Card Name"
    const withQty = line.match(/^(\d+)x?\s+(.+)$/i);
    if (withQty) {
      const quantity = Math.min(parseInt(withQty[1], 10), 99); // sanity cap
      const name = cleanCardName(withQty[2]);
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        results.push({ quantity, name });
      }
      continue;
    }

    // Formato: solo nome carta (senza quantità)
    const name = cleanCardName(line);
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      results.push({ quantity: 1, name });
    }
  }

  return results;
}
