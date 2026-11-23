/**
 * Side-by-side comparisons with other job-search tools, for people deciding between them. Every
 * statement about another product cites a public source and the date it was checked, says when a
 * number is that company's own claim, and says where they're the better choice. No logos.
 */
export type Row = { topic: string; us: string; them: string; source?: string };
export type Comparison = {
  slug: string; name: string; site: string; checkedOn: string;
  oneLine: string; chooseThem: string; chooseUs: string; rows: Row[]; sources: { label: string; url: string }[];
};

export const COMPARISONS: Comparison[] = [
  {
    slug: "backdoor",
    name: "Backdoor",
    site: "https://backdoorai.app",
    checkedOn: "2026-11-23",
    oneLine: "Backdoor is an AI agent you text on iMessage or WhatsApp that finds startups and emails their founders for you. Sponsorbound finds jobs at employers on the UK, Dutch and Irish visa sponsor registers and helps you reach the hiring manager.",
    chooseThem: "you want a startup job (mostly in the US or India), you'd rather do everything by text message, and sponsorship isn't the deciding factor.",
    chooseUs: "you need a visa to work in the UK, the Netherlands or Ireland, so the employer's sponsor licence, the salary floor and your visa end date decide which jobs are worth your time.",
    rows: [
      { topic: "Who it's for", us: "International students and graduates who need a visa sponsor in the UK, Netherlands or Ireland, plus remote roles open to them", them: "Anyone aiming for a pre-seed to Series C startup; it says it isn't for mass-applying to big companies", source: "https://backdoorai.app/#faq" },
      { topic: "Where jobs come from", us: "Employers' own job boards, matched to the official sponsor registers (147,000 entries) with a confirmed link", them: "Startups that just raised, launched or started hiring, found from funding news, launch sites and careers pages", source: "https://backdoorai.app/" },
      { topic: "Visa support", us: "Built around it: register proof on every job, a check of posted pay against the 2026 salary floors, a visa countdown, and employers new on the register", them: "A US mode for OPT, STEM OPT and H-1B; it says it can't promise sponsorship", source: "https://backdoorai.app/changelog" },
      { topic: "How you use it", us: "Web app, a daily or weekly email digest, and Telegram (draft and send from the chat)", them: "iMessage or WhatsApp, with a web dashboard", source: "https://backdoorai.app/" },
      { topic: "Emails to employers", us: "Drafted to the hiring manager from your CV; sent from your Gmail only when you approve", them: "Drafted to the founder; sent from your Gmail only when you approve", source: "https://backdoorai.app/#faq" },
      { topic: "Follow-ups", us: "One follow-up, approved with the first email, sent in the same thread after 4 days unless you mark a reply", them: "Follow-ups in the same thread until they reply; it reads your Gmail to spot replies", source: "https://backdoorai.app/research/founder-reply-rates" },
      { topic: "What it can see in Gmail", us: "Send-only permission: it can't read your inbox", them: "Sends approved emails and checks for founder replies", source: "https://backdoorai.app/#faq" },
      { topic: "Price", us: "", them: "Paid plans from $29 (monthly, quarterly or lifetime); chat, profile research and CV help are free", source: "https://backdoorai.app/#pricing" },
    ],
    sources: [
      { label: "Backdoor home page and FAQ", url: "https://backdoorai.app/" },
      { label: "Backdoor changelog", url: "https://backdoorai.app/changelog" },
      { label: "Backdoor reply-rate research", url: "https://backdoorai.app/research/founder-reply-rates" },
    ],
  },
  {
    slug: "jobright",
    name: "Jobright",
    site: "https://jobright.ai",
    checkedOn: "2026-11-23",
    oneLine: "Jobright is an AI job-search copilot for the US market: job matches, one-click application autofill, tailored CVs and insider referrals. Sponsorbound focuses on visa sponsorship in the UK, the Netherlands and Ireland.",
    chooseThem: "you're applying in the US and want to send a lot of applications quickly, with autofill and tailored CVs.",
    chooseUs: "you need a visa sponsor in the UK, the Netherlands or Ireland and want fewer, better-aimed applications with an email to the hiring manager.",
    rows: [
      { topic: "Who it's for", us: "International students and graduates who need a visa sponsor in the UK, Netherlands or Ireland", them: "Job seekers in the US", source: "https://jobright.ai/" },
      { topic: "Applying", us: "Fewer applications: a short email to the hiring manager, sent from your Gmail when you approve it", them: "One-click autofill across the major applicant tracking systems; it says you can apply to hundreds of jobs a day", source: "https://jobright.ai/" },
      { topic: "Visa support", us: "UK, Dutch and Irish sponsor registers on every job, a salary-floor check, a visa countdown", them: "An H-1B jobs page with US companies' sponsorship history", source: "https://jobright.ai/h1b-jobs" },
      { topic: "CV help", us: "CV review against each job and tailoring suggestions that use only your real experience", them: "A tailored CV for each job", source: "https://jobright.ai/" },
      { topic: "Contacts", us: "Finds the likely hiring manager and drafts the email", them: "Suggests alumni and hiring managers for referrals", source: "https://jobright.ai/" },
      { topic: "Price", us: "", them: "Not listed on its site; independent 2026 reviews report Turbo at $39.99 a month", source: "https://favtutor.com/jobright-ai-review/" },
    ],
    sources: [
      { label: "Jobright home page", url: "https://jobright.ai/" },
      { label: "Jobright H-1B jobs page", url: "https://jobright.ai/h1b-jobs" },
      { label: "FavTutor review (pricing screenshots, 2026)", url: "https://favtutor.com/jobright-ai-review/" },
    ],
  },
];

export const comparison = (slug: string) => COMPARISONS.find((c) => c.slug === slug) ?? null;

/** Our price line, true to whether paid checkout is live. */
export function ourPrice(paymentsLive: boolean): string {
  return paymentsLive
    ? "Free plan; Pro €10 a month in Europe and the UK ($12 elsewhere, ₹399 in India), with a 7-day free trial"
    : "Free plan, and a 7-day free trial of Pro. Paid plans (€10 a month in Europe and the UK) open soon";
}
