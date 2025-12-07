
import "dotenv/config";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import fs from "fs";

async function main() {
    const recipientArgs = process.argv.slice(2);
    if (recipientArgs.length === 0) {
        console.error("Usage: npx tsx mint-to.ts <RECIPIENT_WALLET_ADDRESS>");
        process.exit(1);
    }
    const recipientAddr = recipientArgs[0];

    if (!fs.existsSync("admin-keypair.json")) {
        console.error("❌ admin-keypair.json not found. Run setup-mint.ts first.");
        process.exit(1);
    }
    if (!fs.existsSync("persistent-mint.txt")) {
        console.error("❌ persistent-mint.txt not found. Run setup-mint.ts first.");
        process.exit(1);
    }

    const rpcUrl = "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    const secret = JSON.parse(fs.readFileSync("admin-keypair.json", "utf-8"));
    const adminKey = Keypair.fromSecretKey(new Uint8Array(secret));
    const mintAddress = fs.readFileSync("persistent-mint.txt", "utf-8").trim();
    const mint = new PublicKey(mintAddress);

    console.log("🚀 Minting 1000 USDC to:", recipientAddr);
    console.log("   Using Mint:", mintAddress);
    console.log("   Admin:", adminKey.publicKey.toBase58());

    try {
        const recipientPubkey = new PublicKey(recipientAddr);
        const recipientAta = await getOrCreateAssociatedTokenAccount(
            connection,
            adminKey, // payer
            mint,
            recipientPubkey
        );

        const sig = await mintTo(
            connection,
            adminKey, // payer
            mint,
            recipientAta.address,
            adminKey, // authority
            1000_000000 // 1000 USDC
        );
        console.log("   ✅ Success! Tx:", sig);
    } catch (e) {
        console.error("   ❌ Failed:", e);
        process.exit(1);
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
