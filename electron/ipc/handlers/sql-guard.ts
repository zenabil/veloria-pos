// Veloria PoS — Main : garde structurelle SQL (défense en profondeur).
// Les VALEURS passent toujours par des `?` liés ; les fragments de STRUCTURE
// (clauses ORDER BY) ne peuvent pas être bindés dans SQLite. Cette garde
// fail-closed n'accepte qu'une clause de tri en identifiants simples —
// `col ASC|DESC`, `col COLLATE NOCASE ASC|DESC`, `col IS [NOT] NULL` — et
// rejette tout le reste (;, --, commentaires, fonctions, sous-requêtes)
// avec un message FR. Les 8 requêtes listées construisent déjà `order` depuis
// des ternaires figées (sort enum → littéraux) ; la garde prouve l'invariant
// au lieu de le supposer, et verrouille tout futur passage de tri.
const ORDER_SEGMENT =
  "[A-Za-z_][A-Za-z0-9_.]* (COLLATE NOCASE (ASC|DESC)|(ASC|DESC)|IS (NOT )?NULL)";
const ORDER_CLAUSE_RE = new RegExp(`^${ORDER_SEGMENT}(, ${ORDER_SEGMENT})*$`);

/** Valide une clause ORDER BY assemblée ; retourne la clause ou lève (FR). */
export function assertOrderClause(order: string): string {
  if (typeof order !== "string" || !ORDER_CLAUSE_RE.test(order)) {
    throw new Error("Tri invalide.");
  }
  return order;
}
