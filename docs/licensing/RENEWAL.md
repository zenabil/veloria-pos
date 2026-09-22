# Licensing — RENEWAL

Sans réinstallation, sans toucher SQLite : le client importe simplement le
nouveau .vlic (même `licenseId`, nouvelles dates, nouvelle signature).

- Manager : fiche licence ⇒ **Renouveler** ⇒ durée (mois / à vie) ⇒ nouveau
  `.vlic` à exporter. L'ancien reste valide jusqu'à sa propre expiration
  (chevauchement de grâce assumé, pas de coupure). **Capabilities
  (pages/features) et identité client conservées** ; le renouvellement lève
  aussi une éventuelle suspension (statut signé réinitialisé).
- Licence révoquée : renouvellement **refusé** (lever la révocation = créer
  une nouvelle licence, traçé dans `license_events`). Voir REVOCATION.md
  pour suspendre/réactiver sans renouveler.
- Licence révoquée : renouvellement **refusé** (lever la révocation = créer
  une nouvelle licence, traçé dans `license_events`).
- Expirée côté POS : coquille en lecture seule + bannière ; l'import
  réactive immédiatement (mutations + shell complet).
