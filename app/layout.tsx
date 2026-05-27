import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
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
      <body className="min-h-svh antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
