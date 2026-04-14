import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Nav } from "./nav";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vesu Analytics",
  description: "Analytics dashboard for Vesu lending protocol on Starknet",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-50 text-gray-800">
        <header className="border-b border-gray-200 bg-white">
          <div className="max-w-[1400px] mx-auto px-8 py-4 flex items-center justify-between">
            <Link href="/" className="text-lg font-semibold tracking-tight text-gray-900 hover:text-[#2C41F6] transition-colors">
              Vesu Analytics
            </Link>
            <Nav />
          </div>
        </header>
        <main className="flex-1">
          <Providers>{children}</Providers>
        </main>
      </body>
    </html>
  );
}
