# ADR-127 — Code mort trié (vague W6) : 24 ré-exports, 2 miroirs morts, 1 dépendance fantôme

## Contexte

Vague **W6** du plan de remédiation (audit intégral 2026-10-19, §« vague
W6 ») : « clôturer l'inventaire du code mort §3.B ». Le cadre est **ADR-075**
(_« aucune suppression sans revue »_) : on ne supprime qu'un symbole dont
l'absence est **prouvée** par la recherche exhaustive du dépôt, pas par le
seul rapport de l'outil.

| #          | Constat                                                       | Sévérité | Statut                        |
| ---------- | ------------------------------------------------------------- | -------- | ----------------------------- |
| B-01       | `RAW_GUARDED_CHANNELS` non appliqué                           | P1       | **Corrigé (W4)**              |
| B-02       | `clearSecureState()` jamais appelée                           | P2       | **Supprimé**                  |
| B-03       | `buildActivationQrPayload` (V1) dupliqué dans le main         | P2       | **Miroir main supprimé**      |
| B-05..B-28 | 24 ré-exports `receipt-documents*` (barrel + `common.ts`)     | P2       | **Barrel trié**               |
| B-31       | `announcements.save` (canal IPC orphelin)                     | P2       | **Résolu en W5** (UI livrée)  |
| B-32       | `expo-constants` (dépendance mobile fantôme)                  | P2       | **Supprimé** (décision owner) |
| B-36       | `tailwindcss` listé dans `ignoreDependencies`                 | P3       | **Corrigé**                   |
| O-05       | 2 commentaires arabes dans l'impression (garde FR en attente) | P2       | **Corrigé**                   |

## Décision 1 — B-03 : le V1 n'est plus _produit_, il reste _lisible_

`buildActivationQrPayload` existait en **deux** exemplaires : le use-case
applicatif (`src/application/customers/client-access.ts`) et son **miroir**
main (`electron/ipc/handlers/client-access.repo.ts`).

- Le **lecteur** de l'APK (`mobile/src/qr.ts`) accepte **encore** le format
  `VELORIA1|phone|pin|code` (anciens QR déjà imprimés) ⇒ **le format V1 doit
  rester décrit et testé**, il n'est pas supprimé.
- Le **producteur** est unique : la voie de production est
  `buildActivationQrPayloadV2` (`VELORIA2|…`, ADR-068), appelée par
  `registry.customers.ts:144` ⇒ le **miroir main du constructeur V1 est
  mort** : supprimé.

Le use-case applicatif **conserve** son constructeur V1 : il documente le
format que l'APK sait encore lire, et son test verrouille ses bornes. Un
constructeur de format livré par le domaine n'est pas du code mort : c'est la
**spécification** du format, exécutable.

## Décision 2 — B-02 : `clearSecureState()` supprimé

Aucun flux ne l'appelait (recherche exhaustive : 1 seule occurrence, la
déclaration). L'import d'une licence **écrase** l'état (`saveSecureState`) :
il n'existe pas de « forgetting » de licence dans le POS. Une fonction de
suppression jamais appelée est un **faux sentiment de sécurité** — c'est le
code _branché_ qui compte, pas le code _présent_.

## Décision 3 — B-05..B-28 : le barrel d'impression est TRIÉ (pas vidé)

Le barrel `electron/printing/receipt-documents.ts` ré-exportait 24 symboles.
La suite de tests consomme **huit** d'entre eux par le barrel
(`escapeHtml`, `CODE39_PATTERNS`, `code39Svg`, `sanitizeCode39`,
`CODE128_WIDTHS`, `code128Svg`, `code128Symbols`, `sanitizeCode128`) : les
supprimer casse `tsc -b` (constaté et corrigé dans cette vague).

La règle appliquée : **on ne retire du barrel que ce que PERSONNE ne
consomme, où que ce soit** (recherche exhaustive sur tout le dépôt, pas
seulement sur `src/`). Restent supprimés : les blocs thermiques morts
(`thermalCenter`, `thermalFooterBlock`, `thermalSep`, `thermalSigns`,
`thermalWatermark` — utilisés seulement en interne par `thermal.ts` et ses
importateurs directs), les types de rapport non repris
(`ReportChart`, `ReportData`, `ReportKpi`, `ReportTable`, `PageOpts`,
`PaymentTicketKind`, `ThermalFooterInput`, `LabelOptions`, `ReceiptLine`) et
le bloc de ré-exports de compatibilité de `common.ts` (personne n'importe
depuis `common.ts` : tous les modules importent la source).

> **Leçon** : le rapport `knip` n'est **pas une preuve**. Il.signalait les
> huit symboles consommés par les tests comme « inutilisés » (les fichiers
> de test sont dans le `project`, mais l'usage n'a pas été compté). La
> **porte `typecheck`** a attrapé l'erreur ; c'est elle qui fait foi. Tout
> candidat à la suppression est désormais validé par **recherche exhaustive +
> `tsc -b` + suite complète**, jamais par le rapport seul.

## Décision 4 — B-32 : `expo-constants` retirée (décision du propriétaire)

La dépendance mobile n'était utilisée par **aucun** fichier source
(recherche exhaustive : 0 occurrence hors `package.json`/`package-lock.json`).
Le propriétaire a choisi l'option « retirer + lockfile régénéré » plutôt
qu'une exception `knip`.

Le `mobile/package-lock.json` n'est modifié que sur **une ligne** (la
dépendance racine) : `expo-constants` **reste** dans l'arbre comme
dépendance transitive de `expo` / `expo-file-system` (c'est correct et
voulu). La régénération par `npm install --package-lock-only` a produit un
diff supplementaire de 12 lignes (champs `libc` absents des versions
antérieures de npm) : **écarté volontairement** — ce n'est pas lié au
changement demandé et il aurait pollué la revue.

`knip` est désormais **à 0** (0 fichier, 0 export, 0 type, 0 dépendance).

## Décision 5 — O-05 : la garde FR n'a plus de liste d'attente

La workshop impression est **entrée** (ADR-097, commit `ae4e410`) : les deux
fichiers qui restaient en dérogation temporaire (`printing.payment.ts`,
`receipt-documents/payment-ticket.ts`) contiennent un terme **arabe** dans un
commentaire (« ticket تسديد الدين »). Corrigés en français (« ticket de
règlement ») ⇒ la liste `PENDING_WORKSHOP` de `verify-fr-only.mjs` est
**supprimée** : la porte redevient pleine (321 fichiers scannés) et la
dérogation temporaire n'a plus de place dans le code.

## Portes (vague W6)

`format:check` 0 · `tsc -b` 0 · `typecheck:electron` 0 ·
`eslint --max-warnings 0` 0 · **`knip` 0** · `vitest` **137 fichiers / 934
tests** 0 · `test:db` **36 fichiers / 177 tests** 0 ·
`verify:migrations` VERIFIED · `verify:domain` VERIFIED · `verify:perf`
VERIFIED · `verify:fr` 0 (321 fichiers) · `license:scan` 0 (1358 fichiers) ·
`build` ✓ · `build:electron` ✓.

## Rollback

`git revert <sha>` — la vague ne touche **aucun contrat** (aucun canal IPC
retiré, aucun schéma modifié, aucune migration) : le revert est un simple
retour de code.
