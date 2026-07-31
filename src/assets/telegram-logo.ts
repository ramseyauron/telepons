import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { env } from "@/config/env";

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
};

export async function downloadAndStoreTelegramLogo(input: {
  botToken: string;
  telegramFilePath: string;
  storageNamespace: string;
}): Promise<StoredTelegramLogo> {
  const downloadUrl =
    `https://api.telegram.org/file/bot${input.botToken}/` +
    input.telegramFilePath;
  const response = await fetch(downloadUrl);

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
  const storageKey = `token-logos/${input.storageNamespace}/${fileName}`;
  const publicDirectory = path.join(
    process.cwd(),
    "public",
    "uploads",
    "token-logos",
    input.storageNamespace,
  );

  await mkdir(publicDirectory, { recursive: true });
  await writeFile(path.join(publicDirectory, fileName), bytes, {
    flag: "wx",
  });

  return {
    storageKey,
    publicUrl: new URL(
      `/uploads/${storageKey}`,
      env.APP_BASE_URL,
    ).toString(),
    mimeType: image.mimeType,
  };
}
