import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const imageUrl = `${protocol}://${host}/og.png`;
  const title = "歩歴（ほれき）｜歩いた街が、あなたの地図になる";
  const description = "GPSで街歩きを記録し、過去の軌跡や近くの歴史・文化スポットを楽しむ街歩き記録アプリ。";

  return {
    title,
    description,
    manifest: "/manifest.webmanifest",
    themeColor: "#252525",
    appleWebApp: {
      capable: true,
      title: "歩歴",
      statusBarStyle: "black-translucent",
    },
    openGraph: {
      type: "website",
      locale: "ja_JP",
      title,
      description,
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "歩歴 — 歩いた街が、あなたの地図になる。" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
