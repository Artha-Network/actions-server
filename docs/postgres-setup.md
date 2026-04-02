# PostgreSQL Setup Guide — Artha Network

## Purpose
This document explains how to configure and use PostgreSQL for Artha Network's core data (users, deals, arbitration).

## Environment Variables
```
DATABASE_URL="postgresql://artha:secret@localhost:5432/artha_dev?schema=public"
```

## Running Locally
1. Set `DATABASE_URL` in `.env` to your Supabase Pooler URL
2. `npx prisma db push`
3. `npm run dev`

## Schema Overview
- User: Wallet-identified participant
- Deal: Escrow transaction metadata
- ResolveTicket: Arbitration record from AI or human review

## Future Scope
- Add KYC table linked to User
- Add reputation audit trail
- Store AI arbitration logs with rationale CID reference

