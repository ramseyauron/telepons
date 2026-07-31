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
    const encodedCid = new URL(url).pathname.match(/\/ipfs\/([^/]+)/i)?.[1];
    return encodedCid ? decodeURIComponent(encodedCid) : undefined;
  } catch {
    return undefined;
  }
}
