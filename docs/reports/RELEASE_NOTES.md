# Veloria PoS 2.0.0 — Notes de version

Socle offline-first SQLite + 15 modules FR (caisse keyboard-first, catalogue,
clients, stock/fournisseurs, historique, retours, dépenses, dettes, rapports +
clôture Z, pain, proformas, zakat, paramètres).

Base : `Veloria POS DB.sqlite` (schéma v20 — migrations 0001 à 0020),
`%PROGRAMDATA%\Veloria PoS\Data` par défaut. Sauvegardes `.vposdb`
(VACUUM INTO), restauration avec snapshot, déplacement vérifié.
Tickets 80mm + factures A4.

Mises à jour : réinstallation complète (l'application n'installe jamais rien
toute seule — elle annonce une version plus récente dans « À propos » et
ouvre la page de la release dans le navigateur ; voir
`docs/ADR-186-detection-mise-a-jour-pilotee-proprietaire.md`). Avant
installation, vérifier `SHA256SUMS.txt`. Sans signature de code :
Windows SmartScreen peut demander confirmation — c'est attendu
(décision assumée, voir `docs/ADR-023-offline-release.md`).

Licences par client (voir `docs/licensing/CAPABILITIES.md`, ADR-026) :
le Manager émet des `.vlic` différenciés — 17 pages et 14 fonctions
activables par licence, plans BASIC/STANDARD/PRO/ENTERPRISE/CUSTOM comme
presets modifiables, liaison appareil optionnelle, suspension/révocation
offline (effet au réimport). Côté POS : sidebar filtrée, garde de route
(« Fonction non disponible »), contrôles main sur chaque opération sensible
(impression, sauvegardes, OCR, ventes à crédit/partielles) et badge d'état
dans l'en-tête avec détail au clic. Licences existantes : toujours valides,
plein accès (compatibilité ascendante).
