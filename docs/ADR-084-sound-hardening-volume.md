# ADR-084 — Son : volume, hydration, anti-spam (durcissement P5)

Date : 2026-10-12. Statut : accepté.

## Contexte

Moteur WebAudio local (8 sons, zéro asset) : trois trous — bip possible
avant lecture de la préférence SQLite, aucun volume (on/off seul),
rafales de scan empilant les oscillateurs ; onglet masqué jamais suspendu.

## Décision

- **Hydration** : `playTones` no-op tant que `loadSoundEnabled` n'a pas
  statué (`finally` → toujours hydraté, jamais de mutisme définitif).
- **Volume 0-100** (défaut 70) : `clampVolume`/`scaledPeak` purs et
  testés ; schéma Zod étendu (`volume`, défaut 70 — anciennes lignes
  `{enabled}` compatibles) ; `persistSoundEnabled(v, vol?)` conserve le
  volume courant (le bouton caisse ne l'efface plus) ; curseur natif
  `accent-[#fbbf24]` + aperçu `blip` (bridé) dans Réglages → Sons.
- **Anti-spam** : `minGapFor` (blip/click 50 ms, autres 0) — horodatage
  `performance.now()`, testé.
- **Suspension** : `visibilitychange` → `ctx.suspend()` (reprise
  explicite), câblé une fois, gardé SSR.

## Vérification

- `sound.test.ts` : 7 tests (clamp, crête, gaps, aller-retour, no-throw
  0/100) ; `operation-id-coverage` vert (contrat settings intact).
- `tsc -b` + `electron --noEmit` = 0 ; `eslint` = 0 ; `build` +
  `build:electron` + manifest re-signé.
- Instance dev en cours : redémarrage requis pour entendre le volume
  (code chargé au boot).
