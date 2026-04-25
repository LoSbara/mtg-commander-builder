import { useState, useCallback, useRef } from 'react';

/**
 * Debounce un valore: ritarda l'aggiornamento finché non si smette
 * di chiamare per `delay` ms. Utile per la ricerca live.
 */
export function useDebounce<T>(value: T, delay = 400): T {
  const [debounced, setDebounced] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Aggiorna il valore con debounce
  const update = useCallback(
    (v: T) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setDebounced(v), delay);
    },
    [delay]
  );

  // Sincronizza automaticamente se il valore cambia dall'esterno
  // (utile per reset)
  if (value !== debounced && timer.current === null) {
    setDebounced(value);
  }

  void update; // evita warning unused

  return debounced;
}
