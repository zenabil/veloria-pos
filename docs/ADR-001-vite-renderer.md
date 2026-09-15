# ADR-001 — Renderer: Vite au lieu de Next.js

**Date :** 2026-09-14 · **Statut :** Accepté

## Contexte

`04_TECH_STACK.md` exige « Next.js 16.3+ App Router **ou** un setup contrôlé compatible export-statique ».
Le produit est un POS Electron offline-first avec cible démarrage ≤ 2,5 s et packaging NSIS.

## Décision

Renderer = **React 19 + Vite (build statique `dist/`)** chargé par Electron via `loadFile`.
Pas de serveur Next, pas de SSR, `base: "./"`.

## Raisons

- Démarrage plus rapide, bundle plus petit, surface d'attaque réduite (pas de serveur local).
- Intégration Electron + preload + CSP plus simple et auditable.
- Compatible avec l'alternative explicitement autorisée par la spec (« controlled static-export-compatible setup »).
- Recharts/Zustand/Radix/Lucide fonctionnent identiquement.

## Conséquences

- Routage = onglets desktop internes (shell canonique), pas de routes Next.
- Si un besoin SSR/SEO apparaît (hors scope desktop), réévaluer via nouvelle ADR.
