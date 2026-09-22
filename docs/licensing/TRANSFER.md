# Licensing — TRANSFER

Réservé au vendor (le client ne peut pas se transférer lui-même) :

1. Manager : fiche licence ⇒ **Transférer** ⇒ saisir la nouvelle empreinte
   (lue sur le nouveau poste) + motif.
2. Le Manager ré-émet le **même `licenseId`** pour la nouvelle empreinte
   (nouvelle signature, nouvel `issuedAt`).
3. Effet : l'ancien poste passe `INVALID_HARDWARE` (transfert effectif sans
   action distante) ; le nouveau s'active par import.
4. Traçé : événement `transferred` (ancienne empreinte tronquée + motif).

Garde-fou : transfert d'une licence révoquée refusé. Transferts répétés
anormaux = signal commercial (abus de licence), visible dans l'historique.
