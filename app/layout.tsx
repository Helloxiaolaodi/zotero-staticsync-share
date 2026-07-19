import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "StaticSync Share",
  description: "A minimal public literature share page powered by Supabase.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
