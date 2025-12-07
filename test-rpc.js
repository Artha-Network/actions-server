
const rpc = 'https://api.devnet.solana.com';

async function testConnection() {
    console.log(`Testing connection to ${rpc}...`);
    try {
        const response = await fetch(rpc, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getLatestBlockhash',
                params: [{ commitment: 'finalized' }]
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Success:', JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Fetch failed:', err);
        //@ts-ignore
        if (err.cause) console.error('Cause:', err.cause);
    }
}

testConnection();
