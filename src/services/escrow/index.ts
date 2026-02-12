// Export types
export type { ServiceOptions, DealSummary } from "./types";

// Export constants
export {
  INITIATE_DISCRIMINATOR,
  FUND_DISCRIMINATOR,
  RELEASE_DISCRIMINATOR,
  REFUND_DISCRIMINATOR,
} from "./constants";

// Export utilities
export {
  resolveReqId,
  secondsFromUnix,
  ensureDeadline,
  derivePayer,
  fetchDealSummary,
} from "./utils";

// Export handlers
export { handleInitiate } from "./handlers/initiate.handler";
export { handleFund } from "./handlers/fund.handler";
export { handleRelease } from "./handlers/release.handler";
export { handleRefund } from "./handlers/refund.handler";
export { handleConfirm } from "./handlers/confirm.handler";

