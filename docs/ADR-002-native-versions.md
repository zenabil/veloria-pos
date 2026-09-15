# ADR-002 — Versions natives réelles vs versions projetées

**Date :** 2026-09-14 · **Statut :** Accepté

## Contexte

`04_TECH_STACK.md` cite Electron 44 / Node 24 / React 19.3 / Tailwind 4.3 « au 2026-09-14 ».
Les registres npm réels au moment de l'implémentation exposent Electron 37.x (Node 22), React 19.1.x.

## Décision

Épingler les **dernières stables réelles vérifiées** :
Electron 37.2.0, Node 22 LTS, React 19.1.1, Tailwind 4.1.5, better-sqlite3 12.2.0,
et documenter la cible Electron pour le rebuild natif (`npm run rebuild`).

## Raisons

- Choisir « correct et maintenable » plutôt qu'une version inexistante (règle §54 du prompt).
- `better-sqlite3` doit être rebuilt contre l'ABI Electron réelle, pas une version théorique.
- Montée de version Electron/Node via processus contrôlé + re-validation du smoke packagé.

## Conséquences

- `engines: node >=22 <23`, CI doit valider le chargement de `better-sqlite3` dans le runtime packagé.
- Mettre à jour cette ADR à chaque bump Electron (ABI + rebuild + test installateur).
