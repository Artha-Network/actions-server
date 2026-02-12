/**
 * Sprint 4 smoke test: validators and resolve/OPEN_DISPUTE wiring.
 * Run after build: node scripts/sprint4-smoke.js
 */
const path = require("path");

// Load from dist (run after npm run build)
const dist = path.join(__dirname, "..", "dist", "src");
const { ResolveActionSchema, ConfirmActionSchema } = require(path.join(dist, "types", "actions.js"));
const { getInstructionDiscriminator } = require(path.join(dist, "solana", "anchor.js"));

const validDealId = "00000000-0000-4000-8000-000000000001";
const validWallet = "11111111111111111111111111111111";
const validTxSig = "1".repeat(64);

function assert(condition, msg) {
  if (!condition) throw new Error(msg || "Assertion failed");
}

// ResolveActionSchema: dealId + optional verdict
ResolveActionSchema.parse({ dealId: validDealId, verdict: "RELEASE" });
ResolveActionSchema.parse({ dealId: validDealId, verdict: "REFUND" });
ResolveActionSchema.parse({ dealId: validDealId });
console.log("  ResolveActionSchema: OK");

// ConfirmActionSchema with OPEN_DISPUTE
ConfirmActionSchema.parse({
  dealId: validDealId,
  txSig: validTxSig,
  actorWallet: validWallet,
  action: "OPEN_DISPUTE",
});
console.log("  ConfirmActionSchema (OPEN_DISPUTE): OK");

// Resolve instruction discriminator
const resolveDisc = getInstructionDiscriminator("resolve");
assert(Buffer.isBuffer(resolveDisc), "resolve discriminator should be Buffer");
assert(resolveDisc.length === 8, "resolve discriminator should be 8 bytes");
console.log("  RESOLVE discriminator: OK");

console.log("\nSprint 4 smoke: all checks passed.");
process.exit(0);
