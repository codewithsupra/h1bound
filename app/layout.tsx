import type { Metadata } from "next";
import { IBM_Plex_Mono, Public_Sans, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const display = Schibsted_Grotesk({ variable: "--font-display", subsets: ["latin"] });
const flap = IBM_Plex_Mono({ variable: "--font-flap", subsets: ["latin"], weight: ["500"] });
const body = Public_Sans({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "H1Bound: jobs at companies that actually sponsor",
  description:
    "Chat with Maya, an AI job buddy for international students. Upload your resume and get matched to US jobs at employers with real H-1B filing history.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${flap.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
