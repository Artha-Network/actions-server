% Supabase Setup — Artha Network

## Overview
Supabase is used as the managed PostgreSQL backend for Artha Network.

- Project: Artha-Network
- Project ID: xwsinvputbgrifvxjehf
- Hosted at: https://xwsinvputbgrifvxjehf.supabase.co
- Authentication: service_role (backend) + anon (frontend)

## Environment Variables
- `DATABASE_URL` (postgres connection URL)
- `SUPABASE_SERVICE_ROLE_KEY` (backend-only)
- `SUPABASE_PROJECT_ID`

## Usage
- actions-server: connects using service role key (see `src/lib/supabaseAdmin.ts`)
- web-app: connects using anon key (see `web-app/src/lib/supabaseClient.ts`)
- core-domain: shares Zod schema types for data integrity

## Schema
Tables:
- users
- deals
- resolve_tickets

Row Level Security (RLS) enabled for users table.

