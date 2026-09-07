/**
 * The database connection.
 *
 * Uses Neon's WebSocket driver rather than `node-postgres`, for two reasons:
 *
 * 1. **Cloudflare Workers has no TCP sockets.** `pg` is built on `net.Socket`,
 *    which `nodejs_compat` does not provide — so it fails outright on Workers,
 *    not merely slowly. The PRD anticipated this as the cost of choosing
 *    Workers; this is that cost arriving.
 *
 * 2. **We need interactive transactions.** Neon's HTTP driver is the simpler
 *    option, but each query is a separate request, so there is no session and
 *    therefore no `db.transaction()` with reads inside it. Crossover — close a
 *    membership, open its replacement, link them — is exactly that shape, and
 *    it is the core operation of this domain rather than an edge case. The
 *    WebSocket driver keeps a session open and supports it.
 *
 * No `neonConfig.webSocketConstructor` is set. Neon's docs require that only
 * "if no global `WebSocket` object is available, such as in older versions of
 * Node" — their example is annotated "only do this in Node v21 and below".
 * This project requires Node >= 24, which has a global `WebSocket`, and Workers
 * provides one natively. So the `ws` package is not a dependency here.
 *
 * If this ever has to run on an older Node, that is when `ws` gets added back.
 */

import { drizzle } from "drizzle-orm/neon-serverless";

import * as schema from "./schema/index.ts";

/**
 * The application uses the **pooled** connection string.
 *
 * Workers spin up many concurrent isolates at the edge, and each one opening
 * its own Postgres connection would exhaust Neon's connection limit quickly.
 * The pooler (PgBouncer) multiplexes them onto far fewer real connections.
 *
 * Migrations use the direct URL instead — see `drizzle.config.ts`. PgBouncer in
 * transaction mode does not support the session-level advisory locks migration
 * tooling relies on to stop two deploys applying the same migration at once.
 *
 * The `!` non-null assertion the template used here
 * (`process.env.DATABASE_URL!`) does not check anything. It tells TypeScript
 * "trust me, this is not undefined" and silences the error — so if the variable
 * is missing, the failure surfaces later as an unreadable driver error instead
 * of here.
 *
 * Checking costs one line and fails where the problem actually is. Reach for
 * `!` almost never; when you find yourself wanting it, an `if` is usually the
 * honest version.
 */
const connectionString = process.env.DATABASE_URL_POOLER;

if (!connectionString) {
	throw new Error(
		"DATABASE_URL_POOLER is not set. Copy .env.example to .env.local and fill it in with Neon's pooled connection string (the host contains '-pooler').",
	);
}

export const db = drizzle({ connection: connectionString, schema });
