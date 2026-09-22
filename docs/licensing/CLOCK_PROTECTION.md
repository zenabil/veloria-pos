# Licensing — CLOCK_PROTECTION

## Principe honnête (§22 spec)

Sans source de temps externe, on ne connaît pas « l'heure vraie » : on
détecte les **incohérences** (rollback, état manipulé), sans les confondre
avec une preuve.

## Mécanisme

État chiffré : `lastSeenUtc` (dernière vérification réussie / mutation
gardée). Règle : `now < lastSeen - 5 min` ⇒ `CLOCK_ROLLBACK` ⇒ réactivation
requise, **données préservées**, shell bloqué (fenêtre d'activation).
Vérifiée **avant** les dates (une horloge reculée invaliderait tout contrôle
d'expiration). Tolérance 5 min (NTP/hibernation).

## Non-objectifs

- Avance d'horloge (paraît « valide ») : non détectable offline — l'expiration
  reste opposable dès retour à l'heure normale (le `lastSeen` a avancé).
- Premier lancement sans état : aucune baseline ⇒ activation normale.
