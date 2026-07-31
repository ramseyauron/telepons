"use client";

import { createAppKit } from "@reown/appkit/react";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import type { ReactNode } from "react";
import { robinhoodChain } from "@/blockchain/chain";

const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID;
const metadataUrl =
  process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://telepons.bot";

if (projectId) {
  createAppKit({
    adapters: [new EthersAdapter()],
    networks: [robinhoodChain],
    defaultNetwork: robinhoodChain,
    projectId,
    metadata: {
      name: "Telepons",
      description: "Wallet-signed token launches for Telegram communities.",
      url: metadataUrl,
      icons: [`${metadataUrl.replace(/\/$/, "")}/brand/telepons-mark.png`],
    },
    features: {
      analytics: false,
      email: false,
      socials: false,
    },
  });
}

export function AppKitProvider({ children }: { children: ReactNode }) {
  return children;
}
