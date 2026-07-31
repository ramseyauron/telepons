export function buildIpfsGatewayUrl(gatewayValue: string, cid: string): string {
  const normalizedGateway = gatewayValue.trim();
  const gateway = new URL(
    normalizedGateway.startsWith("http")
      ? normalizedGateway
      : `https://${normalizedGateway}`,
  );
  const basePath = gateway.pathname
    .replace(/\/+$/, "")
    .replace(/\/ipfs$/i, "");
  gateway.pathname = `${basePath}/ipfs/${encodeURIComponent(cid)}`;
  gateway.search = "";
  gateway.hash = "";
  return gateway.toString();
}

export function ipfsCidFromUrl(url: string): string | undefined {
  try {
    // A legacy launch draft may contain either an absolute gateway URL or only
    // `/ipfs/<cid>`. Supplying a base lets both formats be repaired at render
    // time without mutating the frozen transaction draft.
    const encodedCid = new URL(url, "https://ipfs.invalid").pathname.match(
      /\/ipfs\/([^/]+)/i,
    )?.[1];
    return encodedCid ? decodeURIComponent(encodedCid) : undefined;
  } catch {
    return undefined;
  }
}
