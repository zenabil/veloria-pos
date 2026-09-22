# Licensing — ACTIVATION (guide opérateur + client)

## Côté client (Veloria POS, 100 % hors-ligne)

1. Ouvrir POS ⇒ fenêtre **Activation de Veloria POS** (ou module Licence).
2. Relever l'**identifiant matériel** affiché (bouton **Copier** = empreinte
   complète), le transmettre au fournisseur (téléphone/e-mail, aucun réseau
   requis par POS).
3. Recevoir `Veloria-POS-<ID>.vlic`, cliquer **Importer la licence**,
   sélectionner le fichier.
4. Statut `Licence valide` ⇒ la caisse s'ouvre (modules filtrés selon la
   licence, badge visible dans l'en-tête). Sinon message FR précis
   (autre ordinateur / expirée / révoquée / suspendue / invalide) — sans
   détail sensible.

## Badge licence (header)

État permanent texte + couleur (jamais la couleur seule) : `LICENCE ACTIVE`,
`EXPIRATION BIENTÔT` / `EXPIRATION DANS X J` (seuils 30/7 j), `LICENCE
EXPIRÉE/RÉVOQUÉE/SUSPENDUE/INVALIDE`, `ACTIVATION REQUISE`. Clic ⇒ modal
(statut, type, licence, client, expiration, appareil — aucun secret).

## Côté vendor (License Manager)

1. Ouvrir le Manager (clé privée requise, sinon création/export refusés).
2. **Nouvelle licence** : identité client (nom, magasin, ID, référence) ⇒
   plan (charge un preset **modifiable**) ⇒ durée ⇒ appareils (liaison
   on/off, max) ⇒ **PAGE ACCESS** (17 cases) ⇒ **FEATURE ACCESS** (14 cases)
   ⇒ notes ⇒ **Générer la licence**.
3. Sélectionner la licence ⇒ **Exporter .vlic** ⇒ transmettre au client.
4. Cycle de vie : **Renouveler** (nouvelles dates, capabilities conservées),
   **Transférer** (nouvelle empreinte), **Suspendre**/**Réactiver** (statut
   signé, effet au réimport), **Ré-émettre** (pages/features modifiées),
   **Révoquer** (définitif côté registre). Voir RENEWAL.md, TRANSFER.md,
   REVOCATION.md.

## Outils opérateur (machine vendor, sans GUI)

- `npx electron ./scripts/licensing/issue-local-license.cjs` : émet un
  .vlic 12 mois « professional » pour CE poste (vrai code Manager + vraie
  clé), l'enregistre dans le registre Manager et le dépose sur le Bureau
  (contre-vérifié avec la clé publique embarquée du POS).
- `npx electron ./scripts/licensing/import-local-license.cjs <fichier.vlic>` :
  importe dans l'état RÉEL du POS (DPAPI) et affiche le statut vérifié.
  (CommonJS volontaire : l'ESM suspend `app.whenReady()` sur ce runtime.)

## Dépannage

- « Fichier illisible » : renvoyer le .vlic (corruption de transfert).
- « Autre ordinateur » : le client a changé de poste ou réinstallé Windows
  (MachineGuid régénéré) ⇒ TRANSFER.
- « Clé privée introuvable » (Manager) : voir KEY_MANAGEMENT.
