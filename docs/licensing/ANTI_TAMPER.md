# Licensing — ANTI_TAMPER

## Couches (defense in depth, pas de check unique)

1. **Crypto** : Ed25519, clé privée hors POS (falsification ⇒ signature).
2. **Hardware binding** : copie inter-postes ⇒ `INVALID_HARDWARE`.
3. **État chiffré** : DPAPI/safeStorage ; édition ⇒ `CORRUPTED_STATE`.
4. **Horloge** : rollback ⇒ `CLOCK_ROLLBACK` (données intactes).
5. **Intégrité binaire** : manifeste signé vendor (`dist-electron/**`,
   `dist/**`, clé publique) vérifié au démarrage packagé ; écart ⇒
   `TAMPER_DETECTED`. Pipeline `package:pos` le (re)signe à chaque release.
6. **IPC/main** : décision main, renderer affichant ; surface minimale.
7. **Build** : `license:scan` (clés/bypass/sourcemaps) en `prepackage`,
   `sourcemap:false`, asar, pas de `run-sql`.

## Réponse (jamais destructive)

Détection ⇒ log horodaté (sans secret) + restriction (mutations bloquées /
fenêtre d'activation) + message FR + **données 100 % préservées**.
Aucune suppression/corruption/chiffrement de représailles (interdit).

## Obfuscation

Non appliquée (coût/maintenance > gain face à la signature : un binaire
offusqué mais non signé reste contournable ; un binaire signé se défend par
la clé). Réévaluable pour le renderer si distribution à risque.
