import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: ['.env.local', '.env'] })

const url = process.env.DATABASE_URL

// drizzle-kit needs a definite connection string, and every command it runs
// (generate, migrate, push, studio) is destructive or schema-changing. Failing
// here with a clear message beats connecting to the wrong database, or the
// confusing error Postgres gives for an undefined URL.
if (!url) {
	throw new Error(
		'DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.',
	)
}

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url,
  },
})
