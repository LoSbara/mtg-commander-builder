import { useEffect, useRef, useCallback } from 'react';

/**
 * Chiama `onIntersect` quando l'elemento ref entra nel viewport.
 * Usato per il caricamento infinito (load more).
 */
export function useIntersectionObserver(
  onIntersect: () => void,
  enabled = true
): React.MutableRefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const cb = useCallback(onIntersect, [onIntersect]);

  useEffect(() => {
    if (!enabled || !ref.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) cb();
      },
      { threshold: 0.1 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [cb, enabled]);

  return ref;
}
