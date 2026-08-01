import { ImageResponse } from "next/og";
import { Buffer } from "node:buffer";
import { eq } from "drizzle-orm";
import { buildIpfsGatewayUrl, ipfsCidFromUrl } from "@/assets/ipfs-url";
import { env } from "@/config/env";
import { db } from "@/db/client";
import { launchSessions } from "@/db/schema";
import { launchDraftSchema } from "@/launch/schema";

export const alt = "Telepons token launch";
export const size = { width: 600, height: 315 };
export const contentType = "image/png";

async function fetchLogoDataUrl(url?: string): Promise<string | undefined> {
  if (!url) return undefined;

  try {
    const response = await fetch(url, {
      cache: "force-cache",
      signal: AbortSignal.timeout(2_000),
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
          fontSize: 27,
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
        padding: "29px 32px",
        width: "100%",
      }}
    >
      <div style={{ alignItems: "center", display: "flex" }}>
        {logoDataUrl ? (
          <img
            alt=""
            height="66"
            src={logoDataUrl}
            style={{ borderRadius: 15, objectFit: "cover" }}
            width="66"
          />
        ) : null}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginLeft: logoDataUrl ? 15 : 0,
          }}
        >
          <div
            style={{
              color: "#ff8d71",
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 1.5,
            }}
          >
            TELEPONS LAUNCH TERMINAL
          </div>
          <div style={{ fontSize: 29, fontWeight: 900, marginTop: 4 }}>
            {draft.name}
          </div>
          <div style={{ color: "#ff8d71", fontSize: 14, fontWeight: 800 }}>
            ${draft.symbol}
          </div>
        </div>
      </div>

      <div
        style={{
          borderTop: "1px solid #ffffff22",
          display: "flex",
          flexDirection: "column",
          marginTop: 18,
          paddingTop: 15,
        }}
      >
        <div style={{ color: "#d6ccdf", fontSize: 13, lineHeight: 1.35 }}>
          {draft.description}
        </div>
        <div style={{ display: "flex", marginTop: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", width: "33%" }}>
            <span style={{ color: "#998da6", fontSize: 9 }}>DEVELOPER BUY</span>
            <span style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>
              {draft.developerBuyEth} ETH
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", width: "33%" }}>
            <span style={{ color: "#998da6", fontSize: 9 }}>NETWORK</span>
            <span style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>
              Robinhood Chain
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", width: "34%" }}>
            <span style={{ color: "#998da6", fontSize: 9 }}>STATUS</span>
            <span
              style={{
                color: launched ? "#76efad" : "#ffd06e",
                fontSize: 13,
                fontWeight: 800,
                marginTop: 3,
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
