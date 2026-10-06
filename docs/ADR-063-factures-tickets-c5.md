# ADR-063 — Factures & tickets niveau mondial (Phase C5)

Date : 2026-10-03. Statut : accepté (pipeline vert, 35 migrations).

Note de numérotation : `ADR-062` est l'organisation 2026 (Phase A3) —
le Print Studio (Phase C6) prendra `ADR-064`.

## Contexte

Audit du système d'impression : builders déterministes purs
(`receipt-documents.ts`, zéro import) + pipeline main
(`printing.service.ts` : Zod → logo → identité → réglages → QR → print).
Écarts relevés avant correctif : largeur 58mm inopérante (P0), texte
thermique sans largeur (coupe possible), pas de timbre, pas de NIS/Article,
QR sans NIS, avoir sans origine ni TVA, étiquettes sans QR.

## Décisions

1. **Thermique 58/80 sans coupe** : `thermalCols` (58→32, 80→42) +
   `wrapThermal`/`thermalRow`/`thermalField`/`thermalItem` — les montants ne
   sont jamais coupés, les libellés s'enroulent. Les 6 builders texte
   prennent `width`, les handlers propagent `getThermalWidth()`. Le format
   historique `Libellé : valeur` est conservé sur les lignes texte
   (compatibilité des tests et habitudes caisse) ; les montants sont alignés
   à droite. Montant en lettres ajouté au ticket et au reçu.
2. **58mm réparé (P0)** : `PrintTemplatesScreen` écrivait/lisait `"58"` alors
   que le schéma et le service exigent `"58mm"` (l'enregistrement échouait en
   erreur de validation) — corrigé aux deux bouts.
3. **Identité DZ complète** : migration **0035** (`nis`,
   `article_imposition` NULLables sur `company_profile`) + repo + Zod +
   fiche Paramètres + `withCompanyIdentity` (repli DB) + mentions
   `RC · NIF · NIS · Art` (A4, tickets, reçus) + QR étendu
   `VELORIA|N°|TTC|DATE|RC|NIF|NIS|VENDEUR` (format propriétaire, l'APK ne
   parse que le QR d'activation `VELORIA1` — sans impact).
4. **Timbre LF 2025 (Art. 100)** : barème officiel par tranches de 100 DA
   (1 / 1,5 / 2 DA, plancher 5 DA, > 300 DA, espèces uniquement),
   `src/domain/invoice/timbre-rules.ts` + miroir main (parité testée).
   Ligne DOCUMENTAIRE : le total vente DB reste `subtotal − remise +
livraison` (CHECK 0001, jamais touché) ; le net documentaire vaut
   `total + timbre`, les lettres portent sur le net. Cohérence fail-closed
   au frontière (`stampMinor` doit égaler le recalcul sur l'encaissé
   espèces, 0 sinon). Reçus de règlement : hors périmètre (suivi documenté).
5. **Avoir** : `originNumber` sur le bon de retour (schéma + tiroir Retours)
   - ventilation HT/TVA du retour (A4 + thermique).
6. **Étiquettes** : QR opt-in du code-barres sous le Code 39 (schéma `qr`,
   génération main mise en cache par code, case dans `LabelsDialog`).
7. Tous les payloads tickets vente passent par `buildSaleTicketPayload`
   (timbre + NIS/Article centralisés) sauf Retours (2 payloads manuels
   alignés) et caisse (builder dédié, timbre ajouté).

## Non-décisions

- Centimes en chiffres dans les lettres (`… et 50 centimes`) : pratique DZ
  courante, conservée et testée.
- `BEGIN IMMEDIATE`, totaux DB avec timbre, timbre sur reçus : refusés
  (breaking / scope) — voir § Suites de l'ADR-061.

## Preuves

- `tests/unit/c5-timbre-thermal.test.ts` 8/8 (barème officiel, parité
  miroir, largeurs, lettres===chiffres, cohérence Zod, QR NIS, étiquettes).
- `tests/database/migrations.test.ts` : 35/35 + test 0035 ; script
  `verify-migrations` étendu (asserts 0035).
- Pipeline : `format` + `lint --max-warnings 0` + `typecheck` + `test` +
  `verify:migrations` (35) + `build` + `release:smoke` verts.
