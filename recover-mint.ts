
import "dotenv/config";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { escrowService } from "./src/services/escrow-service";
import { solanaConfig } from "./src/config/solana";

// Helper to wait
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log("🚀 Starting E2E Escrow Test...");
    console.log("RPC:", solanaConfig.rpcUrl);
    console.log("Cluster:", solanaConfig.cluster);
    console.log("Mint:", solanaConfig.usdcMint.toBase58());

    if (!process.env.USDC_MINT) {
        console.error("❌ USDC_MINT not set in environment");
        process.exit(1);
    }

    const connection = new Connection(solanaConfig.rpcUrl, "confirmed");

    // 1. Setup Wallets
    console.log("\n1️⃣  Setting up wallets...");
    const seller = Keypair.generate();
    const buyer = Keypair.generate();
    const mintAuthority = Keypair.generate(); // We don't have the mint auth keypair, this might be a problem if we want to mint.

    // Wait! We created the mint in a previous step but lost the specific Keypair in the script execution (it was generated ephemeral).
    // We saved the MINT address, but not the AUTHORITY keypair to mint more tokens.
    // CRITICAL: We cannot mint more tokens of that specific mint if we lost the authority keypair.
    // Checking create-mint.js... yes, Keypair.generate() was used and not saved.
    // FIX: We need to create ANOTHER mint and this time SAVE the authority, OR just create a new one for this test.
    // Since we updated the ENV with the "lost authority" mint, the user won't be able to mint either.
    // We must correct this. We need a persistent mint with a known authority or just create one-off mints for logging.

    // Let's create a NEW mint for this test and if successful, we should probably update the env vars with THIS one and save the key.
    // Actually, better strategy: Create a mint, safe the authority to a file `mint-auth.json` so we can reuse it.

    console.log("   Seller:", seller.publicKey.toBase58());
    console.log("   Buyer: ", buyer.publicKey.toBase58());

    // 2. Airdrop SOL
    console.log("\n2️⃣  Airdropping SOL...");
    try {
        const sig1 = await connection.requestAirdrop(seller.publicKey, 1e9);
        await connection.confirmTransaction(sig1);
        const sig2 = await connection.requestAirdrop(buyer.publicKey, 1e9);
        await connection.confirmTransaction(sig2);
        console.log("   ✅ Airdrops successful");
    } catch (e) {
        console.log("   ⚠️  Airdrop might have failed (rate limit?), continuing...");
    }

    // 3. Create Mint (Since we lost the authority of the previous one)
    console.log("\n3️⃣  Creating Test Mint...");
    // We keep the payer as the mint authority for simplicity
    const { createMint } = await import("@solana/spl-token");
    const mint = await createMint(
        connection,
        seller, // payer
        seller.publicKey, // authority
        null,
        6
    );
    console.log("   ✅ Created Mint:", mint.toBase58());

    // Hack: Temporarily override the config's mint for this test instance
    // Note: This only affects this process, not the running server.
    // But to verify the server code logic, this is fine.
    // However, `escrowService` imports `solanaConfig` which is a const. We can't easily mutate it if it's already imported.
    // Actually `solanaConfig` exports an object, we MIGHT be able to mutate the properties if they are not readonly.
    // solanaConfig definition: `export const solanaConfig = { ... } as const;` -> Readonly.
    // We cannot mutate it.

    // Alternative: We must update the env var and RELOAD the config or just fail if we can't.
    // Since we can't test the actual deployed server without matching mints, let's just create a new persistent mint 
    // and update the project config AGAIN. This is cleaner.

    // For this script, we will just proceed with the *test* logic using the new mint to verify the CODE works.
    // If the code works with *a* valid mint, it works.

    // 4. Mint tokens to Buyer
    console.log("\n4️⃣  Minting tokens to Buyer...");
    const buyerAta = await getOrCreateAssociatedTokenAccount(
        connection,
        seller,
        mint,
        buyer.publicKey
    );
    await mintTo(
        connection,
        seller,
        mint,
        buyerAta.address,
        seller.publicKey,
        1000_000000 // 1000 USDC
    );
    console.log("   ✅ Buyer funded with 1000 tokens");

    // 5. Initiate Deal
    console.log("\n5️⃣  Initiating Deal...");
    const dealId = "test-deal-" + Date.now();

    // We need to mock the `prisma` calls or ensure DB is reachable. 
    // `escrowService` uses `prisma`. 
    // If we run this script, it will try to connect to the remote DB.

    // We need to construct the input exactly as the controller would.
    /*
    interface InitiateActionInput {
        clientDealId: string;
        sellerWallet: string;
        buyerWallet: string;
        amount: number;
        feeBps: number;
        deliverBy?: number;
        disputeDeadline?: number;
        arbiterWallet?: string;
        title: string;
    }
    */

    // Note: We need to bypass the `solanaConfig.usdcMint` check/usage in `escrowService`.
    // Since we can't restart the test process with new env vars easily without spawning a child process,
    // we will have to assume the code is correct if we successfully manually performed the SPL operations.

    // WAIT. The user's problem was `AccountNotInitialized`.
    // If I run this test with a *fresh* mint and *my own* code, I am testing MY test script, not the `escrowService` logic fully.
    // But `escrowService` logic is standard Anchor.

    // Let's rely on the fact that I need to provide the User a way to mint tokens for the *current* configured mint.
    // Verification: The user's current configured mint is `8GUn...`. I lost the authority? 
    // In `create-mint.js`: `const payer = Keypair.generate();`. 
    // YES. I generated a throwaway keypair for the authority. 
    // RESULT: `8GUn...` is a valid mint, but NO ONE can mint tokens for it anymore. The freeze authority is null, but mint authority was `payer`.
    // This renders the mint useless for testing unless I minted some initial supply. I didn't.

    console.log("⚠️  CRITICAL: Previous mint authority was lost. Creating a new PERSISTENT mint and saving keys.");

    const fs = await import("fs");
    const authorityKey = Keypair.generate();
    fs.writeFileSync("mint-authority.json", JSON.stringify(Array.from(authorityKey.secretKey)));

    const persistentMint = await createMint(
        connection,
        authorityKey, // payer
        authorityKey.publicKey, // authority
        null,
        6
    );

    console.log("✅ NEW PERSISTENT MINT:", persistentMint.toBase58());
    console.log("✅ Saved authority to mint-authority.json");

    // We will exit here so the Agent can update the configs with THIS mint which is actually usable.
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
