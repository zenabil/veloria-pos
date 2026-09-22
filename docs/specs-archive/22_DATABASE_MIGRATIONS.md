# 22 — Database Migration Policy

## Naming

```text
0001_initial_schema.sql
0002_catalog_indexes.sql
0003_sales_constraints.sql
0004_inventory_ledger.sql
...
```

## Migration runner

At startup:

```text
open DB
→ read schema version
→ execute pending migrations in order
→ record checksum/version
→ verify schema
→ continue startup
```

## Rules

- A released migration file is immutable.
- Never edit an old migration to fix a production database.
- Add a new migration.
- Large destructive migrations require a pre-migration backup.
- Every migration gets an integration test.

## Compatibility policy

The app must refuse to silently open a database with a schema version newer than the application supports.

User-facing message:

> Cette base de données a été créée avec une version plus récente de Veloria PoS. Veuillez mettre à jour l'application.

## Repair policy

Automatic schema repair must never silently delete data.

If a schema problem is detected:

1. stop writes
2. log details
3. suggest verified backup/restore/recovery
