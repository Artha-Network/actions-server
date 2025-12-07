
import "dotenv/config";
import { Connection, Keypair } from "@solana/web3.js";
import { createMint, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import fs from "fs";

// Helper to wait
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log("🚀 Setting up Persistent Admin & Mint...");

    const rpcUrl = "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    // 1. Setup Admin Wallet (Saves key to admin-keypair.json)
    let adminKey: Keypair;
    if (fs.existsSync("admin-keypair.json")) {
        const secret = JSON.parse(fs.readFileSync("admin-keypair.json", "utf-8"));
        adminKey = Keypair.fromSecretKey(new Uint8Array(secret));
    } else {
        adminKey = Keypair.generate();
        fs.writeFileSync("admin-keypair.json", JSON.stringify(Array.from(adminKey.secretKey)));
    }

    console.log("   🔑 Admin / Mint Authority:", adminKey.publicKey.toBase58());

    // 2. Check Balance
    const balance = await connection.getBalance(adminKey.publicKey);
    console.log("   💰 Balance:", balance / 1e9, "SOL");

    if (balance < 0.01 * 1e9) {
        console.log("   ⚠️  Low balance. Requesting airdrop...");
        try {
            const sig = await connection.requestAirdrop(adminKey.publicKey, 1e9);
            await connection.confirmTransaction(sig);
            console.log("   ✅ Airdrop successful");
        } catch (e) {
            console.error("   ❌ Airdrop failed (Rate Limited).");
            console.error("\n   🔴 ACTION REQUIRED: Please send some Devnet SOL to:", adminKey.publicKey.toBase58());
            console.error("   Then run this script again.");
            process.exit(1);
        }
    }

    // 3. Create Mint (if not exists)
    let mintAddress: string;
    if (fs.existsSync("persistent-mint.txt")) {
        mintAddress = fs.readFileSync("persistent-mint.txt", "utf-8").trim();
        console.log("   ✅ Using existing Persistent Mint:", mintAddress);
    } else {
        console.log("   Creating new Mint...");
        try {
            const mint = await createMint(
                connection,
                adminKey, // payer
                adminKey.publicKey, // mint authority
                null, // freeze authority
                6 // decimals
            );
            mintAddress = mint.toBase58();
            console.log("   ✅ Created NEW Mint:", mintAddress);
            fs.writeFileSync("persistent-mint.txt", mintAddress);
        } catch (e) {
            console.error("   ❌ Failed to create mint:", e);
            process.exit(1);
        }
    }

    // 4. Instructions for User
    console.log("\n   🎉 SETUP COMPLETE.");
    console.log("   Mint Address:", mintAddress);
    console.log("   Admin Wallet:", adminKey.publicKey.toBase58());
    console.log("\n   To receive tokens, run: npx tsx mint-to.ts <YOUR_WALLET_ADDRESS>");
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
