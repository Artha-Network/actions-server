# Backend Architecture — Persistence Layer

The actions-server uses Prisma ORM as the persistence layer for PostgreSQL.
The database stores off-chain artifacts (users, deals, evidence, reputation).
Each write operation is validated using schemas defined in core-domain.

- ORM: Prisma (`@prisma/client`)
- DB: PostgreSQL 15 (see `dev-infra/database/docker-compose.yml`)
- Schema location: `actions-server/prisma/schema.prisma`
- Shared models: `core-domain/src/models/*` (Zod)

Workflow:
1. Incoming HTTP request (Express)
2. Validate DTO with Zod schemas (core-domain)
3. Execute DB operation via Prisma
4. Return JSON response

## Database Layer — Supabase Integration

The Artha Network uses Supabase (managed PostgreSQL) as the persistence layer.

- Backend (actions-server): Uses service_role key for privileged operations.
- Frontend (web-app): Uses anon key for safe inserts/reads.
- core-domain: Defines shared schema validation using Zod.
- dev-infra: Stores initialization SQL and migration documentation.

Supabase replaces the local Docker Postgres environment while maintaining schema compatibility.
