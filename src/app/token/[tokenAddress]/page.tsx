import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatEther } from "viem";
import { ponsV1 } from "@/config/pons";
import { getTokenReport } from "@/intelligence/token-report";
import { requestTokenHolderSyncIfStale } from "@/indexer/holder-sync";
import { ReportTokenLogo } from "./token-logo";

export const dynamic = "force-dynamic";

function eth(raw?: string | null, maximumFractionDigits = 4): string {
  return Number(formatEther(BigInt(raw ?? "0"))).toLocaleString("en-US", {
    maximumFractionDigits,
  });
}

export async function generateMetadata({ params }: { params: Promise<{ tokenAddress: string }> }): Promise<Metadata> {
  const { tokenAddress } = await params;
  const report = await getTokenReport(tokenAddress);
  if (!report) return { title: "Token not found — Telepons" };
  return {
    title: `${report.draft.name} ($${report.draft.symbol}) — Telepons`,
    description: `${report.draft.description} View verified community, volume, holder, and graduation data on Telepons.`,
  };
}

export default async function TokenReportPage({ params }: { params: Promise<{ tokenAddress: string }> }) {
  const { tokenAddress } = await params;
  const report = await getTokenReport(tokenAddress);
  if (!report) notFound();
  await requestTokenHolderSyncIfStale(
    report.tokenAddress,
    "token_report_viewed",
  );
  const { draft, snapshot, volume, holders } = report;
  const progress = ((snapshot?.graduationBps ?? 0) / 100).toFixed(2);

  return (
    <main className="token-report-page">
      <nav className="site-nav report-nav" aria-label="Main navigation">
        <Link className="wordmark" href="/">
          <span className="brand-mark"><Image alt="" height={32} src="/brand/telepons-mark.png" width={32} /></span>
          telepons
        </Link>
        <div className="nav-links"><Link href="/trending">Trending</Link><Link href="/docs">Docs</Link></div>
      </nav>

      <article className="token-report-shell">
        <header className="token-report-header">
          <ReportTokenLogo name={draft.name} url={report.logoUrl ?? draft.logoUrl} />
          <div>
            <p className="eyebrow">VERIFIED COMMUNITY REPORT</p>
            <h1>{draft.name}</h1>
            <strong>${draft.symbol}</strong>
          </div>
          <span className="report-live">● LIVE</span>
        </header>

        <p className="token-report-description">{draft.description}</p>

        <section className="report-metrics">
          <div><span>Market cap</span><strong>{eth(snapshot?.marketCapWethWei)} ETH</strong></div>
          <div><span>Volume since launch</span><strong>{eth(volume?.grossVolumeWei)} ETH</strong></div>
          <div><span>Net flow</span><strong>{eth(volume?.netFlowWei)} ETH</strong></div>
          <div><span>Trades</span><strong>{(volume?.tradeCount ?? 0).toLocaleString("en-US")}</strong></div>
          <div><span>Adjusted holders</span><strong>{holders?.adjustedHolderCount.toLocaleString("en-US") ?? "Indexing"}</strong></div>
          <div><span>Top 10 concentration</span><strong>{holders ? `${(holders.top10Bps / 100).toFixed(2)}%` : "Indexing"}</strong></div>
        </section>

        <section className="report-graduation">
          <div><span>Graduation progress</span><strong>{snapshot?.graduated ? "Graduated" : `${progress}%`}</strong></div>
          <div className="report-progress"><span style={{ width: `${Math.min(snapshot?.graduationBps ?? 0, 10_000) / 100}%` }} /></div>
          <p>Graduation is a liquidity threshold, not a quality or safety rating.</p>
        </section>

        <section className="report-contract">
          <span>Official contract</span>
          <a href={`${ponsV1.explorerUrl}/address/${report.tokenAddress}`}>{report.tokenAddress}</a>
        </section>

        <div className="report-actions">
          <a className="primary" href={`https://axiom.trade/t/${report.tokenAddress}/@badday?chain=robinhood`}>Trade on Axiom</a>
          <a href={`https://t.me/maestro?start=${report.tokenAddress}-addictaddict`}>Maestro</a>
          <a href={`https://t.me/Sigma_buyBot?start=xbadday-${report.tokenAddress}`}>Sigma</a>
          {draft.telegram ? <a href={draft.telegram}>Join {report.groupTitle}</a> : null}
        </div>

        <footer className="token-report-footer">
          <span>Data indexed from Robinhood Chain</span>
          <span>Updated {snapshot?.updatedAt.toISOString() ?? "pending"}</span>
        </footer>
      </article>
    </main>
  );
}
