import type { Metadata, Viewport } from "next";
import { Playfair_Display, Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["700", "800"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const metadata: Metadata = {
  title: "오픈베이크",
  description: "베이커리 드롭(한정판매) 쇼핑몰",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "오픈베이크",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FAF7F2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${playfairDisplay.variable} ${inter.variable} ${jetbrainsMono.variable} min-h-dvh antialiased`}
    >
      <body className="min-h-dvh font-sans bg-background text-foreground">
        <div className="min-h-dvh w-full flex flex-col">
          <Providers>{children}</Providers>
        </div>
      </body>
    </html>
  );
}
