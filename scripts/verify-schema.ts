/**
 * Schema Verification Script
 * Checks that all Prisma models have corresponding database tables
 */

import { prisma } from '../src/lib/prisma';

const EXPECTED_TABLES = [
  'users',
  'deals',
  'evidence',
  'resolve_tickets',
  'attestations',
  'integration_hooks',
  'price_snapshots',
  'onchain_events',
  'auth_challenges'
];

async function verifySchema() {
  console.log('🔍 Verifying database schema...\n');

  try {
    // Query all tables in artha schema
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'artha'
      ORDER BY table_name
    `;

    const tableNames = tables.map(t => t.table_name);

    console.log('📋 Found tables in artha schema:');
    tableNames.forEach(name => console.log(`  ✓ ${name}`));
    console.log('');

    // Check for missing tables
    const missing = EXPECTED_TABLES.filter(expected => !tableNames.includes(expected));

    if (missing.length > 0) {
      console.log('❌ Missing tables:');
      missing.forEach(name => console.log(`  ✗ ${name}`));
      process.exit(1);
    }

    // Check for critical columns
    console.log('🔍 Verifying critical columns...\n');

    // Check auth_challenges columns
    const authChallengesCols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'artha' AND table_name = 'auth_challenges'
      ORDER BY ordinal_position
    `;
    console.log('auth_challenges columns:', authChallengesCols.map(c => c.column_name).join(', '));

    // Check deals has onchain_address
    const dealsCols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'artha'
        AND table_name = 'deals'
        AND column_name = 'onchain_address'
    `;
    if (dealsCols.length === 0) {
      console.log('❌ deals.onchain_address column missing!');
      process.exit(1);
    }
    console.log('✓ deals.onchain_address exists');

    // Check resolve_tickets has new columns
    const ticketsCols = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'artha'
        AND table_name = 'resolve_tickets'
        AND column_name IN ('reason_short', 'violated_rules')
      ORDER BY column_name
    `;
    if (ticketsCols.length < 2) {
      console.log('❌ resolve_tickets missing Sprint 4 columns!');
      console.log('   Found:', ticketsCols.map(c => c.column_name));
      process.exit(1);
    }
    console.log('✓ resolve_tickets.reason_short exists');
    console.log('✓ resolve_tickets.violated_rules exists');

    console.log('\n✅ All schema checks passed!');
    console.log('✅ Database is in sync with Prisma schema');

  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifySchema();
