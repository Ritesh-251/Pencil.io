import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthBootstrap } from "@/components/auth/AuthBootstrap";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "Pencil.io",
  description: "Realtime collaborative canvas workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {/* Silently restores access token from httpOnly cookie on every page load */}
        <AuthBootstrap />
        {children}
      </body>
    </html>
  );
}
