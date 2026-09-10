import type { GimbalConfig } from "@gimbal/shared";
import pg from "pg";

export interface DbSession {
  query(query: string): Promise<unknown>;
  // Opens the fixture transaction — call once before the run starts.
  beginFixture(): Promise<void>;
  // Rolls back everything the run did through `query` — call in the run's finally, pass or fail,
  // so no run leaves residue for the next one. Only undoes writes made through THIS connection;
  // it can't roll back the application-under-test's own writes on its own separate connection(s) —
  // see AGENTS.md Phase 3 note.
  rollback(): Promise<void>;
  close(): Promise<void>;
}

// Scoped to a single driver (Postgres) — there's no second driver to justify an abstraction yet.
// Returns null when config.db.url is unset, preserving today's NO_DB_CONFIGURED behavior
// (execution/adapters/db.ts's ctx.dbQuery stays undefined in that case).
export function openDbSession(config: GimbalConfig): DbSession | null {
  if (!config.db.url) return null;

  const pool = new pg.Pool({ connectionString: config.db.url });
  let client: pg.PoolClient | null = null;

  return {
    async beginFixture() {
      client = await pool.connect();
      await client.query("BEGIN");
    },
    async query(query: string) {
      if (!client) throw new Error("db fixture transaction not started");
      const result = await client.query(query);
      return result.rows[0];
    },
    async rollback() {
      if (client) {
        await client.query("ROLLBACK").catch(() => {});
        client.release();
        client = null;
      }
    },
    async close() {
      await pool.end();
    },
  };
}
