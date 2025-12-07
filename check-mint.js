
const rpc = 'https://api.devnet.solana.com';
const mint = '8GUnJWzgzQ3NBGBpqfoMTbQcPf3X8UrEfjuHX1ykdjQ7';
const commonUsdcDevnet = '4zMMC9srt5aUhAnLiJP4xbDADRB8XTh15JmzKu7VqgP';

async function checkAccount(address, label) {
    console.log(`Checking ${label}: ${address}...`);
    try {
        const response = await fetch(rpc, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getAccountInfo',
                params: [address, { encoding: 'base64' }]
            })
        });

        const data = await response.json();
        if (data.result && data.result.value) {
            console.log(`${label} exists. Owner: ${data.result.value.owner}`);
            console.log('Account data length:', data.result.value.data[0].length);
        } else {
            console.log(`${label} DOES NOT EXIST.`);
        }
    } catch (err) {
        console.error('Fetch failed:', err);
    }
}

async function run() {
    await checkAccount(mint, 'Configured Mint');
    await checkAccount(commonUsdcDevnet, 'Common Devnet USDC');
}

run();
