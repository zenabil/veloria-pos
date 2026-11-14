# BACKUP CONTRACT — ce que contient (et ne contient pas) une sauvegarde Veloria

**Statut :** contrat opposable. Toute évolution du périmètre de sauvegarde doit
modifier CE document **et** son test (`tests/unit/backup-contract.test.ts`) dans
le même changement.

**Source :** audit forensique `2026-11-11-full-forensic-audit`, finding BACK-04
(« le contrat d'inclusion/exclusion de la sauvegarde n'est pas documenté »),
corrigé dans la vague 5 du plan de remédiation.

**Autorité :** `AGENTS.md` règles 1 (la base SQLite est l'unique source de
vérité), 4 (montants atomiques) et 12 (migrations immuables) ; compétence
`veloria-backup`.

---

## 1. Ce qu'est une sauvegarde Veloria

Une sauvegarde est un ** cliché cohérent et vérifié de la base SQLite
locale**, produit par le mécanisme `VACUUM INTO` (cohérent en mode WAL,
WAL-safe, jamais une copie brute du fichier vivant).

Chaque sauvegarde est un **couple de fichiers** :

| Fichier                                                | Contenu                                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `veloria-<horodatage>-<suffixe>-<manuel\|auto>.vposdb` | l'image de la base                                                                                            |
| `veloria-…vposdb.json`                                 | le manifeste : `createdAt`, `appVersion`, `schemaVersion`, `sizeBytes`, `sha256`, `logicalName`, `sourcePath` |

Le cycle de production est **écrire → vérifier → promouvoir** : l'image est
écrite dans un fichier temporaire `.pending-…`, vérifiée (ouverture SQLite
read-only + `integrity_check` + `foreign_key_check` + version de schéma), puis
promue au nom final par renommage atomique. Une image tronquée ne peut donc
pas occuper une place de rétention.

## 2. Ce que la sauvegarde CONTIENT

La sauvegarde est une copie **complète** de la base : elle contient tout ce que
la base contient.

| Catégorie       | Contenu                                                                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Données métier  | produits, catégories, conditionnements, ventes, lignes de vente, paiements, retours, réceptions, mouvements de stock, couches FIFO, dépenses, dettes, clôtures journalières, sessions de caisse |
| Données clients | fiches clients, soldes, échéances, accès APK (condensats de téléphone/PIN — **jamais** le PIN en clair)                                                                                         |
| Réglages        | `app_settings` (paramètres magasin, configuration de synchronisation, trustee d'impression, templates d'impression)                                                                             |
| Journal         | `audit_log` (traçabilité des opérations et de leurs auteurs)                                                                                                                                    |
| Compteurs       | `schema_migrations` (version de schéma — pilote les migrations au restauration)                                                                                                                 |

Une sauvegarde est donc **une donnée personnelle** : elle contient les nom,
téléphone, adresse et historique d'achat des clients. Elle doit être traitée
comme telle (support chiffré, pas d'envoi par messagerie non chiffrée).

## 3. Ce que la sauvegarde EXCLUT

| Élément                               | Emplacement réel                                                                       | Statut                                                                                           |
| ------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Journal de bord applicatif (`*.log`)  | `<userData>/logs`                                                                      | **exclu** (pas dans la base)                                                                     |
| Logo de l'entreprise                  | `<userData>/logos` (fichier)                                                           | **exclu** — la base n'en garde que le CHEMIN ; après restauration, le logo est à re-sélectionner |
| Justificatifs de dépense              | chemin libre dans `expenses.receipt_path`                                              | **exclu** — même raison                                                                          |
| Fichier de licence importé (`.vlic`)  | fichier choisi par le gérant                                                           | **exclu** — la licence est attachée à CE poste (empreinte matérielle)                            |
| Clé privée de signature               | jamais sur le poste (`resources/license/keys.json` ne contient que la partie publique) | **exclu** par construction                                                                       |
| Matériel de chiffrement DPAPI         | compte Windows de l'utilisateur                                                        | **exclu** — voir §4                                                                              |
| Fichiers WAL / SHM de la base vivante | à côté de la base                                                                      | **exclu** — l'image `VACUUM INTO` est déjà consolidée                                            |

> **Conséquence à connaître du gérant :** une restauration restitue les
> DONNÉES, pas les FICHIERS annexes. Le logo de l'entreprise et les
> justificatifs de dépenses doivent être réinstallés séparément après
> restauration sur un poste neuf.

## 4. La propriété de sécurité centrale

> **Une sauvegarde Veloria ne contient aucun credential en clair.**

Elle ne contient pas non plus de material cryptographique permettant d'en
extraire un :

- le secret de service de la synchronisation est **chiffré au repos** par le
  système (`safeStorage` / DPAPI sous Windows) : la valeur persistée porte le
  préfixe `dpapi1:` et n'est pas lisible ;
- DPAPI est lié au **compte Windows** : une image copiée sur un autre
  ordinateur, ou sur un autre compte, ne permet **pas** de déchiffrer ce blob.
  Le secret devient illisible, et l'application le refuse en mode fermé
  (« Secret de synchronisation illisible ») plutôt que de le rendre en clair ;
- une installation antérieure au chiffrement peut porter un secret **legacy en
  clair** dans `app_settings` : au **démarrage**, l'application le ré-encode
  sous forme chiffrée (`electron/sync/secret-hygiene.ts`) **avant** toute
  sauvegarde automatique. Sans ce passage, une sauvegarde — copie complète de
  la base — embarquerait le secret en clair.

Le test `tests/unit/backup-contract.test.ts` prouvent ces deux moitiés :

1. le passage d'hygiène ré-encode un secret legacy en clair et ne touche
   jamais une valeur déjà chiffrée (idempotence) ni une row illisible ;
2. une sauvegarde produite par le mécanisme réel (`VACUUM INTO`) contient les
   données métier et **aucun** octet du secret en clair ;
3. le test Inverse prouve la **nécessité** du passage : sans lui, `VACUUM
INTO` recopierait bien le secret en clair.

## 5. Restauration : ce qui est vérifié avant l'échange

1. la somme de contrôle (`sha256`) du fichier correspond à son manifeste ;
2. le fichier s'ouvre en SQLite read-only, `integrity_check` = `ok`,
   `foreign_key_check` sans violation ;
3. la version de schéma est connue de l'application ;
4. une image modifiée depuis son écriture est **refusée** avant tout échange
   (« l'image a changé depuis son écriture »).

## 6. Évolution du contrat

Toute modification du périmètre (ajout d'une table, ajout d'un fichier
annexe, changement du mécanisme de sauvegarde) doit :

1. mettre à jour ce document ;
2. mettre à jour `tests/unit/backup-contract.test.ts` (une preuve qui n'est pas
   mise à jour avec le contrat n'est plus une preuve) ;
3. être mentionnée dans le rapport de la vague de remédiation concernée.
