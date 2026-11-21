import "dotenv/config";
import { execFileSync } from "node:child_process";
import pg from "pg";

/**
 * One-time move from the `prisma dev` database (DATABASE_URL) to a real
 * PostgreSQL (NEW_DATABASE_URL): creates the database if needed, applies the
 * migrations, copies every table, then checks the row counts match.
 * The source is only read. Run: npx tsx scripts/copy-db.ts
 */
const from = process.env.DATABASE_URL;
const to = process.env.NEW_DATABASE_URL;
if (!from || !to) throw new Error("Set DATABASE_URL (old) and NEW_DATABASE_URL (new) in .env");
if (from === to) throw new Error("DATABASE_URL and NEW_DATABASE_URL are the same database");

async function ensureDatabase(url: string) {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Unexpected database name "${name}"`);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE "${name}"`);
    console.log(`created database ${name}`);
  }
  await client.end();
}

async function main() {
  await ensureDatabase(to!);

  // Same migrations as development, applied to the new database.
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DATABASE_URL: to },
  });

  const source = new pg.Client({ connectionString: from });
  const target = new pg.Client({ connectionString: to });
  await source.connect();
  await target.connect();

  const { rows: tables } = await target.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'
     ORDER BY table_name`
  );

  await target.query("BEGIN");
  // Foreign keys are checked per row by triggers; switch them off while the
  // tables are filled in an arbitrary order. Needs a superuser (postgres).
  await target.query("SET LOCAL session_replication_role = replica");
  await target.query(`TRUNCATE ${tables.map((t) => `"${t.table_name}"`).join(", ")}`);

  const counts: Record<string, number> = {};
  for (const { table_name: table } of tables) {
    const { rows: columns } = await target.query<{ column_name: string; data_type: string }>(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
      [table]
    );
    const { rows } = await source.query(`SELECT * FROM "${table}"`);
    const names = columns.map((c) => c.column_name);
    for (const row of rows) {
      const values = columns.map((c) =>
        // pg would turn a JSON array into a Postgres array; send JSON as text.
        (c.data_type === "json" || c.data_type === "jsonb") && row[c.column_name] !== null
          ? JSON.stringify(row[c.column_name])
          : row[c.column_name]
      );
      await target.query(
        `INSERT INTO "${table}" (${names.map((n) => `"${n}"`).join(", ")})
         VALUES (${names.map((_, i) => `$${i + 1}`).join(", ")})`,
        values
      );
    }
    counts[table] = rows.length;
  }
  await target.query("COMMIT");

  // Every table must hold exactly what the old one had.
  let ok = true;
  for (const [table, expected] of Object.entries(counts)) {
    const { rows } = await target.query(`SELECT count(*)::int AS n FROM "${table}"`);
    const match = rows[0].n === expected;
    ok &&= match;
    console.log(`${match ? "ok " : "BAD"} ${table}: ${rows[0].n}/${expected}`);
  }
  await source.end();
  await target.end();
  if (!ok) throw new Error("Row counts differ; the new database is not ready.");
  console.log("Copy complete.");
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
);
