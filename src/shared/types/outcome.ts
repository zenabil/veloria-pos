// Veloria PoS — Shared types.

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Result<T> {
  ok: true;
  data: T;
}

export interface Failure {
  ok: false;
  code: string;
  message: string;
}

export type Outcome<T> = Result<T> | Failure;

export function ok<T>(data: T): Outcome<T> {
  return { ok: true, data };
}

export function fail(code: string, message: string): Outcome<never> {
  return { ok: false, code, message };
}
