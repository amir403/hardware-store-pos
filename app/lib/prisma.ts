import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = new pg.Pool({
    connectionString,
    // Reclaim idle clients before the server (or a transaction pooler such as
    // Supabase/Neon) drops them, which is what triggers
    // "Server has closed the connection".
    max: 10,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: false,
    // `prisma dev` sits behind a proxy that severs sockets it deems idle.
    // Probing keeps them alive; it does not fully prevent the drop, which is
    // why the query-level retry below is what actually protects the page.
    keepAlive: true,
    keepAliveInitialDelayMillis: 1_000,
  });

  // A pooled client can error while idle (e.g. the server closed it). Without a
  // listener this throws an unhandled 'error' and crashes the process; with one,
  // pg simply discards the dead client and opens a fresh one on next checkout.
  pool.on("error", (err) => {
    console.error("Unexpected error on idle Postgres client:", err.message);
  });

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Attaches dropped-connection retries to an in-flight Prisma operation.
 * The pool discards the client that just failed, so the next checkout is a
 * fresh connection. One retry is not enough: a dashboard page fires several
 * queries at once and each may independently land on another dead client, so
 * back off and try a few times before surfacing the error. `invoke` is called
 * again ONLY on failure.
 */
// Up to ~2.3 s of back-off: enough for every dead pooled socket to be replaced.
const CONNECTION_ATTEMPTS = 5;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("Server has closed the connection") ||
    message.includes("Connection terminated") ||
    message.includes("ECONNRESET") ||
    message.includes("connection closed")
  );
}

async function withConnectionRetry<R>(
  invoke: () => Promise<R>,
  first: Promise<R>,
): Promise<R> {
  let lastError: unknown;
  try {
    return await first;
  } catch (error) {
    if (!isConnectionError(error)) throw error;
    lastError = error;
    for (let attempt = 1; attempt < CONNECTION_ATTEMPTS; attempt++) {
      // `prisma dev` can take a few hundred milliseconds to accept again.
      await delay(150 * 2 ** (attempt - 1));
      console.warn(
        `Prisma connection was lost, retrying (attempt ${attempt + 1} of ${CONNECTION_ATTEMPTS}).`,
      );
      try {
        return await invoke();
      } catch (retryError) {
        if (!isConnectionError(retryError)) throw retryError;
        lastError = retryError;
      }
    }
    throw lastError;
  }
}

/**
 * Prisma returns a lazy `PrismaPromise` (a thenable that is NOT a native
 * Promise instance), so detect awaitables structurally rather than via
 * `instanceof Promise`.
 */
function isThenable(value: unknown): value is Promise<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * Wraps a model delegate (e.g. `prisma.product`) so each query gets the
 * dropped-connection retry.
 */
function wrapDelegate<T extends object>(target: T): T {
  return new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop);
      if (typeof value !== "function") {
        return value;
      }
      const fn = value as (...args: unknown[]) => unknown;
      return (...args: unknown[]) => {
        const invoke = () => fn.apply(obj, args) as Promise<unknown>;
        const result = invoke();
        return isThenable(result) ? withConnectionRetry(invoke, result) : result;
      };
    },
  });
}

/**
 * Proxy around the lazily created client. Model accessors (`prisma.product`,
 * `prisma.sale`, ...) return a retry-wrapped delegate; everything else
 * (`$transaction`, `$queryRaw`, ...) is bound to the current client.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient() as unknown as Record<
      string | symbol,
      unknown
    >;
    const value = client[prop];
    if (value !== null && typeof value === "object") {
      return wrapDelegate(value as object);
    }
    if (typeof value === "function") {
      const fn = value as (...args: unknown[]) => unknown;
      return (...args: unknown[]) => fn.apply(getPrismaClient(), args);
    }
    return value;
  },
});
