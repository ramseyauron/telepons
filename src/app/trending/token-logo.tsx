"use client";

import Image from "next/image";
import { useState } from "react";

export function TrendingTokenLogo({
  name,
  url,
}: {
  name: string;
  url?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <span className="trending-logo trending-logo-fallback">
        {name.trim().charAt(0).toUpperCase() || "T"}
      </span>
    );
  }

  if (url.startsWith("/")) {
    return (
      <Image
        alt={`${name} logo`}
        className="trending-logo"
        height={56}
        onError={() => setFailed(true)}
        src={url}
        width={56}
      />
    );
  }

  return (
    // Token metadata may point to any public IPFS gateway selected at launch.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={`${name} logo`}
      className="trending-logo"
      height={56}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={url}
      width={56}
    />
  );
}
