"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { answerQuestion, saveCase } from "@/app/(app)/actions";
import { caseStrength } from "@/lib/pipeline";
import { MARKET_NAME, MARKETS, SALARY_FLOORS, workRights, type Market, type VisaSituation, type WorkRight } from "@/lib/visa";
import { FAMILY_LABEL, TITLE_FAMILIES } from "@/lib/titles";
import { useMaya } from "./maya-context";
import { Card, Chip, input, Row } from "./ui";

type Links = { github: string; portfolio: string; linkedin: string; other: string };
export type CaseData = {
  name: string; headline: string; pitch: string; links: Links; graduation: string; hasResume: boolean;
  experience: { company: string; title: string; highlights: string[] }[]; projects: { name: string; summary: string }[]; education: string[]; skills: string[];
  questions: { id: string; q: string }[]; answered: { id: string; q: string; answer: string }[];
  citizenship: string; visaCountry: string; visaSituation: string; visaEndsOn: string;
  targetCountries: string[]; targetFamilies: string[]; wantsRemote: string; locations: string[]; yearsExperience: number;
};

// Common home countries of international students in the UK, NL and IE, then the EU/EEA.
const CITIZENSHIPS = [
  "IN", "CN", "NG", "PK", "BD", "NP", "LK", "GH", "KE", "EG", "ZA", "VN", "ID", "PH", "MY", "TH", "KR", "JP", "TW", "HK", "SG", "IR", "TR", "SA", "AE", "OM",
  "BR", "MX", "CO", "AR", "CL", "US", "CA", "AU", "NZ", "UA", "RU", "GB", "IE", "NL", "DE", "FR", "ES", "IT", "PT", "PL", "GR", "RO", "BE", "SE", "AT", "CH", "NO",
];
const regionName = (() => { try { const n = new Intl.DisplayNames(["en"], { type: "region" }); return (c: string) => n.of(c) ?? c; } catch { return (c: string) => c; } })();
const RIGHT_LABEL: Record<WorkRight, { text: string; cls: string }> = {
  free: { text: "No visa needed", cls: "text-green border-green/40" },
  post_study: { text: "Post-study visa", cls: "text-sodium border-sodium/40" },
  sponsor: { text: "Needs a sponsor", cls: "text-mist border-haze" },
};
const SITUATION: Record<string, string> = { student: "Studying there now", graduate: "On a post-study visa", sponsored: "On a work visa now", none: "None of these" };
const REMOTE: Record<string, string> = { any: "Any", remote: "Remote only", hybrid: "Hybrid", onsite: "On-site" };

export function CaseView({ data, email }: { data: CaseData; email: string }) {
  const router = useRouter();
  const maya = useMaya();
  const [d, setD] = useState(data);
  const set = <K extends keyof CaseData>(k: K, v: CaseData[K]) => setD((x) => ({ ...x, [k]: v }));
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState<string | null>(null);

  const strength = caseStrength({
    resume: d.hasResume, citizenship: data.citizenship || null, visaSituation: data.visaSituation || null, visaEndsOn: data.visaEndsOn || null,
    links: Object.values(data.links).filter(Boolean).length, pitch: data.pitch || null, targetCountries: data.targetCountries.length,
  });
  const rights = workRights({ citizenship: d.citizenship || null, visaCountry: d.visaCountry || null, visaSituation: (d.visaSituation || null) as VisaSituation | null });
  const save = async (p: Parameters<typeof saveCase>[0]) => { const r = await saveCase(p); if (r.ok) router.refresh(); return r; };

  async function reread(file: File) {
    setReading(`Reading ${file.name}…`);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/resume", { method: "POST", body: fd });
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    setReading(res.ok ? "Done. Maya re-read your CV." : body.message ?? "That didn't work. Try a PDF or DOCX under 5 MB.");
    if (res.ok) router.refresh();
  }

  return (
    <div className="mx-auto max-w-[72rem] px-4 py-6 sm:px-8 sm:py-8">
      <h1 className="font-display text-3xl font-bold tracking-tight">Your case</h1>
      <p className="mt-1 max-w-xl text-sm text-mist">What Maya knows about you and argues in every match and email. The sharper this is, the more replies you get.</p>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card title={data.name || "Your name"} sub={data.headline || email} edit onSave={() => save({ name: d.name, headline: d.headline, graduation: d.graduation || null })}>
            {(editing) => editing ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-mist">Name<input className={`${input} mt-1`} value={d.name} onChange={(e) => set("name", e.target.value)} /></label>
                <label className="text-sm text-mist">Graduation<input type="month" className={`${input} mt-1`} value={d.graduation} onChange={(e) => set("graduation", e.target.value)} /></label>
                <label className="text-sm text-mist sm:col-span-2">Headline<input className={`${input} mt-1`} value={d.headline} maxLength={160} onChange={(e) => set("headline", e.target.value)} placeholder="MSc Data Science, UvA · Python, SQL, dbt" /></label>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                {data.education.length > 0 && <p className="text-mist">{data.education.join(" · ")}</p>}
                {data.graduation && <p><span className="text-mist">Graduating </span>{new Date(`${data.graduation}-01`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</p>}
                <div className="flex flex-wrap items-center gap-3 border-t border-haze pt-3">
                  <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void reread(f); }} />
                  <button onClick={() => fileRef.current?.click()} className="btn-ghost !px-4 !py-1.5 text-sm">{data.hasResume ? "Re-read my CV" : "Upload my CV"}</button>
                  <span className="text-xs text-mist">{reading ?? "We keep the text Maya reads, encrypted. The file itself is never stored."}</span>
                </div>
              </div>
            )}
          </Card>

          <Card id="rights" title="Where you can work" sub="Decides which employers can legally hire you. Not legal advice: check with your university." edit
            onSave={() => save({ citizenship: d.citizenship || null, visaCountry: d.visaCountry || null, visaSituation: d.visaSituation || null, visaEndsOn: d.visaEndsOn || null })}>
            {(editing) => (
              <>
                {editing ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm text-mist">Citizenship
                      <select className={`${input} mt-1`} value={d.citizenship} onChange={(e) => set("citizenship", e.target.value)}>
                        <option value="">Choose…</option>
                        {CITIZENSHIPS.map((c) => <option key={c} value={c}>{regionName(c)}</option>)}
                      </select>
                    </label>
                    <label className="text-sm text-mist">Visa you hold now
                      <select className={`${input} mt-1`} value={d.visaCountry} onChange={(e) => set("visaCountry", e.target.value)}>
                        <option value="">None in these countries</option>
                        {(["GB", "NL", "IE", "US"] as const).map((c) => <option key={c} value={c}>{c === "US" ? "United States" : MARKET_NAME[c]}</option>)}
                      </select>
                    </label>
                    <label className="text-sm text-mist">Your situation
                      <select className={`${input} mt-1`} value={d.visaSituation} onChange={(e) => set("visaSituation", e.target.value)}>
                        <option value="">Choose…</option>
                        {Object.entries(SITUATION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    </label>
                    <label className="text-sm text-mist">Visa ends on
                      <input type="date" className={`${input} mt-1`} value={d.visaEndsOn} onChange={(e) => set("visaEndsOn", e.target.value)} />
                    </label>
                  </div>
                ) : (
                  <div>
                    <Row label="Citizenship">{data.citizenship ? regionName(data.citizenship) : <span className="text-mist">Not set</span>}</Row>
                    <Row label="Visa now">{data.visaCountry ? `${data.visaCountry === "US" ? "United States" : MARKET_NAME[data.visaCountry as Market]} · ${SITUATION[data.visaSituation] ?? ""}` : <span className="text-mist">{SITUATION[data.visaSituation] ?? "Not set"}</span>}</Row>
                    <Row label="Visa ends">{data.visaEndsOn ? new Date(`${data.visaEndsOn}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : <span className="text-mist">Not set: starts your visa clock</span>}</Row>
                  </div>
                )}
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {MARKETS.map((m) => (
                    <div key={m} className={`rounded-2xl border p-3 ${RIGHT_LABEL[rights[m]].cls}`}>
                      <p className="text-xs text-mist">{MARKET_NAME[m]}</p>
                      <p className="mt-0.5 text-sm font-semibold">{RIGHT_LABEL[rights[m]].text}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-mist">
                  Sponsored roles must meet a salary floor: UK Skilled Worker £{SALARY_FLOORS.GB.newEntrant.toLocaleString("en-GB")} for new entrants (<a className="underline" href={SALARY_FLOORS.GB.source} target="_blank" rel="noopener noreferrer">gov.uk</a>), Dutch recent-graduate rate €{SALARY_FLOORS.NL.recentGraduate.toLocaleString("en-GB")} a month (<a className="underline" href={SALARY_FLOORS.NL.source} target="_blank" rel="noopener noreferrer">IND</a>).
                </p>
              </>
            )}
          </Card>

          <Card title="What you're after" sub="Maya searches for this and skips the rest." edit
            onSave={() => save({ targetCountries: d.targetCountries, targetFamilies: d.targetFamilies, wantsRemote: d.wantsRemote, locations: d.locations, yearsExperience: d.yearsExperience })}>
            {(editing) => editing ? (
              <div className="space-y-4">
                <div><p className="text-sm text-mist">Countries</p><div className="mt-1.5 flex flex-wrap gap-2">{MARKETS.map((m) => <Chip key={m} on={d.targetCountries.includes(m)} onClick={() => set("targetCountries", d.targetCountries.includes(m) ? d.targetCountries.filter((x) => x !== m) : [...d.targetCountries, m])}>{MARKET_NAME[m]}</Chip>)}</div></div>
                <div><p className="text-sm text-mist">Roles (up to 4)</p><div className="mt-1.5 flex flex-wrap gap-2">{TITLE_FAMILIES.filter((f) => f !== "other").map((f) => <Chip key={f} on={d.targetFamilies.includes(f)} onClick={() => set("targetFamilies", d.targetFamilies.includes(f) ? d.targetFamilies.filter((x) => x !== f) : [...d.targetFamilies, f].slice(-4))}>{FAMILY_LABEL[f]}</Chip>)}</div></div>
                <div><p className="text-sm text-mist">Work style</p><div className="mt-1.5 flex flex-wrap gap-2">{Object.entries(REMOTE).map(([k, v]) => <Chip key={k} on={d.wantsRemote === k} onClick={() => set("wantsRemote", k)}>{v}</Chip>)}</div></div>
                <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
                  <label className="text-sm text-mist">Cities, comma separated<input className={`${input} mt-1`} value={d.locations.join(", ")} onChange={(e) => set("locations", e.target.value.split(","))} placeholder="London, Amsterdam, Dublin" /></label>
                  <label className="text-sm text-mist">Years of experience<input type="number" min={0} max={60} className={`${input} mt-1`} value={d.yearsExperience} onChange={(e) => set("yearsExperience", Number(e.target.value))} /></label>
                </div>
              </div>
            ) : (
              <div>
                <Row label="Countries">{data.targetCountries.length ? <span className="flex flex-wrap gap-1.5">{data.targetCountries.map((c) => <Chip key={c} on>{MARKET_NAME[c as Market] ?? c}</Chip>)}</span> : <span className="text-mist">Not set</span>}</Row>
                <Row label="Roles">{data.targetFamilies.length ? <span className="flex flex-wrap gap-1.5">{data.targetFamilies.map((f) => <Chip key={f} on>{FAMILY_LABEL[f as keyof typeof FAMILY_LABEL] ?? f}</Chip>)}</span> : <span className="text-mist">From your CV</span>}</Row>
                <Row label="Work style">{REMOTE[data.wantsRemote] ?? "Any"}</Row>
                <Row label="Cities">{data.locations.length ? data.locations.join(", ") : <span className="text-mist">Anywhere in your countries</span>}</Row>
                <Row label="Experience">{data.yearsExperience ? `${data.yearsExperience} year${data.yearsExperience === 1 ? "" : "s"}` : "Graduate / entry level"}</Row>
              </div>
            )}
          </Card>

          <Card title="How you introduce yourself" sub="Your pitch opens every email; your links go under the sign-off." edit onSave={() => save({ pitch: d.pitch, links: d.links })}>
            {(editing) => editing ? (
              <div className="space-y-3">
                <label className="block text-sm text-mist">One-line pitch <span className="text-xs">({d.pitch.length}/240)</span>
                  <textarea rows={2} maxLength={240} className={`${input} mt-1 h-auto py-2`} value={d.pitch} onChange={(e) => set("pitch", e.target.value)} placeholder="Data engineer who cut a 6-hour pipeline to 20 minutes at my internship; graduating from TU Delft in June." />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["github", "portfolio", "linkedin", "other"] as const).map((k) => (
                    <label key={k} className="text-sm capitalize text-mist">{k === "linkedin" ? "LinkedIn" : k === "github" ? "GitHub" : k}
                      <input className={`${input} mt-1`} inputMode="url" value={d.links[k]} onChange={(e) => set("links", { ...d.links, [k]: e.target.value })} placeholder="https://" />
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <p className={`text-[0.95rem] leading-relaxed ${data.pitch ? "" : "text-mist"}`}>{data.pitch || "No pitch yet. One specific sentence about what you've built beats a list of adjectives."}</p>
                {Object.values(data.links).some(Boolean) && (
                  <div className="mt-3 flex flex-wrap gap-2">{Object.entries(data.links).filter(([, v]) => v).map(([k, v]) => <a key={k} href={v} target="_blank" rel="noopener noreferrer" className="rounded-full border border-haze px-3 py-1 text-sm text-mist hover:text-moon">{new URL(v).hostname.replace(/^www\./, "")} ↗</a>)}</div>
                )}
                {!data.pitch && <button onClick={() => maya.ask("Help me write a one-line pitch for my cold emails, from my CV.")} className="btn-ghost mt-3 !px-4 !py-1.5 text-sm">Write it with Maya</button>}
              </div>
            )}
          </Card>

          {(data.experience.length > 0 || data.projects.length > 0) && (
            <Card title="Proof Maya uses" sub="Read from your CV. Re-read your CV to change these.">
              <div className="space-y-4">
                {data.experience.map((e, i) => (
                  <div key={i}>
                    <p className="text-sm"><span className="font-semibold">{e.title}</span> <span className="text-mist">at {e.company}</span></p>
                    {e.highlights.length > 0 && <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-mist">{e.highlights.map((h, j) => <li key={j}>{h}</li>)}</ul>}
                  </div>
                ))}
                {data.projects.length > 0 && (
                  <div className="grid gap-2 sm:grid-cols-2">{data.projects.map((p, i) => <div key={i} className="rounded-xl border border-haze p-3"><p className="text-sm font-semibold">{p.name}</p><p className="mt-0.5 text-sm text-mist">{p.summary}</p></div>)}</div>
                )}
                {data.skills.length > 0 && <p className="text-sm text-mist"><span className="text-moon">Skills: </span>{data.skills.slice(0, 30).join(", ")}</p>}
              </div>
            </Card>
          )}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
          <StrengthCard strength={strength} />
          <Questions questions={data.questions} answered={data.answered} />
        </aside>
      </div>
    </div>
  );
}

function StrengthCard({ strength }: { strength: ReturnType<typeof caseStrength> }) {
  const pct = Math.round((strength.done / strength.total) * 100);
  return (
    <section className="rounded-3xl border border-haze bg-night-2/40 p-5">
      <div className="flex items-center gap-3">
        <span className="relative grid h-14 w-14 place-items-center">
          <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90" aria-hidden>
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--haze)" strokeWidth="3" />
            <circle cx="18" cy="18" r="15.5" fill="none" stroke={pct === 100 ? "var(--green)" : "var(--sodium)"} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 97.4} 97.4`} />
          </svg>
          <span className="text-sm font-semibold">{strength.done}/{strength.total}</span>
        </span>
        <div>
          <h2 className="font-display font-semibold">How strong your case is</h2>
          <p className="text-xs text-mist">{pct === 100 ? "Everything Maya needs." : "Each item sharpens matches and emails."}</p>
        </div>
      </div>
      <ul className="mt-4 space-y-2.5">
        {strength.items.map((i) => (
          <li key={i.key} className="flex gap-2.5 text-sm">
            <span aria-hidden className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] ${i.done ? "bg-green text-night" : "border border-dashed border-mist/60"}`}>{i.done ? "✓" : ""}</span>
            <span><span className={i.done ? "text-mist line-through decoration-mist/40" : ""}>{i.label}</span>{!i.done && <span className="block text-xs text-mist">{i.hint}</span>}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Questions({ questions, answered }: { questions: { id: string; q: string }[]; answered: { id: string; q: string; answer: string }[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string[]>([]);
  // Answered and skipped questions drop off at once; the refresh confirms it.
  const left = questions.filter((x) => !done.includes(x.id));
  const q = left[0];
  if (!q && !answered.length) return null;
  const submit = (answer: string | null) => { const id = q.id; setDone((d) => [...d, id]); setText(""); start(async () => { await answerQuestion(id, answer); router.refresh(); }); };
  return (
    <section className="rounded-3xl border border-haze bg-night-2/40 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display font-semibold">Maya&apos;s questions</h2>
        {q && left.length > 1 && <span className="text-xs text-mist">{left.length} left</span>}
      </div>
      {q ? (
        <>
          <p className="mt-2 text-sm leading-relaxed">{q.q}</p>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Your answer" className={`${input} mt-3 h-auto py-2`} />
          <div className="mt-2 flex items-center gap-2">
            <button disabled={pending || !text.trim()} onClick={() => submit(text)} className="btn-light !px-4 !py-1.5 text-sm disabled:opacity-50">Save answer</button>
            <button disabled={pending} onClick={() => submit(null)} className="rounded-full px-3 py-1.5 text-sm text-mist hover:text-moon">Skip</button>
          </div>
        </>
      ) : (
        <p className="mt-2 text-sm text-mist">All answered. Maya uses these in your emails.</p>
      )}
      {answered.length > 0 && (
        <details className="mt-3 border-t border-haze pt-3">
          <summary className="cursor-pointer text-xs text-mist">Your answers ({answered.length})</summary>
          <ul className="mt-2 space-y-2">{answered.map((a) => <li key={a.id} className="text-xs"><p className="text-mist">{a.q}</p><p>{a.answer}</p></li>)}</ul>
        </details>
      )}
    </section>
  );
}
