# SCSG

A pnpm monorepo. `apps/*` holds deployables, `packages/*` holds shared libraries.

## Stack

| Concern | Choice |
| --- | --- |
| App framework | TanStack Start (React 19, TanStack Router, SSR) |
| Build | Vite 8 + Nitro |
| API | oRPC (typed RPC + OpenAPI) |
| Data | Drizzle ORM on Postgres (Neon) |
| Auth | better-auth |
| Styling | Tailwind CSS v4 + shadcn-style components |
| Lint / format | Biome |
| Monitoring | Sentry |

## Requirements

- Node >= 24
- pnpm 12.3.4 (`corepack enable`)

## Getting started

```bash
pnpm install
cp apps/scsg-app/.env.example apps/scsg-app/.env.local   # fill in DATABASE_URL
pnpm dev                                                  # http://localhost:3000
```

`DATABASE_URL` / `DATABASE_URL_POOLER` are provisioned automatically by Neon Launchpad on first `pnpm dev` if left blank.

## Scripts

Run from the repo root; each delegates to the app workspace.

| Command | Does |
| --- | --- |
| `pnpm dev` | Dev server on port 3000 |
| `pnpm build` | Production build |
| `pnpm start` | Run the built server |
| `pnpm preview` | Preview the build |
| `pnpm check` | Biome lint + format check |
| `pnpm lint` / `pnpm format` | Biome individually |
| `pnpm db:generate` | Generate migrations from the Drizzle schema |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:push` / `db:pull` | Sync schema without migrations |
| `pnpm db:studio` | Drizzle Studio |

## Layout

```
apps/scsg-app/       TanStack Start application
  src/routes/        file-based routes (routeTree.gen.ts is generated)
  src/orpc/          RPC router, schemas, client
  src/db/            Drizzle schema and connection
  src/lib/           auth + shared utilities
docs/                architecture and product decisions
```

## Docs

Architecture and product decisions live in [`docs/`](./docs/README.md).
