import { randomUUID } from "crypto";

export interface ActionLogParams {
  reqId?: string;
  action: string;
  dealId?: string;
  wallet?: string;
  txSig?: string;
  slot?: number;
  status?: string;
  durationMs?: number;
  message?: string;
  error?: unknown;
}

export function logAction(params: ActionLogParams) {
  const payload = {
    level: params.error ? "error" : "info",
    reqId: params.reqId ?? randomUUID(),
    action: params.action,
    dealId: params.dealId,
    wallet: params.wallet,
    txSig: params.txSig,
    slot: params.slot,
    status: params.status,
    durationMs: params.durationMs,
    message: params.message,
    error: params.error instanceof Error ? params.error.message : undefined,
  };
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(payload));
}
