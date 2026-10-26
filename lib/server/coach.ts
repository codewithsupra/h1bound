import "server-only";
import { generateText } from "ai";
import { smartModel } from "@/lib/ai/models";
import type { ProfileDetails } from "./profile";
import type { Contact } from "./hunter";

/** Long-form generators behind the review + Pro tools. All grounded only in the user's own resume. */

type Job = { title: string; company: string; location: string; description: string };

const jobBlock = (j: Job) => `JOB: ${j.title} at ${j.company} (${j.location})\n${j.description.slice(0, 6000)}`;
const meBlock = (d: ProfileDetails) => `CANDIDATE RESUME:\n${d.resumeText.slice(0, 12000)}`;

const RULES = `Rules: never invent experience, numbers, employers or skills the resume doesn't show. If something is missing, say what to add and how, don't fake it. Be specific to THIS job. Plain text with short headings and bullets, no markdown tables. Warm, direct, like a friend who works in tech recruiting.`;

async function run(system: string, prompt: string, maxOutputTokens = 1400) {
  const { text } = await generateText({ model: smartModel(), system: `${system}\n${RULES}`, prompt, maxOutputTokens });
  return text.trim();
}

export function reviewResume(d: ProfileDetails, j: Job, round: number) {
  return run(
    "You review a resume against one job posting for an international student.",
    `${jobBlock(j)}\n\n${meBlock(d)}\n\nThis is review round ${round} for this job. Give: 1) fit score /10 with one-line why, 2) top 3 gaps vs the posting, 3) 3-5 bullet rewrites (before → after) using the candidate's real work, 4) ATS keywords from the posting that are missing.`,
  );
}

export function tailorResume(d: ProfileDetails, j: Job) {
  return run(
    "You tailor a resume to one job.",
    `${jobBlock(j)}\n\n${meBlock(d)}\n\nGive: a 2-line summary for the top of the resume, which experiences/projects to move up or cut, 5 rewritten bullets mirroring the posting's language, and a skills line ordered for this job.`,
  );
}

export function interviewPlan(d: ProfileDetails, j: Job) {
  return run(
    "You build a focused interview prep plan.",
    `${jobBlock(j)}\n\n${meBlock(d)}\n\nGive: the likely interview loop for this kind of role and company, a 7-day prep plan (one line per day), 5 technical topics to drill with why, 4 behavioral stories the candidate should prepare from THEIR resume (name the project), 3 smart questions to ask the interviewer, and how to answer "Will you now or in the future require sponsorship?" honestly and confidently.`,
    1800,
  );
}

export function coldEmail(d: ProfileDetails, j: Job, contact: Contact | null) {
  const to = contact ? `${contact.name}${contact.title ? `, ${contact.title}` : ""}` : "the hiring manager (name unknown: use a placeholder like [First name])";
  return run(
    "You write short cold emails that get replies from busy engineering leaders.",
    `${jobBlock(j)}\n\n${meBlock(d)}\n\nWrite a cold email to ${to}. Format:\nSubject: <max 8 words, specific>\n\n<body: max 120 words. Hook tied to something real about the company/team from the posting, one proof point from the resume with a number if the resume has one, a clear ask for a 15-min chat, sign off with the candidate's first name>\n\nThen write "Follow-up (send after 5 business days):" with a 50-word follow-up. Do not mention visas or sponsorship in the cold email.`,
    900,
  );
}
