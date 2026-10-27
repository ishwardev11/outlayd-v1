import type { Metadata } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SmoothScrollProvider } from "@/components/SmoothScrollProvider";
import { Toaster } from "sonner";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Outlayd | Intelligent Expense Management & Procurement",
  description: "An expense tracking and AP automation tool for modern businesses.",
};

import { AuthHashRedirect } from "@/components/AuthHashRedirect";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          id="theme-initializer"
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('app-theme') || 'system';
                const d = document.documentElement;
                d.classList.remove('light', 'dark');
                if (theme === 'system') {
                  d.classList.add(window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
                } else {
                  d.classList.add(theme);
                }
                const fontSize = localStorage.getItem('app-font-size') || 'medium';
                if (fontSize === 'small') d.style.fontSize = '14px';
                else if (fontSize === 'large') d.style.fontSize = '18px';
                else d.style.fontSize = '16px';
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${plusJakarta.variable} antialiased`}
      >
        <ThemeProvider defaultTheme="system">
          <SmoothScrollProvider>
            <AuthHashRedirect />
            {children}
          </SmoothScrollProvider>
        </ThemeProvider>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
