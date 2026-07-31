import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
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
  const fallbackLogoUrl =
    logoCid && env.PINATA_FALLBACK_FETCH_GATEWAY
      ? buildIpfsGatewayUrl(env.PINATA_FALLBACK_FETCH_GATEWAY, logoCid)
      : undefined;
  const usable = session.status === "READY";

  return (
    <main className="launch-shell">
      <section className="launch-card">
        <div className="launch-heading">
          <TokenLogo
            fallbackUrl={fallbackLogoUrl}
            name={draft.name}
            url={draft.logoUrl}
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
        ) : (
          <div className="notice error">
            This launch session is no longer available for execution.
          </div>
        )}
      </section>
    </main>
  );
}
