import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/navigation/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Autoumyváreň Zemplín",
  description: "Rezervačný systém autoumyvárne",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sk">
      <body className="min-h-dvh antialiased">
        <AppShell>{children}</AppShell>
        <Toaster />
      </body>
    </html>
  );
}
