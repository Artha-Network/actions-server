/**
 * Generate a new arbiter keypair and display configuration instructions
 *
 * Usage:
 *   npx tsx scripts/generate-arbiter-keypair.ts
 */

import { Keypair } from '@solana/web3.js';
import nacl from 'tweetnacl';

function generateArbiterKeypair() {
  // Generate a new random keypair using nacl
  const naclKeypair = nacl.sign.keyPair();

  // The seed is the first 32 bytes of the secret key
  const seed = naclKeypair.secretKey.slice(0, 32);
  const seedHex = Buffer.from(seed).toString('hex');

  // Convert to Solana Keypair for display
  const solanaKeypair = Keypair.fromSecretKey(naclKeypair.secretKey);
  const publicKey = solanaKeypair.publicKey.toBase58();

  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║       🔑 New Arbiter Keypair Generated                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  console.log('📋 Configuration Instructions:\n');
  console.log('1. Add to actions-server/.env:');
  console.log('   ─────────────────────────────────────────────────────────');
  console.log(`   ARBITER_ED25519_SECRET_HEX=${seedHex}`);
  console.log('   ─────────────────────────────────────────────────────────\n');

  console.log('2. Add to arbiter-service/.env (create if missing):');
  console.log('   ─────────────────────────────────────────────────────────');
  console.log(`   ARBITER_ED25519_SECRET_HEX=${seedHex}`);
  console.log('   ─────────────────────────────────────────────────────────\n');

  console.log('🔑 Public Key (for verification):');
  console.log(`   ${publicKey}\n`);

  console.log('⚠️  Security Notes:');
  console.log('   • Keep the SECRET_HEX value private!');
  console.log('   • Never commit .env files to version control');
  console.log('   • Both services must use the SAME secret hex');
  console.log('   • Restart both services after updating .env\n');

  return { seedHex, publicKey };
}

// Run if executed directly
if (require.main === module) {
  generateArbiterKeypair();
}

export { generateArbiterKeypair };
