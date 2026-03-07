import { PrismaClient, SolanaNetwork, TitleStatus, DealStatus } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_SELLER_WALLET = "CDwBKcVPYAVN4SoyjgPomr9yMD5CN3D69XXmK8ELtgvG";
const DEMO_BUYER_WALLET = "46Yoyzm1fXFBnmXB4N8WvUAyJQLeEbDQZ9FZxspPr7FG";

// Placeholder addresses used for demo deal (no real on-chain state)
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const USDC_DEVNET_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const DEMO_VINS = [
  { vin: "1HGCM82633A123456", label: "2003 Honda Accord" },
  { vin: "2T1BURHE0JC037523", label: "2018 Toyota Corolla" },
  { vin: "3VWFE21C04M000001", label: "2004 VW Golf" },
  { vin: "5FNRL5H35GB124798", label: "2016 Honda Odyssey" },
  { vin: "JM1BK343X81149171", label: "2008 Mazda 3" },
];

async function main() {
  console.log("Seeding demo data...");

  // ── Step 1: Upsert demo Users ─────────────────────────────────────────────
  const seller = await prisma.user.upsert({
    where: { walletAddress: DEMO_SELLER_WALLET },
    update: { displayName: "Alice Motors", reputationScore: 72 },
    create: {
      walletAddress: DEMO_SELLER_WALLET,
      walletPublicKey: DEMO_SELLER_WALLET,
      displayName: "Alice Motors",
      reputationScore: 72,
      network: SolanaNetwork.DEVNET,
    },
  });
  console.log(`  Seller: ${seller.displayName} (${seller.id})`);

  const buyer = await prisma.user.upsert({
    where: { walletAddress: DEMO_BUYER_WALLET },
    update: { displayName: "Bob Buyer", reputationScore: 58 },
    create: {
      walletAddress: DEMO_BUYER_WALLET,
      walletPublicKey: DEMO_BUYER_WALLET,
      displayName: "Bob Buyer",
      reputationScore: 58,
      network: SolanaNetwork.DEVNET,
    },
  });
  console.log(`  Buyer: ${buyer.displayName} (${buyer.id})`);

  // ── Step 2: Upsert VehicleTitle records ───────────────────────────────────
  for (const { vin } of DEMO_VINS) {
    await prisma.vehicleTitle.upsert({
      where: { vin },
      update: {
        currentOwnerWallet: DEMO_SELLER_WALLET,
        titleStatus: TitleStatus.PENDING,
        transferDate: null,
      },
      create: {
        vin,
        currentOwnerWallet: DEMO_SELLER_WALLET,
        titleStatus: TitleStatus.PENDING,
      },
    });
  }
  console.log(`  VehicleTitles: ${DEMO_VINS.length} VINs seeded/reset to PENDING`);

  // ── Step 3: Seed a demo Deal (INIT, not funded) ───────────────────────────
  const DEMO_VIN = "2T1BURHE0JC037523";
  const existing = await prisma.deal.findFirst({
    where: { vin: DEMO_VIN, sellerId: seller.id, buyerId: buyer.id },
  });

  if (!existing) {
    const now = new Date();
    const deliverDeadline = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const disputeDeadline = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);

    const deal = await prisma.deal.create({
      data: {
        sellerId: seller.id,
        buyerId: buyer.id,
        sellerWallet: DEMO_SELLER_WALLET,
        buyerWallet: DEMO_BUYER_WALLET,
        arbiterPubkey: DEMO_SELLER_WALLET, // placeholder — arbiter not needed in INIT
        onchainAddress: SYSTEM_PROGRAM,    // placeholder PDA
        depositTokenMint: USDC_DEVNET_MINT,
        vaultAta: SYSTEM_PROGRAM,
        priceUsd: 15000,
        feeBps: 100,
        status: DealStatus.INIT,
        deliverDeadline,
        disputeDeadline,
        usdPriceSnapshot: { feed_id: "SOL/USD", price: 0, conf: 0, slot: 0 },
        vin: DEMO_VIN,
        title: "2018 Toyota Corolla — Private Sale",
        description:
          "Low mileage, one owner, full service history. VIN title transfer included.",
      },
    });
    console.log(`  Demo Deal created: ${deal.id} (status: ${deal.status})`);
  } else {
    console.log(`  Demo Deal already exists: ${existing.id} (status: ${existing.status}) — skipped`);
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
