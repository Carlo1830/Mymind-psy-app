import type { Pool, PoolClient, QueryResult } from 'pg';
export type Row = Record<string, string | number | null>;
type Value = string | number | boolean | null | undefined;
export function connectionOptions(connectionString?: string): import('pg').PoolConfig;
export function getPool(): Pool;
export function closePool(): Promise<void>;
export function compileQuery(sql: string): string;
export class Database {
  constructor(executor?: Pick<PoolClient, 'query'>);
  query(sql: string, values?: Value[]): Promise<QueryResult>;
  prepare(sql: string): { get(...values: Value[]): Promise<Row | undefined>; all(...values: Value[]): Promise<Row[]>; run(...values: Value[]): Promise<{changes: number}> };
  begin(owner: string): Promise<void>;
  exec(command: 'COMMIT' | 'ROLLBACK'): Promise<void>;
}
