import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { extractText } from "unpdf";
import mammoth from "mammoth";
import { smartModel } from "@/lib/ai/models";
import { TITLE_FAMILIES } from "@/lib/titles";
import type { ProfileDetails } from "./profile";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ACCEPTED = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];

/** Text from a resume / CV / transcript / biodata. Runs in memory; the file is never stored. */
export async function fileToText(buf: ArrayBuffer, mime: string): Promise<string> {
  if (mime === "application/pdf") return (await extractText(new Uint8Array(buf), { mergePages: true })).text;
  if (mime.includes("wordprocessingml")) return (await mammoth.extractRawText({ buffer: Buffer.from(buf) })).value;
  return new TextDecoder().decode(buf);
}

const parsedSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  headline: z.string().nullable().describe("One line, e.g. 'MS CS @ ASU · backend + ML'"),
  education: z.array(z.object({ school: z.string(), degree: z.string(), field: z.string().nullable(), year: z.number().nullable(), gpa: z.string().nullable() })),
  experience: z.array(z.object({ company: z.string(), title: z.string(), start: z.string().nullable(), end: z.string().nullable(), highlights: z.array(z.string()).max(4) })),
  projects: z.array(z.object({ name: z.string(), summary: z.string() })).max(6),
  skills: z.array(z.string()).max(40).describe("Concrete tools, languages, frameworks; canonical names like 'Python', 'React', 'AWS'"),
  yearsExperience: z.number().describe("Full-time professional years only; internships count as 0.25 each; round down"),
  targetFamilies: z.array(z.enum(TITLE_FAMILIES)).max(3).describe("Best-fit role families for this person"),
  usEducated: z.boolean().describe("Has or is pursuing a US degree"),
});

export type ParsedResume = z.infer<typeof parsedSchema>;

export async function parseResume(text: string): Promise<ParsedResume> {
  const { output } = await generateText({
    model: smartModel(),
    output: Output.object({ schema: parsedSchema }),
    system:
      "You extract structured data from resumes, CVs, transcripts and biodata. Only use what the document says; never invent employers, dates or skills. If the document is a transcript, infer skills from courses.",
    prompt: text.slice(0, 30_000),
  });
  return output;
}

export function toDetails(p: ParsedResume, resumeText: string, prev?: ProfileDetails | null): ProfileDetails {
  return {
    name: p.name, email: p.email, phone: p.phone, headline: p.headline, education: p.education, experience: p.experience,
    projects: p.projects, optEndDate: prev?.optEndDate ?? null, resumeText: resumeText.slice(0, 30_000),
  };
}
