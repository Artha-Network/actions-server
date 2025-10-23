# PostgreSQL Setup Guide — Artha Network

## Purpose
This document explains how to configure and use PostgreSQL for Artha Network's core data (users, deals, arbitration).

## Environment Variables
```
DATABASE_URL="postgresql://artha:secret@localhost:5432/artha_dev?schema=public"
```

## Running Locally
1. cd dev-infra
2. docker-compose up -d
3. cd ../actions-server
4. npx prisma migrate dev --name init
5. npm run start:dev

## Schema Overview
- User: Wallet-identified participant
- Deal: Escrow transaction metadata
- ResolveTicket: Arbitration record from AI or human review

## Future Scope
- Add KYC table linked to User
- Add reputation audit trail
- Store AI arbitration logs with rationale CID reference

