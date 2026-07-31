import type { Metadata } from "next";
import { AppKitProvider } from "./appkit-provider";
import "./styles.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.APP_BASE_URL ?? "http://localhost:3000",
  ),
  title: "Telepons — Launch from Telegram",
  description:
    "Turn a Telegram community into a verified token launch, wallet-signed execution, and live onchain intelligence.",
  openGraph: {
    title: "Telepons — Your community. Your launch terminal.",
    description:
      "Telegram-native token launches with owner-controlled wallet execution and onchain verification.",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Telepons — Your community. Your launch terminal.",
    description:
      "Telegram-native token launches with owner-controlled wallet execution and onchain verification.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/brand/telepons-mark.png",
    apple: "/brand/telepons-mark.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <AppKitProvider>{children}</AppKitProvider>
      </body>
    </html>
  );
}
