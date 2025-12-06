# Actions Server

The backend service for the Artha Network, handling Solana Actions (Blinks), escrow logic, and database interactions.

## Overview
This server exposes endpoints for:
- **Escrow Operations**: Initiate, Fund, Release, Refund, Dispute.
- **User Management**: Wallet identity and profile management via Supabase.
- **Events**: Indexing and retrieving on-chain events.
- **Deals**: Managing deal state and history.

## Tech Stack
- **Runtime**: Node.js (TypeScript)
- **Framework**: Express.js
- **Database**: Supabase (PostgreSQL) & Prisma ORM
- **Blockchain**: Solana Web3.js & SPL Token
- **AI**: Gemini API (via Arbiter Service)

## Setup
1. Copy `.env.example` to `.env` and fill in the required values.
2. Run `npm install` to install dependencies.
3. Run `npm run dev` to start the development server.

## Key Directories
- `src/routes`: API route definitions.
- `src/services`: Business logic and external service integrations.
- `src/solana`: Solana-specific helpers and transaction building.
- `src/lib`: Shared utilities and libraries.
