# CLEANUP_REPORT.md — Veloria POS — Phase 2 (zéro-impureté)

> Méthode : `git ls-files` + `git status --ignored` + `git check-ignore` avant toute suppression. Aucune migration touchée. Aucune donnée métier touchée.

## Supprimé (untracked, vérifié non-suivi avant suppression)

| Objet                                                                                    | Taille    | Preuve non-suivi                        | Motif                                                                                                              |
| ---------------------------------------------------------------------------------------- | --------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `stitch_veloria_pos_desktop_system/` (~39 fichiers `code.html`+`screen.png`+`DESIGN.md`) | maquettes | `git ls-files stitch…` = 0, `status ??` | Maquettes Stitch jamais importées/empaquetées, doublon de `docs/ADR-033..036`. Archive hors repo si besoin visuel. |
| `./eng.traineddata` (4 113 088 o)                                                        | 4,1 Mo    | `status ??`, `ls-files` = 0             | Doublon exact de `resources/ocr/lang/eng.traineddata` (OCR lit `resources/`, `electron-builder.yml:36-37`).        |
| `./fra.traineddata` (1 130 365 o)                                                        | 1,1 Mo    | idem                                    | Doublon exact de `resources/ocr/lang/fra.traineddata`.                                                             |
| `dist/`, `dist-electron/`, `dist-license-manager/`, `dist-license-manager-renderer/`     | build     | `status !!` (ignorés)                   | Artefacts régénérables (`npm run build/build:electron`). Recréés par le build final Phase 2.                       |
| `tsconfig.tsbuildinfo`, `tsconfig.electron.tsbuildinfo`                                  | caches    | ignorés (`*.tsbuildinfo`)               | Caches `tsc -b`, régénérables.                                                                                     |

## Déplacé (suivi, history préservée via `git mv`)

| Avant                                                          | Après                                    | Motif                                                                                                      |
| -------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `resources/brand-sources/veloria-pos.jpg` (350 Ko)             | `docs/brand-veloria-pos.jpg`             | 0 référence builder/src/electron — source de marque, pas ressource runtime. Hors bundle, traçabilité docs. |
| `resources/brand-sources/veloria-license-manager.jpg` (395 Ko) | `docs/brand-veloria-license-manager.jpg` | idem. Dossier `resources/brand-sources/` supprimé (vide).                                                  |

## Conservé (contrairement à l'hypothèse d'audit — correction factuelle)

- `release/` (4 exe + blockmap + `win-unpacked/`) : ignoré (`!!`), mais **conservé** — installeurs signés utiles, régénérables via `package:*`. Ajout script `clean` (ne touche jamais `release/` sans ordre explicite).
- `private/vendor-keys/` : non-suivi (ignoré), conservé localement (clé vendor). Doublon `public.key ≡ resources/license/public.key` documenté (source privée vs copie empaquetée).
- `src/application/*` vides : conservés (décision ADR-048 — suppression = churn d'imports sans gain, réservés aux use-cases).
- `0031_defensive_sale_item_discount.sql` (`??`) : conservé, `verify-migrations` vert — à committer + tagger (hors périmètre d'exécution, décision release).

## Ajouté

- Script `clean` (`package.json`) : supprime `dist*/tsbuildinfo`, jamais `release/` ni données.
- Dépendance `qrcode` (+ `@types/qrcode` dev) : génération QR réelle côté main (`printing.service.ts`), SVG N&B injecté (builders restés purs). Justification ADR-045.
- `src/domain/backup/backup-rules.ts` : règle pure des 8 fréquences (évite à la UI/test d'importer le service Electron).
