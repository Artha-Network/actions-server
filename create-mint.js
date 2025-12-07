
const { Connection, Keypair, clusterApiUrl } = require('@solana/web3.js');
const { createMint } = require('@solana/spl-token');
const fs = require('fs');

const RPC_URL = 'https://api.devnet.solana.com';

async function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log('Connecting to Devnet...');
    const connection = new Connection(RPC_URL, 'confirmed');

    const payer = Keypair.generate();
    console.log('Payer:', payer.publicKey.toBase58());

    console.log('Requesting airdrop (2 SOL)...');
    try {
        const signature = await connection.requestAirdrop(payer.publicKey, 2 * 1000000000); // 2 SOL
        console.log('Airdrop sig:', signature);

        console.log('Waiting for confirmation...');
        const latestBlockhash = await connection.getLatestBlockhash();
        await connection.confirmTransaction({
            signature,
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
        });
        console.log('Airdrop confirmed!');
    } catch (e) {
        console.error('Airdrop checking failed (might still have worked):', e.message);
    }

    // Wait a bit just in case
    await wait(2000);

    console.log('Creating Mint...');
    try {
        const mint = await createMint(
            connection,
            payer,
            payer.publicKey,
            null,
            6
        );
        console.log('Mint Created:', mint.toBase58());
        fs.appendFileSync('new-mint.txt', `MINT=${mint.toBase58()}\n`);
    } catch (e) {
        console.error('Mint creation failed:', e);
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
