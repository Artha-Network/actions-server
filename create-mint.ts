
import { Connection, Keypair, clusterApiUrl } from '@solana/web3.js';
import { createMint } from '@solana/spl-token';
import fs from 'fs';

const RPC_URL = 'https://api.devnet.solana.com';

async function wait(ms: number) {
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
        const latest Blockhash = await connection.getLatestBlockhash();
        await connection.confirmTransaction({
            signature,
            blockhash: latest Blockhash.blockhash,
            lastValidBlockHeight: latest Blockhash.lastValidBlockHeight
        });
        console.log('Airdrop confirmed!');
    } catch (e) {
        console.error('Airdrop failed:', e);
        process.exit(1);
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
