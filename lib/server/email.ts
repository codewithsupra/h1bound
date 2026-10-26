import "server-only";

/** Transactional email via Resend's REST API. No key → no-op, so dev and previews never email anyone. */
export async function sendEmail(to: string, subject: string, text: string, unsubscribeUrl: string, oneClickUrl: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM; // e.g. "Maya at H1Bound <maya@h1bound.com>" on a verified domain
  if (!key || !from) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to, subject, text,
      headers: { "List-Unsubscribe": `<${oneClickUrl}>, <${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  return res.ok;
}
