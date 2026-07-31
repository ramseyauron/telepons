"use client";

import {
  useAppKit,
  useAppKitAccount,
  useAppKitProvider,
  type Provider,
} from "@reown/appkit/react";
import { useCallback, useEffect, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatEther,
  getAddress,
  http,
  isAddressEqual,
  keccak256,
  parseEther,
  toHex,
} from "viem";
import { robinhoodChain } from "@/blockchain/chain";
import { ponsV1FactoryAbi } from "@/blockchain/pons-v1-abi";
import { ponsV1 } from "@/config/pons";
import type { LaunchDraft } from "@/launch/schema";

type EthereumProvider = {
  request(input: {
    method: string;
    params?: unknown[] | Record<string, unknown>;
  }): Promise<unknown>;
};

type WalletState =
  | { status: "IDLE" }
  | { status: "CONNECTING" }
  | { status: "MATCHED"; address: string }
  | { status: "MISMATCH"; address: string }
  | { status: "SIMULATING"; address: string }
  | {
      status: "SIMULATED";
      address: string;
      launchConfigId: bigint;
      dexId: bigint;
      salt: `0x${string}`;
      launchFee: bigint;
      transactionValue: bigint;
    }
  | { status: "SUBMITTING"; address: string }
  | { status: "CONFIRMING"; address: string; hash: `0x${string}` }
  | { status: "SUBMITTED"; address: string; hash: `0x${string}` }
  | {
      status: "LAUNCHED";
      address: string;
      hash: `0x${string}`;
      tokenAddress: string;
    }
  | {
      status: "ERROR";
      address?: string;
      message: string;
      retry: "CONNECT" | "SIMULATE" | "SUBMIT";
    };

function readableError(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;

  const candidate = error as {
    shortMessage?: unknown;
    message?: unknown;
  };
  if (typeof candidate.shortMessage === "string") {
    return candidate.shortMessage;
  }
  if (typeof candidate.message === "string") {
    return candidate.message.split("\n")[0];
  }
  return fallback;
}

export function LaunchWalletPanel({
  draft,
  expectedDeployer,
  expiresAt,
  sessionId,
}: {
  draft: LaunchDraft;
  expectedDeployer: string;
  expiresAt: string;
  sessionId: string;
}) {
  const [wallet, setWallet] = useState<WalletState>({ status: "IDLE" });
  const [activeProvider, setActiveProvider] =
    useState<EthereumProvider | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(600);
  const { open } = useAppKit();
  const { address: appKitAddress, isConnected } = useAppKitAccount({
    namespace: "eip155",
  });
  const { walletProvider } = useAppKitProvider<Provider>("eip155");
  const reownConfigured = Boolean(
    process.env.NEXT_PUBLIC_REOWN_PROJECT_ID,
  );
  const expired = remainingSeconds <= 0;
  const publicClient = createPublicClient({
    chain: robinhoodChain,
    transport: http(robinhoodChain.rpcUrls.default.http[0]),
  });

  const matchWallet = useCallback(
    async (provider: EthereumProvider, suppliedAddress?: string) => {
      const accounts = suppliedAddress
        ? [suppliedAddress]
        : ((await provider.request({
            method: "eth_requestAccounts",
          })) as string[]);
      if (!accounts[0]) throw new Error("The wallet returned no account.");

      const connectedAddress = getAddress(accounts[0]);
      const expectedAddress = getAddress(expectedDeployer);
      if (!isAddressEqual(connectedAddress, expectedAddress)) {
        setActiveProvider(null);
        setWallet({ status: "MISMATCH", address: connectedAddress });
        return;
      }

      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: `0x${robinhoodChain.id.toString(16)}` }],
        });
      } catch {
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: `0x${robinhoodChain.id.toString(16)}`,
              chainName: robinhoodChain.name,
              nativeCurrency: robinhoodChain.nativeCurrency,
              rpcUrls: robinhoodChain.rpcUrls.default.http,
              blockExplorerUrls: [
                robinhoodChain.blockExplorers?.default.url,
              ],
            },
          ],
        });
      }

      setActiveProvider(provider);
      setWallet({ status: "MATCHED", address: connectedAddress });
    },
    [expectedDeployer],
  );

  useEffect(() => {
    if (!isConnected || !appKitAddress || !walletProvider || expired) return;
    const timer = window.setTimeout(() => {
      void matchWallet(
        walletProvider as EthereumProvider,
        appKitAddress,
      ).catch((error: unknown) => {
        setActiveProvider(null);
        setWallet({
          status: "ERROR",
          message: readableError(
            error,
            "The connected wallet could not be prepared.",
          ),
          retry: "CONNECT",
        });
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [appKitAddress, expired, isConnected, matchWallet, walletProvider]);

  useEffect(() => {
    function updateCountdown() {
      const remaining = Math.max(
        0,
        Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000),
      );
      setRemainingSeconds(remaining);
    }

    updateCountdown();
    const timer = window.setInterval(updateCountdown, 1_000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  async function connectWallet() {
    if (expired) return;
    if (reownConfigured) {
      setWallet({ status: "CONNECTING" });
      try {
        await open({ view: "Connect", namespace: "eip155" });
      } catch (error) {
        setWallet({
          status: "ERROR",
          message: readableError(error, "Wallet selection could not open."),
          retry: "CONNECT",
        });
      }
      return;
    }

    const injectedProvider = window.ethereum as EthereumProvider | undefined;
    if (!injectedProvider) {
      setWallet({
        status: "ERROR",
        message:
          "No injected EVM wallet was found. Copy this link into your wallet browser, or configure Reown for mobile wallet selection.",
        retry: "CONNECT",
      });
      return;
    }

    setWallet({ status: "CONNECTING" });

    try {
      await matchWallet(injectedProvider);
    } catch (error) {
      setWallet({
        status: "ERROR",
        message: readableError(error, "The wallet connection was rejected."),
        retry: "CONNECT",
      });
    }
  }

  function tokenParams() {
    return {
      name: draft.name,
      symbol: draft.symbol,
      logo: draft.logoUrl ?? "",
      description: draft.description,
      socials: {
        twitter: draft.twitter ?? "",
        telegram: draft.telegram ?? "",
        discord: "",
        website: draft.website ?? "",
        farcaster: "",
      },
      feeWallet: getAddress(expectedDeployer),
    };
  }

  async function findEnabledLaunchConfig(): Promise<bigint> {
    const count = await publicClient.readContract({
      address: ponsV1.factory,
      abi: ponsV1FactoryAbi,
      functionName: "launchConfigCount",
    });

    for (let id = 0n; id < count; id += 1n) {
      const config = await publicClient.readContract({
        address: ponsV1.factory,
        abi: ponsV1FactoryAbi,
        functionName: "getLaunchConfig",
        args: [id],
      });
      if (config.enabled) return id;
    }

    throw new Error("No enabled Pons launch configuration is available.");
  }

  async function findEnabledDex(): Promise<bigint> {
    const count = await publicClient.readContract({
      address: ponsV1.factory,
      abi: ponsV1FactoryAbi,
      functionName: "dexConfigCount",
    });

    for (let id = 0n; id < count; id += 1n) {
      const config = await publicClient.readContract({
        address: ponsV1.factory,
        abi: ponsV1FactoryAbi,
        functionName: "getDexConfig",
        args: [id],
      });
      if (config.enabled) return id;
    }

    throw new Error("No enabled Pons DEX configuration is available.");
  }

  async function simulateLaunch() {
    if (expired) return;
    const accountAddress =
      wallet.status === "MATCHED"
        ? wallet.address
        : wallet.status === "ERROR" && wallet.retry === "SIMULATE"
          ? wallet.address
          : undefined;
    if (!accountAddress) return;

    setWallet({ status: "SIMULATING", address: accountAddress });
    try {
      const account = getAddress(accountAddress);
      const [launchEnabled, whitelisted, launchFee, launchConfigId, dexId] =
        await Promise.all([
          publicClient.readContract({
            address: ponsV1.factory,
            abi: ponsV1FactoryAbi,
            functionName: "launchEnabled",
          }),
          publicClient.readContract({
            address: ponsV1.factory,
            abi: ponsV1FactoryAbi,
            functionName: "whitelistedLaunchers",
            args: [account],
          }),
          publicClient.readContract({
            address: ponsV1.factory,
            abi: ponsV1FactoryAbi,
            functionName: "launchFee",
          }),
          findEnabledLaunchConfig(),
          findEnabledDex(),
        ]);

      if (!launchEnabled && !whitelisted) {
        throw new Error("This wallet is not currently allowed to launch.");
      }

      const salt = keccak256(
        toHex(`${sessionId}:${crypto.randomUUID()}`),
      );
      const transactionValue =
        launchFee + parseEther(draft.developerBuyEth);

      await publicClient.simulateContract({
        account,
        address: ponsV1.factory,
        abi: ponsV1FactoryAbi,
        functionName: "launchToken",
        args: [tokenParams(), launchConfigId, dexId, salt],
        value: transactionValue,
      });

      setWallet({
        status: "SIMULATED",
        address: account,
        launchConfigId,
        dexId,
        salt,
        launchFee,
        transactionValue,
      });
    } catch (error) {
      setWallet({
        status: "ERROR",
        address: accountAddress,
        message: readableError(error, "Launch simulation failed."),
        retry: "SIMULATE",
      });
    }
  }

  async function submitLaunch() {
    if (expired || wallet.status !== "SIMULATED" || !activeProvider) return;

    const prepared = wallet;
    setWallet({ status: "SUBMITTING", address: prepared.address });

    try {
      const walletClient = createWalletClient({
        account: getAddress(prepared.address),
        chain: robinhoodChain,
        transport: custom(activeProvider),
      });
      const hash = await walletClient.writeContract({
        address: ponsV1.factory,
        abi: ponsV1FactoryAbi,
        functionName: "launchToken",
        args: [
          tokenParams(),
          prepared.launchConfigId,
          prepared.dexId,
          prepared.salt,
        ],
        value: prepared.transactionValue,
      });

      setWallet({
        status: "CONFIRMING",
        address: prepared.address,
        hash,
      });

      try {
        const confirmation = await fetch(
          `/api/launch/${encodeURIComponent(sessionId)}/transaction`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ transactionHash: hash }),
          },
        );
        const result = (await confirmation.json()) as {
          status?: string;
          tokenAddress?: string;
        };

        if (
          confirmation.ok &&
          result.status === "ACTIVE" &&
          result.tokenAddress
        ) {
          setWallet({
            status: "LAUNCHED",
            address: prepared.address,
            hash,
            tokenAddress: result.tokenAddress,
          });
          return;
        }
      } catch {
        // The transaction has already been submitted. A temporary backend
        // confirmation failure must never be presented as a rejected wallet
        // transaction.
      }

      setWallet({
        status: "SUBMITTED",
        address: prepared.address,
        hash,
      });
    } catch (error) {
      setWallet({
        status: "ERROR",
        address: prepared.address,
        message: readableError(
          error,
          "The launch transaction was rejected.",
        ),
        retry: "CONNECT",
      });
    }
  }

  async function copyLaunchLink() {
    await window.navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    window.setTimeout(() => setLinkCopied(false), 2_000);
  }

  return (
    <section className="wallet-panel">
      <div>
        <p className="field-label">Expected deployer</p>
        <p className="address">{expectedDeployer}</p>
      </div>

      <div className={`countdown ${expired ? "expired" : ""}`}>
        <p className="field-label">Execution window</p>
        <p>
          {expired
            ? "Session expired"
            : `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(
                remainingSeconds % 60,
              ).padStart(2, "0")} remaining`}
        </p>
      </div>

      {expired && (
        <div className="notice error">
          This session was not executed within 10 minutes. Return to Telegram
          and create a new launch session.
        </div>
      )}

      {wallet.status === "IDLE" && (
        <div className="notice">
          On mobile, Connect Wallet opens your wallet through WalletConnect. If
          your wallet does not appear, copy the launch link and open it in the
          wallet&apos;s browser.
        </div>
      )}

      {wallet.status === "MISMATCH" && (
        <div className="notice error">
          Wrong wallet connected: <span className="address">{wallet.address}</span>
        </div>
      )}

      {!reownConfigured && wallet.status === "ERROR" && (
        <button
          className="secondary-button"
          onClick={copyLaunchLink}
          type="button"
        >
          {linkCopied ? "Launch link copied" : "Copy launch link"}
        </button>
      )}

      {wallet.status === "ERROR" && (
        <div className="notice error" role="alert">
          <strong>Launch preparation failed.</strong>
          <br />
          {wallet.message}
        </div>
      )}

      {wallet.status === "MATCHED" && (
        <div className="notice success">
          Deployer wallet matched. Simulate the exact launch transaction before
          signing.
        </div>
      )}

      {wallet.status === "SIMULATED" && (
        <div className="notice success">
          Simulation succeeded. Launch fee:{" "}
          {formatEther(wallet.launchFee)} ETH. Total transaction value:{" "}
          {formatEther(wallet.transactionValue)} ETH.
        </div>
      )}

      {wallet.status === "SIMULATING" && (
        <div className="notice">
          Reading the current Pons configuration and simulating the exact
          transaction…
        </div>
      )}

      {wallet.status === "SUBMITTED" && (
        <div className="notice success">
          Transaction submitted:{" "}
          <a
            href={`${robinhoodChain.blockExplorers.default.url}/tx/${wallet.hash}`}
            rel="noreferrer"
            target="_blank"
          >
            {wallet.hash}
          </a>
        </div>
      )}

      {wallet.status === "CONFIRMING" && (
        <div className="notice">
          Transaction submitted. Waiting for the on-chain TokenLaunched event…
        </div>
      )}

      {wallet.status === "LAUNCHED" && (
        <div className="notice success">
          Token launched successfully.
          <br />
          Contract: <span className="address">{wallet.tokenAddress}</span>
          <br />
          The channel announcement has been updated.
        </div>
      )}

      {wallet.status === "MATCHED" ||
      (wallet.status === "ERROR" && wallet.retry === "SIMULATE") ? (
        <button
          className="primary-button"
          disabled={expired}
          onClick={simulateLaunch}
          type="button"
        >
          {wallet.status === "ERROR" ? "Retry simulation" : "Simulate launch"}
        </button>
      ) : wallet.status === "SIMULATED" ? (
        <button
          className="primary-button danger-button"
          disabled={expired}
          onClick={submitLaunch}
          type="button"
        >
          Launch token — irreversible
        </button>
      ) : wallet.status === "SUBMITTED" ||
        wallet.status === "CONFIRMING" ||
        wallet.status === "LAUNCHED" ||
        wallet.status === "SIMULATING" ? null : (
        <button
          className="primary-button"
          disabled={
            expired ||
            wallet.status === "CONNECTING" ||
            wallet.status === "SUBMITTING"
          }
          onClick={connectWallet}
          type="button"
        >
          {wallet.status === "CONNECTING"
            ? "Connecting…"
            : wallet.status === "SUBMITTING"
              ? "Waiting for signature…"
              : "Connect deployer wallet"}
        </button>
      )}
    </section>
  );
}
