// Veloria PoS — Shared: compteur animé (D16, Impeccable/Operate).
// Tween 300 ms ease-out exponentiel vers la cible ; `prefers-reduced-motion`
// = valeur finale immédiate. Nombres uniquement (jamais de texte).
import { useEffect, useRef, useState } from "react";

export function useCountUp(target: number, durationMs = 300): number {
  const [shown, setShown] = useState<number>(target);
  const shownRef = useRef<number>(target);
  useEffect(() => {
    const from = shownRef.current;
    if (from === target) {
      setShown(target);
      return;
    }
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    let raf = 0;
    const t0 = typeof performance.now === "function" ? performance.now() : Date.now();
    const tick = (t: number): void => {
      const p = Math.min(1, (t - t0) / durationMs);
      // Ease-out exponentiel : démarrage franc, atterrissage doux.
      const eased = p >= 1 ? 1 : 1 - Math.pow(2, -10 * p);
      const v = Math.round(from + (target - from) * eased);
      shownRef.current = v;
      setShown(v);
      if (p < 1) raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [target, durationMs]);
  return shown;
}
