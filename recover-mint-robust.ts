
import "dotenv/config";
import { Connection, Keypair } from "@solana/web3.js";
import { createMint } from "@solana/spl-token";
import fs from "fs";

// Helper to wait
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log("🚀 Starting Mint Recovery...");

    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    // 1. Setup Wallet
    let authorityKey: Keypair;
    if (fs.existsSync("mint-authority.json")) {
        console.log("   found existing mint-authority.json");
        const secret = JSON.parse(fs.readFileSync("mint-authority.json", "utf-8"));
        authorityKey = Keypair.fromSecretKey(new Uint8Array(secret));
    } else {
        console.log("   generating new authority...");
        authorityKey = Keypair.generate();
        fs.writeFileSync("mint-authority.json", JSON.stringify(Array.from(authorityKey.secretKey)));
    }

    console.log("   Authority:", authorityKey.publicKey.toBase58());

    // Check balance
    const balance = await connection.getBalance(authorityKey.publicKey);
    console.log("   Balance:", balance / 1e9, "SOL");

    if (balance < 0.1 * 1e9) {
        console.log("   Requesting airdrop...");
        try {
            const sig = await connection.requestAirdrop(authorityKey.publicKey, 1e9);
            await connection.confirmTransaction(sig);
            console.log("   ✅ Airdrop successful");
        } catch (e) {
            console.error("   ❌ Airdrop failed. You may need to manually fund this wallet:", authorityKey.publicKey.toBase58());

            if (balance < 0.005 * 1e9) {
                console.error("   Insufficient funds to create mint.");
                process.exit(1);
            }
        }
    }

    // 2. Create Mint
    console.log("\n2️⃣  Creating Persistent Mint...");
    try {
        const mint = await createMint(
            connection,
            authorityKey, // payer
            authorityKey.publicKey, // authority
            null,
            6
        );
        console.log("   ✅ Created Mint:", mint.toBase58());
        fs.writeFileSync("mint-address.txt", mint.toBase58());
    } catch (e) {
        console.error("   ❌ Failed to create mint:", e);
        // It might be that we already created one? Unlikely since we gen a new keypair if file missing.
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
