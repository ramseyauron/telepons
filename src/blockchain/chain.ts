import { defineChain } from "viem";
import { ponsV1 } from "@/config/pons";

export const robinhoodChain = defineChain({
  id: ponsV1.chainId,
  name: "Robinhood Chain",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.ROBINHOOD_RPC_URL ?? ponsV1.publicRpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: "Robinhood Chain Explorer",
      url: ponsV1.explorerUrl,
    },
  },
});
