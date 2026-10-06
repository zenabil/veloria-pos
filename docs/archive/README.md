# docs/archive — Archives (lecture seule, jamais importées)

> Règle : aucun code (`src/`, `electron/`, `scripts/`, `tests/`) n'importe
> depuis `docs/archive/`. Le scanner de secrets (`scripts/licensing/secret-scan.mjs`)
> couvre `docs/archive/stitch/` à titre préventif uniquement.

## root-legacy/ — rapports historiquement à la racine (2026-09)

Déplacés le 2026-10-02 via `git mv` (historique préservé) pour garder la racine
lisible — seuls `README.md` + `AGENTS.md` restent à la racine.

| Fichier d'origine           | Nouveau chemin                           | Note                                                                  |
| --------------------------- | ---------------------------------------- | --------------------------------------------------------------------- |
| `AUDIT_REPORT.md`           | `root-legacy/AUDIT_REPORT-2026-09-29.md` | Version racine ≠ `docs/reports/AUDIT_REPORT.md` (les deux conservées) |
| `CLEANUP_REPORT.md`         | `root-legacy/CLEANUP_REPORT.md`          | Nettoyage Phase 2 zéro-impureté                                       |
| `FIX_PLAN.md`               | `root-legacy/FIX_PLAN.md`                | Plan P0→P1→P2 issu de l'audit Phase 1                                 |
| `INVOICES_DESIGN.md`        | `root-legacy/INVOICES_DESIGN.md`         | Spec documents A4/thermique/étiquette N&B + QR                        |
| `PHASE_2_REPORT.md`         | `root-legacy/PHASE_2_REPORT.md`          | Version racine ≠ `docs/reports/PHASE_2_REPORT.md`                     |
| `PHASE_3_REPORT.md`         | `root-legacy/PHASE_3_REPORT.md`          | Version racine ≠ `docs/reports/PHASE_3_REPORT.md`                     |
| `PHASE_4_REPORT.md`         | `root-legacy/PHASE_4_REPORT.md`          | Version racine ≠ `docs/reports/PHASE_4_REPORT.md`                     |
| `PHASE_CLIENT_V1_REPORT.md` | `../reports/PHASE_CLIENT_V1_REPORT.md`   | Sans conflit → promu dans `docs/reports/` (canonique)                 |

## stitch/ — maquettes Stitch (HTML/PNG, non-code)

`stitch/stitch_veloria_client_mobile_app/` : 13 dossiers de maquettes APK
(`*_fr/` + `veloria_industrial_client/DESIGN.md`), déplacés depuis la racine
le 2026-10-02. Référence design : `docs/ADR-033/035/036` + `ADR-055`.
Ne jamais empaqueter (ni POS ni APK) — exclu d'ESLint/Prettier, scanné
uniquement contre les secrets.
