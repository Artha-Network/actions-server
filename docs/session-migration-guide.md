# Session Migration Guide

## Prerequisites

Before running the migration, ensure you have both `DATABASE_URL` and `DIRECT_URL` in your `.env` file.

## Environment Variables Setup

### For Supabase

Supabase uses connection pooling. You need two connection strings:

1. **DATABASE_URL** - Connection pooler (port 6543) - Used for regular queries
2. **DIRECT_URL** - Direct connection (port 5432) - Used for Prisma migrations

### How to Get Your Connection Strings

1. Go to your Supabase project dashboard
2. Navigate to **Settings** → **Database**
3. Find **Connection string** section
4. You'll see two options:
   - **Connection Pooling** (Transaction mode) - Use this for `DATABASE_URL`
   - **Direct Connection** - Use this for `DIRECT_URL`

### Example .env Configuration

```env
# Connection Pooler (for regular queries)
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.xwsinvputbgrifvxjehf.supabase.co:6543/postgres?pgbouncer=true"

# Direct Connection (for migrations)
DIRECT_URL="postgresql://postgres:[YOUR-PASSWORD]@db.xwsinvputbgrifvxjehf.supabase.co:5432/postgres"

# Other required variables
SUPABASE_URL=https://xwsinvputbgrifvxjehf.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Key Differences

- **Port**: Pooler uses `6543`, Direct uses `5432`
- **pgbouncer parameter**: Pooler URL includes `?pgbouncer=true`, Direct URL does not
- **Usage**: 
  - `DATABASE_URL` → Regular application queries (faster, connection pooling)
  - `DIRECT_URL` → Prisma migrations only (bypasses pooler for schema changes)

## Running the Migration

Once your `.env` file is configured:

```bash
cd actions-server
npx prisma migrate dev --name add_sessions_table
```

This will:
1. Create the `sessions` table in your database
2. Add the relation to the `users` table
3. Create necessary indexes

## Troubleshooting

### Error: "Environment variable not found: DIRECT_URL"

**Solution**: Add `DIRECT_URL` to your `.env` file as shown above.

### Error: "Connection refused" or "Connection timeout"

**Possible causes**:
1. Wrong port number (should be 5432 for DIRECT_URL)
2. Incorrect password
3. IP not whitelisted in Supabase (check Settings → Database → Connection Pooling)

### Error: "Schema 'artha' does not exist"

If your schema is different, update the `schema.prisma` file:
```prisma
url = env("DATABASE_URL") // include ?schema=your_schema_name
```

## Verification

After migration, verify the table was created:

```bash
npx prisma studio
```

Or check in Supabase dashboard under **Table Editor** - you should see the `sessions` table.

