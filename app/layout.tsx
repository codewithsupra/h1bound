import type { Metadata } from "next";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { IBM_Plex_Mono, Public_Sans, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

const display = Schibsted_Grotesk({ variable: "--font-display", subsets: ["latin"] });
const flap = IBM_Plex_Mono({ variable: "--font-flap", subsets: ["latin"], weight: ["500"] });
const body = Public_Sans({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${SITE_NAME}: jobs at companies that can sponsor your visa`,
  description:
    "Chat with Maya, an AI job buddy for international students. Upload your CV and get matched to jobs in the UK, the Netherlands, Ireland and remote roles, at employers on the official visa sponsor registers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${flap.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
