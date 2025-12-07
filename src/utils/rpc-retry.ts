import { RpcEndpointManager } from './rpc-endpoint-manager';
import { Connection } from '@solana/web3.js';

type RpcCall<T> = (connection: Connection) => Promise<T>;

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function jitterDelay(base: number, attempt: number) {
    const expo = base * (2 ** (attempt - 1));
    const jitterFactor = 0.35;
    const rand = (Math.random() * 2 - 1) * jitterFactor;
    return Math.max(0, Math.floor(expo * (1 + rand)));
}

export interface RpcRetryOptions {
    endpointManager: RpcEndpointManager;
    maxAttempts?: number;
    baseDelayMs?: number;
    timeoutMs?: number;
    onAttempt?: (meta: { endpoint: string; attempt: number; err?: any }) => void;
}

export async function withRpcRetry<T>(
    rpcCall: RpcCall<T>,
    opts: RpcRetryOptions
): Promise<T> {
    const {
        endpointManager,
        maxAttempts = Number(process.env.RPC_MAX_ATTEMPTS) || 5,
        baseDelayMs = Number(process.env.RPC_BASE_DELAY_MS) || 500,
        timeoutMs = Number(process.env.RPC_TIMEOUT_MS) || 8000,
        onAttempt,
    } = opts;

    let lastErr: any;

    // Try sequence of endpoints by attempts. Each attempt we pick endpoint from manager.
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const endpoint = endpointManager.pickEndpoint();
        const connection = new Connection(endpoint, 'confirmed');

        try {
            // Use Promise.race to timeout if RPC hangs
            const res = await Promise.race([
                rpcCall(connection),
                new Promise((_, rej) => setTimeout(() => rej(new Error('rpc_timeout')), timeoutMs)),
            ]);
            endpointManager.markSuccess(endpoint);
            if (onAttempt) onAttempt({ endpoint, attempt });
            return res as T;
        } catch (err: any) {
            lastErr = err;
            endpointManager.markFailure(endpoint);

            // Determine if error likely transient
            const msg = String(err?.message ?? err);
            const isTransient = /fetch failed|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ECONNABORTED|429|503|rpc_timeout/i.test(msg);

            if (onAttempt) onAttempt({ endpoint, attempt, err });

            if (!isTransient) {
                // Not transient -> rethrow immediately
                throw err;
            }

            if (attempt === maxAttempts) break;

            const delay = jitterDelay(baseDelayMs, attempt);
            // Log and wait
            // eslint-disable-next-line no-console
            console.warn(`[RPC Retry] Attempt ${attempt}/${maxAttempts} failed for ${endpoint}: ${msg}. Retrying in ${delay}ms`);
            await sleep(delay);
        }
    }

    // All attempts exhausted
    throw lastErr;
}
