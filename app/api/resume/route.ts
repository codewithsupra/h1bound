import { NextResponse } from "next/server";
import { ACCEPTED, fileToText, MAX_UPLOAD_BYTES, parseResume, toDetails } from "@/lib/server/resume";
import { getStore } from "@/lib/server/store";

export const maxDuration = 60;

/**
 * Resume / CV / transcript / biodata upload. The file is read in memory, parsed, and dropped:
 * only the encrypted structured profile is stored.
 */
export async function POST(req: Request) {
  const store = await getStore();
  if (!store) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "too_big", message: "Keep it under 5 MB." }, { status: 413 });
  const mime = file.type || (file.name.endsWith(".txt") ? "text/plain" : "");
  if (!ACCEPTED.includes(mime)) return NextResponse.json({ error: "bad_type", message: "PDF, DOCX or TXT please." }, { status: 415 });

  const text = (await fileToText(await file.arrayBuffer(), mime)).replace(/\s+\n/g, "\n").trim();
  if (text.length < 200) {
    return NextResponse.json({ error: "unreadable", message: "I couldn't read much text from that file. If it's a scan, try a text-based PDF or DOCX." }, { status: 422 });
  }

  const parsed = await parseResume(text);
  const prev = await store.loadProfile();
  await store.saveProfile({
    details: toDetails(parsed, text, prev?.details),
    skills: parsed.skills.slice(0, 40),
    years_experience: Math.max(0, Math.min(60, Math.floor(parsed.yearsExperience))),
    ...(prev?.row.target_families?.length ? {} : { target_families: parsed.targetFamilies }),
  });

  return NextResponse.json({
    ok: true,
    summary: {
      firstName: parsed.name?.split(" ")[0] ?? null,
      headline: parsed.headline,
      topSkills: parsed.skills.slice(0, 8),
      targetFamilies: parsed.targetFamilies,
      yearsExperience: parsed.yearsExperience,
      school: parsed.education[0]?.school ?? null,
    },
  });
}
