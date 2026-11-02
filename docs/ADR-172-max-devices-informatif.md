# ADR-172 — `maxDevices` : mention contractuelle, aucune application technique (ferme G-17 / décision Q15)

## Contexte

La liste des constats « niveau zéro » soumise le 2026-11-02 qualifiait
`maxDevices` de **théorie de revenus directe** : la valeur est vérifiée
(`electron/licensing/protocol.ts:205-210` contrôle un entier 1-99) mais
**jamais appliquée** — aucun registre d'appareils, aucun comptage, donc « une
licence peut tourner sur un nombre illimité de machines ».

Constats mesurés, dans l'ordre de la chaîne :

- `verifyLicenseChain()` (`electron/licensing/protocol.ts:291-327`) ordonne
  forme → signature → statut → produit → **empreinte matérielle** → dates. Il ne
  lit **jamais** `maxDevices`.
- `electron/licensing/license-service.ts:291` recopie `maxDevices` dans
  `LicenseStatus`, renvoyé par quatre canaux `license.*`, typé côté renderer
  (`src/features/license/use-license.ts:23,89,98,112`) — **et rien ne l'affiche
  ni ne le compare** : `LicenseScreen.tsx:126-149` construit ses lignes
  `licenseId / clientName / storeName / type / expiresAt / daysLeft / modules /
features`, `LicenseBadge.tsx` ne le mentionne pas.
- Côté vendor : la table `licenses`
  (`license-manager/db/manager-db.ts:21-46`) porte **une seule** colonne
  `hardware_fingerprint` (+ `max_devices INTEGER`). `rebindFingerprint()`
  (`license-manager/ipc/licenses.ts:159-164`) fait un
  `UPDATE … SET hardware_fingerprint = ?` : réémettre pour une nouvelle machine
  **écrase** l'empreinte, cela ne compte rien. Aucun chemin du Manager ne compare
  un nombre d'empreintes à `max_devices` ; `signing.ts:199-232` omet même le
  champ s'il n'est pas un nombre (une licence émise sans saisie n'a donc **aucune**
  revendication `maxDevices`).
- Le format `.vlic` lui-même ne peut pas porter un parc : une seule
  `hardwareFingerprint` signée par fichier (`protocol.ts:30`), pas de liste.
- `grep device` dans `cloud/supabase/` et dans les deux APK : **zéro**. Aucun
  concept d'appareil hors du POS.

L'audit du 2026-10-19 avait déjà vu juste : finding **G-17**
(`docs/reports/FULL_AUDIT_2026-10-19.md:1187` — « `maxDevices` signée mais non
appliquée », Medium, PROUVÉ, P2/décision) et décision **Q15**
(`docs/reports/FULL_AUDIT_2026-10-19_PLAN.md:529` : « تطبيقه أم توثيقه؟ » →
**(ب) توثيق — ADR**). **L'ADR demandé n'avait jamais été écrit.** Cet ADR l'écrit.

Interrogation explicite de cette session : modèle d'application à retenir
(registre d'activation au moment de l'émission / contrôle assisté par le cloud /
documenter seulement). Réponse opérateur : **« توثيق فقط »** — documenter, ne pas
construire de registre.

## Décision

1. **`maxDevices` est une mention contractuelle, pas une garde technique.** Elle
   documente le parc pour lequel une licence a été consentie ; elle n'est
   vérifiée ni à l'émission, ni à l'activation, ni à l'usage, dans le POS comme
   dans le Manager. Toute formulation qui laisserait croire à une application
   (« appliqué à l'émission ») est retirée de la documentation
   (`docs/licensing/CAPABILITIES.md`, `LICENSE_FORMAT.md`,
   `HARDWARE_FINGERPRINT.md`) et du formulaire du Manager.
2. **Ce qui protège réellement reste la liaison matérielle.** Avec
   `deviceBinding` à `true` (défaut), une licence importée sur une autre machine
   échoue en `INVALID_HARDWARE` : le poste est lié à l'empreinte signée
   (MachineGuid + SystemUUID + CPU + disque, ≥ 2 sources,
   `electron/licensing/fingerprint.ts`). Le changement de machine passe par une
   **réémission explicite** du vendor (`transfer`,
   `license-manager/ipc/registry.ts:292-346`), qui invalide l'ancienne. La
   protection est donc **par poste**, exactement le grain vendu en général.
3. **Un client multi-postes doit recevoir une licence par poste**, toutes liées à
   leur propre empreinte (N fichiers `.vlic`, N empreintes, même `clientId`), et
   non une licence flottante à `maxDevices = N`. C'est la règle d'émission à
   suivre ; `maxDevices` n'est alors qu'un rappel du nombre convenu.
4. **`deviceBinding = false` est une exception à surveiller, pas une norme.**
   Une licence flottante peut s'installer sur un nombre illimité de machines :
   c'est le résidu **accepté et documenté**
   (`docs/reports/FINAL_REPAIR_REPORT.md:320-322`, `PHASE_8_REPORT.md:55`).
   Réserver aux parcs sous suivi
   contractuel ; sinon garder la liaison stricte.
5. **Aucun registre d'appareils, aucune table, aucun canal.** Pas de
   `license_devices`, pas de compteur d'activations, pas de rapport d'activation
   remonté au vendor. Raisons, dans l'ordre :
   - un POS **hors ligne** ne peut pas voir les autres postes : toute assertion
     « ce poste est le kᵉ du parc » exige un tiers de confiance en ligne, ce qui
     frontal ADR-025 (« 100 % offline », `docs/licensing/CAPABILITIES.md:102-106`) ;
   - la valeur signée étant unique par machine, un parc exigerait N fichiers,
     donc une redéfinition complète du format `.vlic` (rotation de clé,
     compatibilité des licences déjà émises, `schemaVersion` 1 → 2) ;
   - une application « locale seulement » serait contournable (réinstallation,
     image disque) tout en cassant les clients légitimes (poste remplacé,
     Windows réinstallé) : du risque en plus, de la protection en moins.
6. **La question relève du contrat commercial, pas du code.** Le suivi d'un parc
   se fait par la fiche client (`clientId`/`clientName`/`storeName`), la date
   d'émission et les événements du registre (`license_events`,
   `manager-db.ts:47-53`) ; si un dépassement est constaté, la réponse est une
   régularisation commerciale (réémission, facture), pas un verrou technique.

## Alternatives rejetées

- **Registre d'activation dans le Manager + comptage à l'émission** (refuser
  d'émettre plus de N empreintes pour un même `licenseId`) : séduisant sur le
  papier, mais il ne protège rien hors ligne — le POS importe un `.vlic` valides
  sans jamais demander au Manager s'il reste une place ; le compteur serait donc
  une promesse décorative, sauf à ajouter un appel réseau (voir 5).
- **Contrôle assisté par le cloud** via le miroir Supabase existant :
  précisément le pipeline qui doit être construit par ailleurs ; l'utiliser pour
  la licence introduirait une dépendance en ligne dans la chaîne d'activation et
  rendrait le POS inutilisable sans réseau (contraire d'ADR-023/025).
- **Appliquer `maxDevices = 1` comme verrou local** (refuser si l'empreinte
  change) : c'est **déjà** le comportement de `deviceBinding` ; l'écrire une
  seconde fois créerait deux règles divergentes selon les champs.
- **Retirer le champ du payload** : invaliderait toutes les licences signées
  (`canonicalJson` → `INVALID_SIGNATURE`, `protocol.ts:76-88`) ; et le champ
  garde une valeur d'affichage pour le vendor.

## Fichiers

- Documentation : ce fichier ; `docs/licensing/CAPABILITIES.md` (section
  « Device binding » + tableau des champs), `docs/licensing/LICENSE_FORMAT.md`,
  `docs/licensing/HARDWARE_FINGERPRINT.md` ; mention dans `docs/INDEX.md`.
- Formulaires/affichages du Manager (textes seulement, aucune logique) :
  `license-manager/renderer/App.tsx` — étiquette « Appareils max », placeholder
  et ligne de détail « Appareils : … » reformulés pour dire explicitement que le
  champ n'est pas appliqué.
- **Aucun** fichier de `electron/licensing/`, `src/features/license/`,
  `database/migrations/` n'est modifié : le comportement du POS reste exactement
  ce que la chaîne de vérification fait aujourd'hui.

## Conséquences

- Le risque résiduel est **assumé et écrit** : une licence flottante
  (`deviceBinding = false`) ou un `.vlic` partagé entre machines du même client
  ne sera pas bloqué par le logiciel. La mitigation est procédurale : émettre des
  licences liées, une par poste.
- La documentation ne peut plus être lue comme une promesse de contrôle : les
  termes « appliqué à l'émission » disparaissent, remplacés par « non appliqué —
  mention contractuelle ».
- G-17/Q15 sont clos **sur le plan documentaire** ; le constat technique reste
  vrai mais n'est plus une surprise : c'est un choix de produit motivé
  (offline-first), pas une omission.
- Si l'option « registre d'activation » devait un jour être reprise, elle
  supposerait un canal d'activation en ligne et une refonte du format signée
  (`schemaVersion` 2) — donc un ADR qui **abroge** celui-ci.

## Validation

Aucun code exécuté n'est modifié hors **textes** du Manager ⇒ la chaîne de
licence elle-même est intacte, et les portes l'ont vérifié sur ce poste :

- `npx tsc -p tsconfig.manager.json --noEmit` : **0** · `eslint license-manager
--max-warnings 0` : **0** · `prettier --check` sur les 4 documents touchés :
  **vert**.
- `npx vitest run tests/unit/license-manager.test.ts` : **12/12**.
- `npm run build:manager` : **vert** (empreintes `dist-electron` /
  `dist-license-manager` recalées `{type: commonjs}`).
- `env -u ELECTRON_RUN_AS_NODE npx electron ./scripts/licensing/verify-licensing.cjs`
  : **VÉRIFICATION LICENSING OK** (2 avertissements attendus : aucune clé privée
  stockée par le Manager sur ce poste, licence locale liée à un autre matériel ⇒
  `INVALID_HARDWARE` — précisément la protection décrite au §2).
- Relecture croisée des quatre textes (ADR, `CAPABILITIES.md`, `LICENSE_FORMAT.md`,
  `HARDWARE_FINGERPRINT.md`) : partout `maxDevices` est dite **non appliquée**.

## Statut

Accepté — 2026-11-02 (décision opérateur « توثيق فقط »). Exécute la décision
**Q15 (ب)** de l'audit 2026-10-19 et clot le finding **G-17** côté documentation.
