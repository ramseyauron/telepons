"use client";

import { useState } from "react";

function imageSources(url?: string): string[] {
  if (!url) return [];

  const sources = [url];
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/\/ipfs\/([^/]+)/i);
    const cid = match?.[1];
    if (cid) {
      sources.push(
        `https://blue-raw-808.mypinata.cloud/ipfs/${encodeURIComponent(cid)}`,
      );
    }
  } catch {
    return [];
  }

  return [...new Set(sources)];
}

export function TokenLogo({ name, url }: { name: string; url?: string }) {
  const sources = imageSources(url);
  const [sourceIndex, setSourceIndex] = useState(0);

  const activeSource = sources[sourceIndex];
  if (!activeSource) {
    return (
      <div
        aria-label={`${name} logo unavailable`}
        className="token-logo token-logo-fallback"
        role="img"
      >
        {name.trim().charAt(0).toUpperCase() || "T"}
      </div>
    );
  }

  return (
    // This URL is a public IPFS gateway URL stored in the frozen launch draft.
    // Loading it directly preserves its hostname; Next/Image would otherwise
    // require every user-configurable Pinata gateway to be build-time allowlisted.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={`${name} logo`}
      className="token-logo"
      height={112}
      onError={() => setSourceIndex((index) => index + 1)}
      referrerPolicy="no-referrer"
      src={activeSource}
      width={112}
    />
  );
}
