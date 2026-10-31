import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/insforge/server";
import { loadProfile } from "@/lib/server/profile";
import { SITE_NAME } from "@/lib/site";
import { CaseView } from "@/components/app/case-view";

export const metadata = { title: `Your case · ${SITE_NAME}` };

export default async function CasePage() {
  // Layouts and pages render in parallel, so each page checks the session itself.
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const p = await loadProfile(user.id);
  const d = p?.details ?? null;
  const r = p?.row ?? null;
  return (
    <CaseView
      email={user.email}
      data={{
        name: d?.name ?? user.name ?? "",
        headline: d?.headline ?? "",
        pitch: d?.pitch ?? "",
        links: { github: d?.links?.github ?? "", portfolio: d?.links?.portfolio ?? "", linkedin: d?.links?.linkedin ?? "", other: d?.links?.other ?? "" },
        graduation: d?.graduation ?? "",
        hasResume: Boolean(d?.resumeText),
        experience: (d?.experience ?? []).slice(0, 6).map((e) => ({ company: e.company, title: e.title, highlights: e.highlights })),
        projects: (d?.projects ?? []).slice(0, 6),
        education: (d?.education ?? []).slice(0, 3).map((e) => `${e.degree}${e.field ? ` in ${e.field}` : ""}, ${e.school}${e.year ? ` (${e.year})` : ""}`),
        skills: r?.skills ?? [],
        questions: (d?.questions ?? []).filter((q) => !q.answer && !q.skipped).map((q) => ({ id: q.id, q: q.q })),
        answered: (d?.questions ?? []).filter((q) => q.answer).map((q) => ({ id: q.id, q: q.q, answer: q.answer! })),
        citizenship: r?.citizenship ?? "",
        visaCountry: r?.visa_country ?? "",
        visaSituation: r?.visa_situation ?? "",
        visaEndsOn: r?.visa_ends_on ?? "",
        targetCountries: r?.target_countries ?? [],
        targetFamilies: r?.target_families ?? [],
        wantsRemote: r?.wants_remote ?? "any",
        locations: r?.locations ?? [],
        yearsExperience: r?.years_experience ?? 0,
      }}
    />
  );
}
