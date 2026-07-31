import { randomBytes } from "node:crypto";
import { env } from "@/config/env";
import { buildIpfsGatewayUrl } from "./ipfs-url";

const maxLogoBytes = 5 * 1024 * 1024;

type SupportedImage = {
  extension: "png" | "jpg" | "webp";
  mimeType: "image/png" | "image/jpeg" | "image/webp";
};

function detectSupportedImage(bytes: Uint8Array): SupportedImage | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { extension: "png", mimeType: "image/png" };
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }

  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    return { extension: "webp", mimeType: "image/webp" };
  }

  return null;
}

export type StoredTelegramLogo = {
  storageKey: string;
  publicUrl: string;
  mimeType: string;
  pinataFileId?: string;
  cid?: string;
};

type PinataUploadResponse = {
  data?: {
    id?: string;
    cid?: string;
  };
  error?: {
    code?: number;
    message?: string;
  };
};

function pinataGatewayUrl(cid: string): string {
  return buildIpfsGatewayUrl(env.PINATA_GATEWAY, cid);
}

async function uploadToPinata(input: {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
  storageNamespace: string;
  tokenSymbol: string;
}): Promise<StoredTelegramLogo> {
  if (!env.PINATA_JWT) {
    throw new Error("PINATA_JWT_NOT_CONFIGURED");
  }

  const formData = new FormData();
  const fileBytes = new Uint8Array(input.bytes.byteLength);
  fileBytes.set(input.bytes);
  formData.append(
    "file",
    new File([fileBytes.buffer], input.fileName, { type: input.mimeType }),
  );
  formData.append("network", "public");
  formData.append("name", `telepons/${input.storageNamespace}/${input.fileName}`);
  const normalizedSymbol =
    input.tokenSymbol.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) ||
    "TOKEN";
  const serializedApp = `${normalizedSymbol}-${randomBytes(6).toString("hex")}`;
  formData.append(
    "keyvalues",
    JSON.stringify({
      app: serializedApp,
      namespace: input.storageNamespace,
    }),
  );

  const response = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.PINATA_JWT}`,
    },
    body: formData,
    signal: AbortSignal.timeout(30_000),
  });
  const responseBody = await response.text();
  let payload: PinataUploadResponse = {};
  try {
    payload = JSON.parse(responseBody) as PinataUploadResponse;
  } catch {
    // The status and sanitized response excerpt below still provide an
    // actionable error when an upstream proxy returns a non-JSON body.
  }
  const pinataFileId = payload.data?.id;
  const cid = payload.data?.cid;

  if (!response.ok || !pinataFileId || !cid) {
    const pinataMessage =
      payload.error?.message?.replaceAll(/\s+/g, " ").slice(0, 240) ||
      responseBody.replaceAll(/\s+/g, " ").slice(0, 240) ||
      "UNKNOWN_PINATA_ERROR";
    throw new Error(
      `PINATA_UPLOAD_FAILED_${response.status}: ${pinataMessage}`,
    );
  }

  return {
    storageKey: `ipfs/${cid}`,
    publicUrl: pinataGatewayUrl(cid),
    mimeType: input.mimeType,
    pinataFileId,
    cid,
  };
}

export async function downloadAndStoreTelegramLogo(input: {
  botToken: string;
  telegramFilePath: string;
  storageNamespace: string;
  tokenSymbol: string;
}): Promise<StoredTelegramLogo> {
  const downloadUrl =
    `https://api.telegram.org/file/bot${input.botToken}/` +
    input.telegramFilePath;
  const response = await fetch(downloadUrl, {
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`TELEGRAM_FILE_DOWNLOAD_FAILED_${response.status}`);
  }

  const declaredSize = Number(response.headers.get("content-length") ?? "0");
  if (declaredSize > maxLogoBytes) {
    throw new Error("LOGO_TOO_LARGE");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxLogoBytes) {
    throw new Error("LOGO_TOO_LARGE");
  }

  const image = detectSupportedImage(bytes);
  if (!image) {
    throw new Error("UNSUPPORTED_LOGO_FORMAT");
  }

  const fileName = `${randomBytes(20).toString("hex")}.${image.extension}`;
  return uploadToPinata({
    bytes,
    fileName,
    mimeType: image.mimeType,
    storageNamespace: input.storageNamespace,
    tokenSymbol: input.tokenSymbol,
  });
}
