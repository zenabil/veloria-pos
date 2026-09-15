// Veloria PoS — Type shim: better-sqlite3 ships without consumable TS declarations
// in this toolchain, so tests/main-process code use this minimal typed surface.
declare module "better-sqlite3" {
  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }
  interface Statement {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }
  interface Database {
    pragma(stmt: string, opts?: { simple?: boolean }): unknown;
    exec(sql: string): void;
    prepare(sql: string): Statement;
    transaction<T extends (...args: never[]) => unknown>(fn: T): T;
    close(): void;
  }
  const DatabaseConstructor: new (filename: string, opts?: Record<string, unknown>) => Database;
  export default DatabaseConstructor;
}
