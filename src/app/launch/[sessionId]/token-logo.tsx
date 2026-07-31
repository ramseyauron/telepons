"use client";

import { useState } from "react";

export function TokenLogo({ name, url }: { name: string; url?: string }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
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
      onError={() => setFailed(true)}
      src={url}
      width={112}
    />
  );
}
