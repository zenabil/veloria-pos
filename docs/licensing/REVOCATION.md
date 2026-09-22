# Licensing — REVOCATION (+ SUSPENSION)

## Version actuelle (offline-first)

Deux couches complémentaires :

1. **Registre vendor** : `Révoquer` = statut local `revoked` + événement.
   Effets immédiats : **export, renouvellement, transfert et modification
   refusés** pour cette licence.
2. **Statut signé** (`licenseStatus: revoked|suspended`, ADR-026) : le Manager
   ré-émet une enveloppe signée portant le statut. Au **réimport** du nouveau
   `.vlic`, le POS passe `REVOKED`/`SUSPENDED` (fenêtre d'activation, message
   FR) — effet offline réel, sans serveur. `Suspendre`/`Réactiver` = même
   mécanisme réversible ; `Révoquer` reste définitif côté registre.

Limite assumée : un poste déjà activé hors-ligne qui ne réimporte jamais le
nouveau `.vlic` ne peut pas être désactivé à distance sans canal réseau —
documenté honnêtement (pas de fausse promesse). En pratique : renouvellements
courts (12 mois) + transferts tracés + statuts signés limitent l'exposition.

## Trajectoire online (sans réécrire le protocole)

Le format le permet déjà : ajouter ultérieurement
`revocationListUrl` + `revocationSeq` signés, vérifiés quand un réseau est
disponible (mode dégradé offline = dernière liste connue + horodatage).
`licenseId` stables et `issuedAt` rendent la comparaison sûre. En attendant :
renouvellements courts (12 mois) + transferts tracés limitent l'exposition.
