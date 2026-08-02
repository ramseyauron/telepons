"use client";

import { useState } from "react";

export function ReportTokenLogo({ name, url }: { name: string; url?: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return <div className="report-logo report-logo-fallback">{name.charAt(0)}</div>;
  }
  return (
    // Token logos use user-selected public gateways that cannot be allowlisted at build time.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={`${name} logo`}
      className="report-logo"
      height={128}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={url}
      width={128}
    />
  );
}
