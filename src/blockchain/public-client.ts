import { createPublicClient } from "viem";
import { env } from "@/config/env";
import { ponsV1 } from "@/config/pons";
import { robinhoodChain } from "./chain";
import { rateLimitedHttp } from "./rate-limited-transport";

/**
 * One server-side client per process keeps all background and command reads on
 * the same five-request-per-second scheduler.
 */
export const robinhoodPublicClient = createPublicClient({
  chain: robinhoodChain,
  transport: rateLimitedHttp(
    env.ROBINHOOD_RPC_URL ?? ponsV1.publicRpcUrl,
    5,
  ),
});
