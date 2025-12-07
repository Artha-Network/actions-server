
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env manually to see exactly what is being read
const envPath = path.resolve(__dirname, '.env');
console.log('Loading .env from:', envPath);
const envConfig = dotenv.parse(fs.readFileSync(envPath));

const keysToCheck = ['PROGRAM_ID', 'USDC_MINT'];

keysToCheck.forEach(key => {
    const val = envConfig[key];
    if (val) {
        console.log(`\nChecking ${key}:`);
        console.log(`Value: '${val}'`);
        console.log(`Length: ${val.length}`);
        console.log('Char Codes:', val.split('').map(c => c.charCodeAt(0)).join(', '));

        try {
            const { PublicKey } = require('@solana/web3.js');
            new PublicKey(val);
            console.log('✅ Valid PublicKey');
        } catch (e) {
            console.error('❌ Invalid PublicKey:', e.message);
        }
    } else {
        console.log(`\n❌ ${key} NOT FOUND in .env`);
    }
});
