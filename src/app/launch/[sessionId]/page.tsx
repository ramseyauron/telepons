import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { isAddress } from "viem";
import { buildIpfsGatewayUrl, ipfsCidFromUrl } from "@/assets/ipfs-url";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { launchSessions } from "@/db/schema";
import { launchDraftSchema } from "@/launch/schema";
import { LaunchWalletPanel } from "./wallet-panel";
import { TokenLogo } from "./token-logo";

export const dynamic = "force-dynamic";

export default async function LaunchSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await db.query.launchSessions.findFirst({
    where: eq(launchSessions.id, sessionId),
  });

  if (!session) {
    notFound();
  }

  const draft = launchDraftSchema.parse(JSON.parse(session.draftJson));
  const logoCid = draft.logoUrl ? ipfsCidFromUrl(draft.logoUrl) : undefined;
  const primaryLogoUrl = logoCid
    ? buildIpfsGatewayUrl(env.PINATA_FETCH_GATEWAY, logoCid)
    : draft.logoUrl;
  const fallbackLogoUrl =
    logoCid && env.PINATA_FALLBACK_FETCH_GATEWAY
      ? buildIpfsGatewayUrl(env.PINATA_FALLBACK_FETCH_GATEWAY, logoCid)
      : undefined;
  const usable = session.status === "READY";
  const tradingUrl =
    session.status === "ACTIVE" &&
    session.tokenAddress &&
    isAddress(session.tokenAddress)
      ? `https://axiom.trade/t/${session.tokenAddress}/@badday?chain=robinhood`
      : undefined;
  const maestroUrl =
    tradingUrl && session.tokenAddress
      ? `https://t.me/maestro?start=${session.tokenAddress}-addictaddict`
      : undefined;
  const sigmaUrl =
    tradingUrl && session.tokenAddress
      ? `https://t.me/Sigma_buyBot?start=xbadday-${session.tokenAddress}`
      : undefined;

  return (
    <main className="launch-shell">
      <section className="launch-card">
        <div className="launch-heading">
          <TokenLogo
            fallbackUrl={fallbackLogoUrl}
            name={draft.name}
            url={primaryLogoUrl}
          />
          <div>
            <p className="eyebrow">TELEPONS LAUNCH TERMINAL</p>
            <h1 className="token-title">{draft.name}</h1>
            <p className="token-symbol">${draft.symbol}</p>
          </div>
        </div>

        <div className="launch-grid">
          <div>
            <p className="field-label">Description</p>
            <p>{draft.description}</p>
          </div>
          <div>
            <p className="field-label">Developer buy</p>
            <p>{draft.developerBuyEth} ETH</p>
          </div>
          <div>
            <p className="field-label">Network</p>
            <p>Robinhood Chain</p>
          </div>
          <div>
            <p className="field-label">Session status</p>
            <p>{session.status}</p>
          </div>
        </div>

        {usable ? (
          <LaunchWalletPanel
            draft={draft}
            expectedDeployer={session.expectedDeployer}
            expiresAt={session.expiresAt.toISOString()}
            sessionId={session.id}
          />
        ) : tradingUrl ? (
          <div className="launch-complete-actions">
            <div className="notice success">
              This token has launched and is available for trading.
            </div>
            <div className="trading-buttons">
              <a
                className="primary-button trading-button"
                href={tradingUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Trade on Axiom
              </a>
              <a
                className="primary-button trading-button maestro-button"
                href={maestroUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Trade with Maestro
              </a>
              <a
                className="primary-button trading-button sigma-button"
                href={sigmaUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Trade with Sigma
              </a>
            </div>
          </div>
        ) : (
          <div className="notice error">
            This launch session is no longer available for execution.
          </div>
        )}
      </section>
    </main>
  );
}
