# GLOSSARY — Dictionnaire FR opposable (AGENTS.md #6)

> Statut : normatif pour tout texte VISIBLE par l utilisateur du POS.
> Le code (identifiants, chemins, canaux IPC, colonnes DB) reste EN :
> convention unique, voir ADR-101/102/103 (ex-ADR-NEW) ci-dessous. Seul `mobile/` est bilingue
> (exception ADR-051, isolee).

## Termes UI (FR uniquement)

| Concept      | Terme UI FR                       | Chemin code EN (ne pas renommer)           |
| ------------ | --------------------------------- | ------------------------------------------ |
| clients      | Clients                           | `features/customers/`, `domain/customer/`  |
| dettes       | Dettes / Créances / Encaissements | `features/debts/`                          |
| fournisseurs | Fournisseurs                      | `features/suppliers/`, `domain/suppliers/` |
| produits     | Produits                          | `features/products/`, `domain/product/`    |
| stock        | Stock                             | `features/stock/`, `domain/inventory/`     |
| ventes       | Ventes / Caisse                   | `features/sales/`, `domain/sales/`         |
| retours      | Retours                           | `features/returns/`, `domain/returns/`     |
| dépenses     | Dépenses                          | `features/expenses/`, `domain/expenses/`   |
| paramètres   | Paramètres                        | `features/settings/`                       |

## Conventions de nommage (code, EN)

- Ecrans : `PascalCase*Screen.tsx` (`SellScreen`, `ClientsScreen`).
- Domaine : `kebab-case*-rules.ts`.
- Utils : `camelCase.ts`.
- Domaine : noms existants conserves (renommage FR refuse : diacritiques
  illegaux en chemins + DB/IPC/tests/docs tous EN — un renommage creerait
  une 3e variante, pire que le statu quo).

## Gardes

- ESLint (`eslint.config.mjs`, bloc `src/**`) : `no-restricted-syntax`
  interdit les littéraux €/arabes (string + gabarit). Vert vérifié.
- Erreurs utilisateur : `frError()` + message FR, technique en `log` seul.
- Monnaie affichee : `formatDzd` (`1 250,00 DZD`), jamais €/$/دج.
