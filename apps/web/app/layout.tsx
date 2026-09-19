import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Subs-Guard",
  description: "Track, understand, and cancel your recurring subscriptions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
