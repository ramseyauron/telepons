import { ImageResponse } from "next/og";
import { formatEther } from "viem";
import { getTokenReport } from "@/intelligence/token-report";

export const alt = "Telepons verified token report";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function TokenReportOpenGraph({ params }: { params: Promise<{ tokenAddress: string }> }) {
  const { tokenAddress } = await params;
  const report = await getTokenReport(tokenAddress);
  if (!report) {
    return new ImageResponse(
      <div style={{ alignItems: "center", background: "#06150f", color: "white", display: "flex", fontSize: 54, height: "100%", justifyContent: "center", width: "100%" }}>Telepons Token Report</div>,
      size,
    );
  }
  const volume = Number(formatEther(BigInt(report.volume?.grossVolumeWei ?? "0"))).toLocaleString("en-US", { maximumFractionDigits: 4 });
  const holders = report.holders?.adjustedHolderCount.toLocaleString("en-US") ?? "Indexing";
  const graduation = `${((report.snapshot?.graduationBps ?? 0) / 100).toFixed(2)}%`;

  return new ImageResponse(
    <div style={{ background: "radial-gradient(circle at 85% 15%, #50ef9b44, transparent 35%), #06150f", color: "#f5fff9", display: "flex", flexDirection: "column", height: "100%", padding: "66px 76px", width: "100%" }}>
      <div style={{ color: "#50ef9b", display: "flex", fontSize: 25, fontWeight: 800, letterSpacing: 3 }}>TELEPONS VERIFIED TOKEN REPORT</div>
      <div style={{ display: "flex", fontSize: 72, fontWeight: 900, marginTop: 34 }}>{report.draft.name}</div>
      <div style={{ color: "#50ef9b", display: "flex", fontSize: 38, fontWeight: 800 }}>${report.draft.symbol}</div>
      <div style={{ borderTop: "2px solid #50ef9b44", display: "flex", gap: 80, marginTop: 46, paddingTop: 36 }}>
        {[['VOLUME', `${volume} ETH`], ['HOLDERS', holders], ['GRADUATION', graduation]].map(([label, value]) => (
          <div key={label} style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ color: "#9ab4a6", fontSize: 19, letterSpacing: 2 }}>{label}</span>
            <strong style={{ fontSize: 38, marginTop: 9 }}>{value}</strong>
          </div>
        ))}
      </div>
      <div style={{ color: "#8aa598", display: "flex", fontSize: 21, marginTop: "auto" }}>telepons.bot · Robinhood Chain</div>
    </div>,
    size,
  );
}
