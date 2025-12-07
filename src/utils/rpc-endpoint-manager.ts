import assert from 'assert';

export interface EndpointInfo {
    url: string;
    failures: number;
    healthy: boolean;
    lastFailedAt?: number;
}

export class RpcEndpointManager {
    endpoints: EndpointInfo[];
    circuitThreshold: number;
    circuitCooldownMs: number;

    constructor(urls: string[], circuitThreshold = 4, circuitCooldownMs = 60_000) {
        assert(urls && urls.length > 0, 'At least one RPC URL required');
        this.endpoints = urls.map((u) => ({ url: u, failures: 0, healthy: true }));
        this.circuitThreshold = circuitThreshold;
        this.circuitCooldownMs = circuitCooldownMs;
    }

    markFailure(url: string) {
        const e = this.endpoints.find((x) => x.url === url);
        if (!e) return;
        e.failures += 1;
        e.lastFailedAt = Date.now();
        if (e.failures >= this.circuitThreshold) {
            e.healthy = false;
        }
    }

    markSuccess(url: string) {
        const e = this.endpoints.find((x) => x.url === url);
        if (!e) return;
        e.failures = 0;
        e.healthy = true;
        e.lastFailedAt = undefined;
    }

    // Return next healthy endpoint in round-robin by taking slice of healthy endpoints.
    // We prefer endpoints earlier in the configured list (primary first).
    getHealthyEndpoints() {
        // Re-enable cooled-down endpoints
        const now = Date.now();
        for (const e of this.endpoints) {
            if (!e.healthy && e.lastFailedAt && now - e.lastFailedAt > this.circuitCooldownMs) {
                e.healthy = true;
                e.failures = 0;
                e.lastFailedAt = undefined;
            }
        }
        return this.endpoints.filter((e) => e.healthy);
    }

    // Returns the next endpoint URL (primary preferred). If none healthy, returns all endpoints as last resort.
    pickEndpoint() {
        const healthy = this.getHealthyEndpoints();
        if (healthy.length > 0) return healthy[0].url;
        // fallback: return endpoint with fewest failures (least bad)
        return this.endpoints.slice().sort((a, b) => a.failures - b.failures)[0].url;
    }

    getAllEndpoints() {
        return this.endpoints.map((e) => e.url);
    }
}
