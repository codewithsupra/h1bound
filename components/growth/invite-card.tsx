"use client";
import { SITE_NAME } from "@/lib/site";

import { useState } from "react";

const MESSAGE = `I'm using ${SITE_NAME} to find jobs in the UK, Netherlands and Ireland at companies on the official visa sponsor registers, plus remote roles. Free to try:`;

/** The user's own invite link, with copy and share buttons they tap themselves. */
export function InviteCard({ link, activated, maxFriends = 3, jobsPerFriend = 5, compact = false }: { link: string; activated?: number; maxFriends?: number; jobsPerFriend?: number; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const text = encodeURIComponent(`${MESSAGE} ${link}`);
  return (
    <div className={`rise rounded-2xl border border-haze bg-night-2/80 ${compact ? "p-4" : "p-6"}`}>
      <p className="font-display font-semibold">Invite friends, get {jobsPerFriend} more jobs each</p>
      <p className="mt-1 text-sm text-mist">
        When a friend signs up and uploads a resume, you get {jobsPerFriend} more free matches (up to {maxFriends} friends).
        {typeof activated === "number" && ` ${Math.min(activated, maxFriends)} of ${maxFriends} so far.`}
      </p>
      <div className="mt-3 flex min-w-0 items-center gap-2 rounded-full border border-haze bg-night/60 py-1 pl-4 pr-1">
        <span className="min-w-0 flex-1 truncate font-mono text-sm text-moon/90">{link.replace(/^https?:\/\//, "")}</span>
        <button type="button" onClick={() => navigator.clipboard.writeText(link).then(() => setCopied(true))} className="shrink-0 rounded-full bg-moon px-3 py-1.5 text-sm font-medium text-night">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <a href={`https://wa.me/?text=${text}`} target="_blank" rel="noopener noreferrer" className="btn-ghost !px-3 !py-1.5">Share on WhatsApp</a>
        <a href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(MESSAGE)}`} target="_blank" rel="noopener noreferrer" className="btn-ghost !px-3 !py-1.5">Telegram</a>
      </div>
    </div>
  );
}
