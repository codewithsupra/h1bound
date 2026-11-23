/**
 * LinkedIn profile links, as the student pastes them. We store the link (it goes in their email
 * signature and on Your case) but never fetch or scrape the page: LinkedIn's terms forbid it. To read
 * their profile we ask for LinkedIn's own PDF export, which the CV reader handles. Pure.
 */
const PROFILE = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([A-Za-z0-9\-_%]{3,100})\/?(?:[?#].*)?$/i;

/** "linkedin.com/in/asha-rao?trk=x" -> "https://www.linkedin.com/in/asha-rao". Null if it isn't a profile link. */
export function normalizeLinkedIn(input: string | null | undefined): string | null {
  const m = (input ?? "").trim().match(PROFILE);
  return m ? `https://www.linkedin.com/in/${m[1]}` : null;
}

/** The first LinkedIn profile link in a message, if any. */
export function findLinkedIn(text: string): string | null {
  for (const w of text.split(/\s+/)) {
    const n = normalizeLinkedIn(w.replace(/[),.;!]+$/, ""));
    if (n) return n;
  }
  return null;
}

export const LINKEDIN_PDF_STEPS = "On LinkedIn, open your profile, tap Resources (or More), then Save to PDF. Drop that file in here with the 📎 button and I'll read it like a CV.";
