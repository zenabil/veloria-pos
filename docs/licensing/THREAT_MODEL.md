# Licensing — THREAT_MODEL (25 menaces spec §40)

Légende : R = risque (H/M/L), P = protection existante, D = détection,
Réponse = restriction + réactivation, données toujours préservées.

| #     | Menace                             | Surface       | R   | P                                                                                        | D / Réponse               | Résiduel                         |
| ----- | ---------------------------------- | ------------- | --- | ---------------------------------------------------------------------------------------- | ------------------------- | -------------------------------- |
| 1     | Modifier licence                   | .vlic         | H   | Ed25519                                                                                  | INVALID_SIGNATURE         | —                                |
| 2     | Forger licence                     | Manager/FS    | H   | clé privée hors POS                                                                      | sans clé : impossible     | vol clé ⇒ rotation               |
| 3     | Changer expiration                 | .vlic         | H   | champ signé                                                                              | INVALID_SIGNATURE         | —                                |
| 4     | Changer Hardware ID                | .vlic         | H   | champ signé                                                                              | INVALID_SIGNATURE         | —                                |
| 5     | Changer édition                    | .vlic         | M   | champ signé                                                                              | INVALID_SIGNATURE         | —                                |
| 6-7   | ±Feature                           | .vlic         | M   | champ signé                                                                              | INVALID_SIGNATURE         | —                                |
| 8     | Copie inter-postes                 | fichier       | H   | binding HW                                                                               | INVALID_HARDWARE          | VMs clonées                      |
| 9     | État local édité                   | userData      | M   | DPAPI                                                                                    | CORRUPTED_STATE           | DPAPI contourné admin\*          |
| 10    | SQLite POS éditée                  | .sqlite       | M   | état séparé (jamais SQLite→licence)                                                      | sans effet sur licence    | —                                |
| 11    | Horloge reculée                    | OS            | M   | lastSeen chiffré                                                                         | CLOCK_ROLLBACK            | avance indétectable              |
| 12    | Renderer patché                    | dist/         | M   | décision main                                                                            | sans effet (garde main)   | —                                |
| 13    | Preload patché                     | dist-electron | M   | manifeste signé                                                                          | TAMPER_DETECTED           | resignature totale\*             |
| 14    | Main patché                        | dist-electron | H   | manifeste signé                                                                          | TAMPER_DETECTED           | resignature totale\*             |
| 15    | ASAR dépaqueté/repaqueté           | asar          | H   | manifeste (fichiers internes hashés)                                                     | TAMPER_DETECTED           | resignature totale\*             |
| 16    | Fichiers remplacés                 | install       | M   | manifeste                                                                                | TAMPER_DETECTED           | resignature totale\*             |
| 17    | IPC forgé                          | renderer      | M   | Zod + garde main                                                                         | rejet / LICENSE_REQUIRED  | —                                |
| 18    | Check supprimé (NOP)               | binaire       | H   | checks distribués (chaque handler + startup + OCR)                                       | autres couches tiennent   | resignature totale\*             |
| 19    | Sans activation                    | UX            | M   | fenêtre bloquante (tous modes, aucun bypass)                                             | UNACTIVATED               | builds dev exigent la clé vendor |
| 20    | Licence autre produit              | .vlic         | L   | productId signé                                                                          | INVALID_PRODUCT           | —                                |
| 21-22 | Installer/resources extraits       | release/      | L   | rien de secret dedans                                                                    | N/A (clé publique seule)  | —                                |
| 23    | Vol clé privée                     | vendor        | H   | gitignore/scan/procédure                                                                 | rotation + ré-émission    | fenêtre pré-rotation             |
| 24    | Source maps                        | dist/         | L   | sourcemap:false + scan                                                                   | build stoppé              | —                                |
| 25    | Backups copiés                     | .vposdb       | L   | backups = données, pas droits                                                            | sans effet licence        | —                                |
| 26    | Page activée via URL               | renderer      | M   | Route Guard + garde page main                                                            | Fonction non disponible   | —                                |
| 27    | Feature activée via IPC direct     | renderer      | M   | gardes main par canal (registry + printing/backup/ocr)                                   | FEATURE/PAGE_NOT_LICENSED | —                                |
| 28    | React State / localStorage patchés | renderer      | M   | décision main sur payload signé                                                          | sans effet                | —                                |
| 29    | Plan usurpé (`PRO` forgé)          | .vlic         | M   | plan informatif, capabilities signées                                                    | INVALID_SIGNATURE         | —                                |
| R-DEV | —                                  | —             | —   | SUPPRIMÉ : enforcement permanent, y compris dev (clé vendor requise pour tout lancement) | —                         | —                                |

\* Admin local motivé + resignature complète (clé attaquant + clé publique
substituée + état régénéré) : limite théorique de tout licensing offline —
coût élevé, couches multiples, aucune donnée client compromise.
