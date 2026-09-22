# ADR-025 — Licence hors-ligne Ed25519 + License Manager séparé

Date : 2026-09-18
Statut : appliqué

## Contexte

Distribution Windows offline : il faut lier chaque installation à une licence
payée (durées + lifetime), sans serveur, sans casser l'existant ni risquer les
données clients.

## Décisions

1. **Ed25519 (node:crypto)** : signature seule, payload canonique trié ;
   clé privée confinée machine vendor (`private/`, gitignoré), clé publique
   embarquée (`resources/license/public.key`, committée).
2. **Pas de restructure `apps/`** : POS inchangé dans son layout ; Manager
   sous `license-manager/` avec `tsconfig.manager.json` incluant
   `electron/licensing/{protocol,fingerprint}.ts` (zéro-dépendance).
3. **État chiffré DPAPI** (`safeStorage`) hors SQLite métier ; horloge
   anti-rollback chiffrée ; manifeste d'intégrité signé au build.
4. **Enforcement permanent** : aucun mode d'exécution contourné (dev inclus) —
   la garde centrale `handle()` + le startup exigent une licence valide et un
   manifeste signé (`build:electron` le (re)signe). Exigence utilisateur
   explicite : le programme ne fonctionne pas sans activation.
5. **Jamais destructif** : expiré = lecture seule ; tamper/horloge = fenêtre
   de réactivation ; données toujours préservées.

## Conséquences

- Nouveau : `electron/licensing/`, canaux `license.*`, écran Licence (FR),
  fenêtre d'activation, `package:pos` (chaîne durcie), `package:manager`.
- Tests : 28 cas licence + 11 red-team, suite existante verte.
- Docs : `docs/licensing/` (16 fichiers).
