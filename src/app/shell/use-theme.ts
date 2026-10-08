// Veloria PoS — Thème clair/sombre (préférence d'interface, localStorage uniquement).
// Jamais la base SQLite. Sombre par défaut (ADR-033) ; clair = surcharge CSS seule.
import { useCallback, useEffect, useState } from "react";
import { THEME_KEY, initialTheme, type Theme } from "./shell-types.ts";

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.dataset["theme"] = theme;
  root.style.colorScheme = theme === "light" ? "light" : "dark";
}

export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === "light" ? "dark" : "light";
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch {
        /* préférence non persistée, état conservé en mémoire */
      }
      return next;
    });
  }, []);
  return { theme, toggleTheme };
}
