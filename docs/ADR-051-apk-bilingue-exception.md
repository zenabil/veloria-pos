# ADR-051 — Exception bilingue limitée à l'APK client (le POS reste FR uniquement)

Date : 2026-09-29
Statut : accepté (V1)

## Contexte

Règle `AGENTS.md` n°6 : UI du POS en français uniquement. Les 40 clients finaux sont arabophones/francophones, souvent peu techniques, dont des seniors. Un APK en français seul ferait échouer l'adoption.

## Décision

- Exception strictement limitée à `mobile/` : arabe par défaut, français secondaire, mêmes clés, bascule instantanée avec retournement RTL/LTR complet.
- Le POS (`src/`, Electron, tickets) reste français uniquement. Aucune chaîne arabe n'entre dans le POS ni dans SQLite métier (hors nom client déjà saisi par le commerçant).
- Glossaire fermé V1 (~30 clés) : Dette restante, Total achats, Points info non échangeables, Dernière synchro, Mes factures/paiements, statuts Payée/Partielle/Non payée/Annulée, Avance sur compte, À jour/Endetté/En retard/Dépassement, messages hors-ligne unifiés.
- Montants : centimes affichés `12 500,00 DZD/دج` en police Mono comme le ticket. Dates stockées `AAAA-MM-JJ`, affichées `JJ/MM/AAAA` dans les deux langues.
- Polices système uniquement (offline, 0 $). Icônes `lucide` comme le POS, jamais de CDN.

## Conséquences

- Tout ajout de texte APK exige les deux langues dès le premier commit, sinon refus de revue.
- Les messages d'erreur techniques bruts sont interdits côté client : une seule phrase humaine + un seul bouton d'action.

## Vérification

- Revue du glossaire avant tout écran. Test RTL/LTR sur chaque écran V1.
