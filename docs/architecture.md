# Backend Architecture — Persistence Layer

The actions-server uses Prisma ORM as the persistence layer for PostgreSQL.
The database stores off-chain artifacts (users, deals, evidence, reputation).
Each write operation is validated using Zod schemas defined in `src/types/actions.ts`.

- ORM: Prisma (`@prisma/client`)
- DB: Supabase (managed PostgreSQL)
- Schema location: `prisma/schema.prisma`
- Validation: Zod schemas in `src/types/actions.ts`

Workflow:
1. Incoming HTTP request (Express)
2. Validate DTO with Zod schemas
3. Execute DB operation via Prisma
4. Return JSON response

## Database Layer — Supabase Integration

The Artha Network uses Supabase (managed PostgreSQL) as the persistence layer.

- Backend (actions-server): Uses service_role key for privileged operations.
- Frontend (web-app): Uses anon key for safe inserts/reads.
- Migrations: Managed via `prisma db push` against Supabase.
