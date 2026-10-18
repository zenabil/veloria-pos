// Veloria PoS — Shared: préférences d'interface thème/densité (localStorage uniquement).
// Jamais la base SQLite. Sombre + confortable par défaut (ADR-033).
// Déplacé depuis src/app/shell (use-theme.ts/use-density.ts) pour que les
// rubriques Paramètres y accèdent sans inverser le sens shell→features.
import { useCallback, useEffect, useState } from "react";

export const THEME_KEY = "veloria.theme";
export const DENSITY_KEY = "veloria.density";

export type Density = "comfortable" | "compact";

export function initialDensity(): Density {
  // Préférence d'interface uniquement (pas une donnée métier).
  try {
    return window.localStorage.getItem(DENSITY_KEY) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

export type Theme = "dark" | "light";

export function initialTheme(): Theme {
  // Préférence d'interface uniquement (pas une donnée métier).
  try {
    return window.localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

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

function applyDensity(density: Density): void {
  document.documentElement.dataset["density"] = density;
}

export function useDensity(): { density: Density; toggleDensity: () => void } {
  const [density, setDensity] = useState<Density>(initialDensity);
  useEffect(() => {
    applyDensity(density);
  }, [density]);
  const toggleDensity = useCallback(() => {
    setDensity((d) => {
      const next: Density = d === "compact" ? "comfortable" : "compact";
      try {
        window.localStorage.setItem(DENSITY_KEY, next);
      } catch {
        /* préférence non persistée, état conservé en mémoire */
      }
      return next;
    });
  }, []);
  return { density, toggleDensity };
}
