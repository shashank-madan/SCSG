import { drizzle } from "drizzle-orm/node-postgres";

import * as schema from "./schema/index.ts";

/**
 * The `!` non-null assertion the template used here (`process.env.DATABASE_URL!`)
 * does not check anything. It tells TypeScript "trust me, this is not
 * undefined" and silences the error — so if the variable is missing, the
 * failure surfaces later as an unreadable driver error instead of here.
 *
 * Checking costs one line and fails where the problem actually is. Reach for
 * `!` almost never; when you find yourself wanting it, an `if` is usually the
 * honest version.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
	throw new Error(
		"DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
	);
}

export const db = drizzle(connectionString, { schema });
