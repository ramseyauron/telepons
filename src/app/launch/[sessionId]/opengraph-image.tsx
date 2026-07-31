import { ImageResponse } from "next/og";
import { Buffer } from "node:buffer";
import { eq } from "drizzle-orm";
import { buildIpfsGatewayUrl, ipfsCidFromUrl } from "@/assets/ipfs-url";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { launchSessions } from "@/db/schema";
import { launchDraftSchema } from "@/launch/schema";

export const alt = "Telepons token launch";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

async function fetchLogoDataUrl(url?: string): Promise<string | undefined> {
  if (!url) return undefined;

  try {
    const response = await fetch(url, {
      cache: "force-cache",
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return undefined;

    const mimeType = response.headers.get("content-type")?.split(";")[0];
    if (!mimeType?.startsWith("image/")) return undefined;

    const bytes = await response.arrayBuffer();
    return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
  } catch {
    return undefined;
  }
}

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await db.query.launchSessions.findFirst({
    where: eq(launchSessions.id, sessionId),
  });

  if (!session) {
    return new ImageResponse(
      <div
        style={{
          alignItems: "center",
          background: "#100d16",
          color: "#ffffff",
          display: "flex",
          fontSize: 54,
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        Telepons launch session
      </div>,
      size,
    );
  }

  const draft = launchDraftSchema.parse(JSON.parse(session.draftJson));
  const cid = draft.logoUrl ? ipfsCidFromUrl(draft.logoUrl) : undefined;
  const logoUrl = cid
    ? buildIpfsGatewayUrl(env.PINATA_FETCH_GATEWAY, cid)
    : draft.logoUrl;
  const logoDataUrl = await fetchLogoDataUrl(logoUrl);
  const launched = session.status === "ACTIVE";

  return new ImageResponse(
    <div
      style={{
        background:
          "radial-gradient(circle at 85% 10%, #ff795d55, transparent 34%), linear-gradient(145deg, #17121f, #09080d)",
        color: "#f8f4ff",
        display: "flex",
        flexDirection: "column",
        height: "100%",
        padding: "58px 64px",
        width: "100%",
      }}
    >
      <div style={{ alignItems: "center", display: "flex" }}>
        {logoDataUrl ? (
          <img
            alt=""
            height="132"
            src={logoDataUrl}
            style={{ borderRadius: 30, objectFit: "cover" }}
            width="132"
          />
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginLeft: logoDataUrl ? 30 : 0,
          }}
        >
          <div
            style={{
              color: "#ff8d71",
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 3,
            }}
          >
            TELEPONS LAUNCH TERMINAL
          </div>
          <div style={{ fontSize: 58, fontWeight: 900, marginTop: 9 }}>
            {draft.name}
          </div>
          <div style={{ color: "#ff8d71", fontSize: 28, fontWeight: 800 }}>
            ${draft.symbol}
          </div>
        </div>
      </div>

      <div
        style={{
          borderTop: "1px solid #ffffff22",
          display: "flex",
          flexDirection: "column",
          marginTop: 36,
          paddingTop: 30,
        }}
      >
        <div style={{ color: "#d6ccdf", fontSize: 25, lineHeight: 1.35 }}>
          {draft.description}
        </div>
        <div style={{ display: "flex", marginTop: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", width: "33%" }}>
            <span style={{ color: "#998da6", fontSize: 17 }}>DEVELOPER BUY</span>
            <span style={{ fontSize: 25, fontWeight: 700, marginTop: 6 }}>
              {draft.developerBuyEth} ETH
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", width: "33%" }}>
            <span style={{ color: "#998da6", fontSize: 17 }}>NETWORK</span>
            <span style={{ fontSize: 25, fontWeight: 700, marginTop: 6 }}>
              Robinhood Chain
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", width: "34%" }}>
            <span style={{ color: "#998da6", fontSize: 17 }}>STATUS</span>
            <span
              style={{
                color: launched ? "#76efad" : "#ffd06e",
                fontSize: 25,
                fontWeight: 800,
                marginTop: 6,
              }}
            >
              {launched ? "● LAUNCHED" : `● ${session.status}`}
            </span>
          </div>
        </div>
      </div>
    </div>,
    size,
  );
}
