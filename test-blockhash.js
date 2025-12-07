import { Connection } from '@solana/web3.js';

const RPCS = [
    process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com', // Use env var name from .env
    'https://api.testnet.solana.com',
    'https://api.mainnet-beta.solana.com',
    'https://api.devnet.solana.com'
];

async function test(url) {
    if (!url) return;
    const conn = new Connection(url, 'confirmed');
    // console.log('Testing', url);
    try {
        const latest = await conn.getLatestBlockhash();
        console.log('OK', url, 'blockhash:', latest.blockhash.slice(0, 8));
    } catch (err) {
        console.error('ERR', url, err && err.message ? err.message : err);
    }
}

(async () => {
    console.log("Starting RPC connectivity test...");
    for (const url of RPCS) {
        await test(url);
    }
})();
