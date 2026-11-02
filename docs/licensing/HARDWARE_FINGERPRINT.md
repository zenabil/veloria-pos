# Licensing — HARDWARE_FINGERPRINT

## Sources Windows (normalisées MAJ, jointes triées, SHA-256)

1. `MachineGuid` (`HKLM\SOFTWARE\Microsoft\Cryptography`) — stable, survit
   aux changements de disque.
2. `SystemUUID` SMBIOS (`wmic csproduct` / `Get-CimInstance`) — ignore si
   nul (`00…00`, VMs mal configurées).
3. `ProcessorId` CPU.
4. N° série disque système.

Minimum **2 sources**, sinon erreur FR (pas de licence dégradée).
Données brutes jamais stockées dans le .vlic (seule l'empreinte SHA-256) ;
affichage = 16 premiers car. groupés (`XXXX-XXXX-XXXX-XXXX`).

## Changements matériels légitimes

Disque remplacé seul : MachineGuid + CPU + UUID restent ⇒ empreinte
inchangée (tolérant). Carte mère changée : empreinte différente ⇒
`INVALID_HARDWARE` ⇒ procédure TRANSFER (nouveau .vlic, ancien poste
invalidé automatiquement). Voir TRANSFER.md.

## Licence flottante (`deviceBinding: false`)

Le vendor peut émettre une licence **non liée** (case décochée dans le
Manager) : le contrôle matériel est sauté à la vérification (même chaîne,
même signature). Réservé aux parcs suivis contractuellement (`maxDevices`
informatif et **non appliqué** — ADR-172) — le défaut reste la liaison stricte.

## Limites

VMs clonées (même UUID + GUID dupliqué) : risque résiduel accepté
(marché cible = postes physiques). Pas de MAC (instable : VPN/dongles).
