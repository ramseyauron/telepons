import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { formatEther, getAddress } from "viem";
import { teleponsLinks } from "@/config/links";
import {
  getTrendingLeaderboard,
  isTrendingPeriod,
  trendingEmptyMessage,
  trendingPeriods,
  type TrendingPeriod,
} from "@/trending";
import { TrendingAutoRefresh } from "./auto-refresh";
import { TrendingTokenLogo } from "./token-logo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Trending — Telepons",
  description:
    "Telepons tokens ranked by verified gross ETH trading volume on Robinhood Chain.",
};

const periodLabels: Record<TrendingPeriod, string> = {
  "1h": "1H",
  "6h": "6H",
  "24h": "24H",
  "7d": "7D",
};

function formatEth(value: bigint): string {
  return Number(formatEther(value)).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export default async function TrendingPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const requestedPeriod = (await searchParams).period?.toLowerCase() ?? "24h";
  const period = isTrendingPeriod(requestedPeriod) ? requestedPeriod : "24h";
  const leaderboard = await getTrendingLeaderboard(period);

  return (
    <main className="trending-page">
      <TrendingAutoRefresh />
      <nav className="site-nav trending-nav" aria-label="Main navigation">
        <Link className="wordmark" href="/" aria-label="Telepons home">
          <span className="brand-mark">
            <Image
              alt=""
              height={32}
              priority
              src="/brand/telepons-mark.png"
              width={32}
            />
          </span>
          telepons
        </Link>
        <div className="nav-links">
          <Link href="/docs">Docs</Link>
          <a className="nav-cta" href={teleponsLinks.launchList}>
            Launch list
          </a>
        </div>
      </nav>

      <section className="trending-shell">
        <header className="trending-hero">
          <div>
            <p className="eyebrow">COMMUNITY INTELLIGENCE</p>
            <h1>Telepons Trending</h1>
            <p>
              Tokens ranked by gross ETH trading volume across verified pool
              swaps on Robinhood Chain.
            </p>
          </div>
          <span
            className={`trending-source ${leaderboard.source === "dummy" ? "demo" : "live"}`}
          >
            {leaderboard.source === "dummy"
              ? "DEMO DATA"
              : "LIVE ON-CHAIN DATA"}
          </span>
        </header>

        <div className="trending-toolbar">
          <div className="period-tabs" aria-label="Leaderboard period">
            {trendingPeriods.map((candidate) => (
              <Link
                aria-current={candidate === period ? "page" : undefined}
                className={candidate === period ? "active" : undefined}
                href={`/trending?period=${candidate}`}
                key={candidate}
              >
                {periodLabels[candidate]}
              </Link>
            ))}
          </div>
          <p>Auto-refreshes every 30 seconds</p>
        </div>

        {!leaderboard.enabled ? (
          <div className="trending-empty">
            <span>OFFLINE</span>
            <h2>Trending is currently disabled.</h2>
            <p>Enable it in the Telepons server environment to publish data.</p>
          </div>
        ) : leaderboard.entries.length === 0 ? (
          <div className="trending-empty">
            <span>NO RANKING YET</span>
            <h2>No eligible token for this period.</h2>
            <p>{trendingEmptyMessage(leaderboard.emptyReason)}</p>
          </div>
        ) : (
          <div className="trending-list">
            <div className="trending-list-heading" aria-hidden="true">
              <span>Rank / Token</span>
              <span>Activity</span>
              <span>Gross volume</span>
            </div>
            {leaderboard.entries.map((entry, index) => {
              const token = getAddress(entry.tokenAddress);
              const tokenTitle = (
                <>
                  <strong>{entry.name}</strong>
                  <span>${entry.symbol}</span>
                </>
              );
              return (
                <article className="trending-row" key={entry.tokenAddress}>
                  <div className="trending-token">
                    <span className="trending-rank">
                      {index === 0
                        ? "🥇"
                        : index === 1
                          ? "🥈"
                          : index === 2
                            ? "🥉"
                            : String(index + 1).padStart(2, "0")}
                    </span>
                    <TrendingTokenLogo
                      name={entry.name}
                      url={entry.logoUrl}
                    />
                    <div>
                      {entry.launchSessionId ? (
                        <Link href={`/launch/${entry.launchSessionId}`}>
                          {tokenTitle}
                        </Link>
                      ) : (
                        tokenTitle
                      )}
                    </div>
                  </div>

                  <div className="trending-activity">
                    <span>{entry.tradeCount.toLocaleString("en-US")} trades</span>
                    <span>
                      {entry.uniqueTraders.toLocaleString("en-US")} traders
                    </span>
                  </div>

                  <div className="trending-volume">
                    <strong>{formatEth(entry.grossVolumeWei)} ETH</strong>
                    <span>
                      Buy {formatEth(entry.buyVolumeWei)} · Sell{" "}
                      {formatEth(entry.sellVolumeWei)}
                    </span>
                  </div>

                  <div className="trending-actions">
                    {leaderboard.source === "dummy" ? (
                      <span className="demo-action">Trading disabled in demo</span>
                    ) : (
                      <>
                        <a
                          href={`https://axiom.trade/t/${token}/@badday?chain=robinhood`}
                        >
                          Axiom
                        </a>
                        <a href={`https://t.me/maestro?start=${token}-addictaddict`}>
                          Maestro
                        </a>
                        <a href={`https://t.me/Sigma_buyBot?start=xbadday-${token}`}>
                          Sigma
                        </a>
                        {entry.communityUrl ? (
                          <a href={entry.communityUrl}>Community</a>
                        ) : null}
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <footer className="trending-footer">
          <p>Eligibility: 5 trades from at least 2 unique traders.</p>
          <p>Volume is derived from indexed WETH-side pool swaps.</p>
        </footer>
      </section>
    </main>
  );
}
