# ADR-036 — Vague Stitch 2 : détails caisse, presets, réimpression, matériel

Date : 2026-09-28 (prolonge ADR-035).

## Ajouts (libellés + fonctions réelles, métier inchangé)

- Caisse : `PayDialog` → `Total Net à Payer`, `Montant Donné`, `Espèces (Caisse
locale)`, `Valider & Encaisser [Entrée]` (Entrée déjà câblé via Modal
  `data-primary`) ; panneau `Total Net à Payer` (mono) ; `Dernière Vente
Validée · Ticket 80mm / Facture A4 [F2]` ; `CustomItemDialog` + champ Qté
  (défaut 1, strict `roundQuantity`, article libre toujours hors stock).
- Tableau de bord : export CSV réel `rapport-du_au.csv` (KPI + journalier +
  moyens) sur `Exporter rapport [F8]` (référence = footer global F8).
- Rapports : presets `Ce Mois / Mois Précédent / Trimestre Q3 / Exercice 2025`
  (UTC) + bouton `Générer Rapport [F8]` (corrige l'incohérence F8/F9).
- Historique : `Réimprimer Dernier [F6]` (rouvre le ticket le plus récent,
  liste antéchronologique) + placeholder `N° Ticket, Client, Réf, Code-barre…`.
- Paramètres : section `Imprimante Thermique 80mm` (note RJ11 honnête :
  impulsion via pilote, pas de pilotage direct), `Tester Connexions Matériel`
  (imprimantes détectées + intégrité base + sauvegardes, sans papier),
  `Sauvegarder Base DB`.

## Non-faits volontaires (documentés)

- Multi-casses `#02`, TVA/G50/SCF, pilotage ESC/POS natif, VFD/balance,
  Relance SMS/WA, clôture X : pas de données/domaine sous-jacent — aucune
  invention (chiffres/fonctions fictifs interdits). Écarts tracés ici.

## Vérification

- `typecheck` vert, `vite build` + `build:electron` (re-signature integrity
  130 fichiers), démarrage nominal sans `license.required` ni `handler.failed`.
