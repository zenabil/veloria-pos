# INVOICES_DESIGN.md — Veloria POS — Documents A4 / thermique / étiquette (N&B, QR, HT/TVA/TTC)

> Sources 2025-2026 : Electron `webContents.print` + `printToPDF` (docs Electron 37), CSS `@page size:A4/58mm/80mm`, Code 39 ISO 16388 (déjà vendored `receipt-documents.ts:108-187`), QR ISO 18004 (générateur pur ci-dessous, zéro réseau), e-invoicing DZ (RC/NIF obligatoires sur facture), bonnes pratiques thermique (largeur 58/80mm, monospace, pas de fonds gris).
> Principe : aperçu = impression (même builder main), données SQLite 100%, N&B seul (`#FFFFFF`/`#000000`), logo grayscale CSS, montants en centimes.

---

## 1. Hiérarchie commune (tous documents)

```
[Logo grayscale] RAISON SOCIALE — RC : … · NIF : …
Adresse — Ville · Tél · Email
════════════════════════════════
TITRE DOCUMENT (FACTURE / TICKET / DEVIS / REÇU / BL / BON RETOUR / BON DE COMMANDE)
N° : … · Date : … (fr-FR) · Échéance : … · Vendeur : … · Client : … (code+tél+adresse)
[Code-barres Code39 N°] [QR : N°|TTC|DATE|RC|NIF]
────────────────────────────────
Tableau : Réf. | Désignation | Qté | P.U. | Total (centimes → fr-FR + DA)
────────────────────────────────
Sous-total | Remise | [Total HT | TVA x% | Total TTC] | Livraison | TOTAL TTC
Payé | Reste/Monnaie | Ancien solde | Nouveau solde (si concerné)
Mode de paiement (FR, masqué si inconnu)
Montant en lettres (français 70-99, dinars algériens)
Notes / Conditions / Validité
Signatures (client / cachet) · Pied légal (RC/NIF/adresse/tél + footer paramétrable)
Page 1 / 1
```

- Facture A4 : tout le bloc. Ticket 58/80mm : même contenu en monospace condensé (`PRODUIT QTE P.U. TOTAL`).
- TVA : `htMinor = round(totalTTC*100/(100+taux))` si taux>0, `tvaMinor = totalTTC-htMinor` (centimes, sans float). Taux depuis Paramètres→Facturation (`tvaRatePercent`, défaut 0 = pas de TVA, cohérence caisse actuelle).
- QR payload : `VELORIA|<N°>|<TTC centimes>|<DATE ISO>|<RC>|<NIF>|<VENDEUR>` → SVG QR (ECC M, marge 4 modules, `fill #000` sur `#fff`).
- Couleurs : `body{background:#fff;color:#000}`, bordures `#000`, `.muted{color:#000}`, `th{background:#fff}`, barcode `fill="#000"`. Aucun gris.

## 2. Maquettes

### 2.1 Facture A4 (210×297mm, marges 15mm)

- En-tête : logo (max 64px, `filter:grayscale(1)`) + raison sociale 22px bold + mentions 12px + cartouche `FACTURE` bordure 2px `#000` + N°/Date/Échéance/Vendeur + Code39 + QR côte à côte.
- Client : grille 2 col, bordure 1px `#000`. Tableau : bordures 1px `#000`, header fond `#fff` bold. Totaux : tableau 300px droite, `TOTAL TTC` 15px bold. Lettres italique. Signatures : 2 cases 90px. Pied : centré 11px + `Page 1/1`.

### 2.2 Ticket 58mm (largeur 200px, monospace 11px) / 80mm (280px, 12px)

- `*** RAISON ***`, adresse, `TICKET DE CAISSE`, N°, Date, Vendeur, Client, `PRODUIT QTE P.U. TOTAL`, lignes tronquées proprement (pas de coupe milieu-mot), `Sous-total/Remise/HT/TVA/TTC/Payé/Reste/Monnaie`, `Mode : ESPÈCES`, `[QR: N°|TTC]`, `Merci`, `Veloria POS`, `[PAGE DE TEST]` pour calibration.
- Export PDF : 58mm → `pageSize {width:58000,height:297000}`, 80mm → `{width:80000,height:297000}`.

### 2.3 Bon de livraison / Bon retour / Bon de commande (A4 + thermique)

- BL : titre `BON DE LIVRAISON`, réf vente d'origine, lignes livrées (qté), signatures livreur/client.
- Retour : titre `BON DE RETOUR`, N° retour, cause, lignes rendues, remboursement (montant + mode), signatures.
- Commande : titre `BON DE COMMANDE`, N° CMD, fournisseur (code+tél+adresse), lignes (qté commandée + coût), total, validité, signatures.
- Tous : même hiérarchie §1, N&B, QR, Code39.

### 2.4 Reçu de règlement (80mm + A4)

- Conserver builders existants, normaliser N&B + logo grayscale + QR (`PAY|MONTANT|ANCIEN|NOUVEAU`).

### 2.5 Étiquettes

- Formats : `30x20mm` (1 col, nom 8px + prix 10px + Code39 h24), `50x30mm` (nom 10px + prix 14px + Code39 h30), `58x40mm` (thermique rouleau, 1 col), `A4-24` (3×8, défaut actuel), `custom` (WxH mm saisis, validés 10..210mm).
- `@page size:WxH`, `.label{border:1px solid #000; overflow:hidden; page-break-inside:avoid}`, N&B seul, nom ellipsis, prix bold, Code39 `#000`, code texte monospace.
- Mono (1 article × N copies) / collectif (multi-articles), 200 max conservé, aperçu vivant = HTML imprimé.

## 3. Personnalisation (Paramètres → Facturation, SQLite `app_settings.invoice`)

`showLogo, showCustomerBalance, showPreviousBalance, footerText, thankYouMessage` (existants) + `tvaRatePercent (0..100)`, `sellerDefault (caissier)`, `thermalWidth (58mm|80mm)`, `labelFormat`. Appliqués par `applyInvoiceSettings` côté main à chaque impression (jamais de préférence métier en localStorage).

## 4. Tests

- Déterminisme builders, N&B (aucune couleur hors `#fff/#000` — assertion regex sur HTML), logo `grayscale(1)`, QR déterminisme + présence, TVA arithmétique centimes (`total = ht + tva`), vendeur affiché/masqué, 58/80 largeurs, BL/retour/commande Wireframe blocks, étiquettes 5 formats.
