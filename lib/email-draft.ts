/**
 * Cold-email drafts and the RFC 2822 messages we hand to Gmail. Pure and client-safe; the user
 * reviews and edits every field before anything is sent.
 */

export type Draft = { subject: string; body: string; followUp: string | null };

/** Splits coach.coldEmail output ("Subject: …\n\n<body>\n\nFollow-up (…):\n<text>") into fields. */
export function parseDraft(text: string): Draft {
  const t = text.replace(/\r\n/g, "\n").trim();
  const subject = t.match(/^\s*subject:\s*(.+)$/im)?.[1].trim() ?? "";
  const afterSubject = subject ? t.slice(t.search(/^\s*subject:.*$/im)).replace(/^\s*subject:.*\n?/i, "") : t;
  const fu = afterSubject.search(/^\s*follow-?up\b.*:\s*$/im);
  const body = (fu >= 0 ? afterSubject.slice(0, fu) : afterSubject).trim();
  const followUp = fu >= 0 ? afterSubject.slice(fu).replace(/^\s*follow-?up\b.*:\s*\n?/i, "").trim() || null : null;
  return { subject: subject.replace(/^["']|["']$/g, ""), body, followUp };
}

const EMAIL = /^[^\s@<>(),;:"\\[\]]+@[^\s@<>(),;:"\\[\]]+\.[a-z]{2,}$/i;
export const isEmail = (s: string) => EMAIL.test(s.trim());

/** Header values can't carry line breaks, or a subject could smuggle in extra headers (e.g. Bcc). */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/** RFC 2047 encoded-word for non-ASCII subjects and names. */
function encodeHeader(s: string): string {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

export type Mime = { from: string; fromName?: string | null; to: string; subject: string; body: string; inReplyTo?: string | null };

/** Builds the message and returns it base64url-encoded, as Gmail's send API wants it. Throws on bad addresses. */
export function buildMime(m: Mime): string {
  if (!isEmail(m.to) || !isEmail(m.from)) throw new Error("invalid email address");
  const subject = oneLine(m.subject);
  if (!subject || !m.body.trim()) throw new Error("subject and body are required");
  const from = m.fromName ? `${encodeHeader(oneLine(m.fromName).replace(/"/g, ""))} <${m.from.trim()}>` : m.from.trim();
  const headers = [
    `From: ${from}`,
    `To: ${m.to.trim()}`,
    `Subject: ${encodeHeader(subject)}`,
    ...(m.inReplyTo ? [`In-Reply-To: ${oneLine(m.inReplyTo)}`, `References: ${oneLine(m.inReplyTo)}`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];
  const raw = `${headers.join("\r\n")}\r\n\r\n${Buffer.from(m.body.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64")}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}
