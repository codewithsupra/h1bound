/** Landing page copy that is data-shaped (FAQ, comparison), kept in one place. */

export const FAQ: { q: string; a: string }[] = [
  {
    q: "Who is H1Bound for?",
    a: "International students and new grads in the US, especially on F-1 OPT or STEM OPT, who need an employer that will sponsor an H-1B. If you don't need sponsorship, Maya still works, but the sponsor data is the point.",
  },
  {
    q: "Does a match mean the company will sponsor me?",
    a: "No. A match means the employer filed certified H-1B labor applications with the US Dept. of Labor, often for your kind of role. That's strong evidence they sponsor, not a promise. Maya shows the numbers so you can judge, and never says \"will sponsor you\".",
  },
  {
    q: "Where does the sponsorship data come from?",
    a: "Public Labor Condition Application (LCA) disclosures from the US Dept. of Labor, FY2026. We count certified H-1B filings per employer and role, with median wages and the most recent filing date. Jobs come from employers' own public career boards and refresh every morning.",
  },
  {
    q: "Will Maya email employers for me?",
    a: "Never. On Pro, Maya finds the likely hiring manager and drafts a short email. You read it, change what you like, and send it from your own inbox. Nothing goes out in your name without you.",
  },
  {
    q: "How does the OPT clock work?",
    a: "F-1 OPT allows 90 days of unemployment; the STEM OPT extension adds 60, for 150 in total. Tell Maya how many days you've used and she keeps count and paces your search to the deadline. It's a planning aid, not legal advice: your DSO's count is the official one.",
  },
  {
    q: "What about the H-1B lottery?",
    a: "Most H-1Bs go through the March lottery. Cap-exempt employers, like universities and nonprofit research institutes, can file any time of year without it. Ask Maya for cap-exempt employers in your field when time is short.",
  },
  {
    q: "What does it cost?",
    a: "Free: 10 matched jobs with their sponsorship record, and resume reviews on 5 of them. Invite friends for 5 more jobs each. Pro is $12 a month (₹399 in India) and you can try it free for 7 days, no card.",
  },
  {
    q: "What happens to my resume?",
    a: "It's read once and turned into an encrypted profile; the file itself is never stored. Your chat is encrypted too. Delete everything from your account page in one step.",
  },
  {
    q: "Is Maya a person?",
    a: "No, Maya is an AI, and says so whenever you ask. She's built to talk like a friend in recruiting: short, specific, one question at a time.",
  },
  {
    q: "Can I try it without signing up?",
    a: "Yes. Open Maya, drop in your resume and see 5 matches without an account. Create a free account to keep the chat and get 5 more.",
  },
];

export type Cell = boolean | string;

export const COMPARISON: { label: string; us: Cell; boards: Cell; agents: Cell }[] = [
  { label: "Shows each employer's real H-1B filings", us: true, boards: false, agents: false },
  { label: "Hides postings that refuse sponsorship", us: true, boards: false, agents: "Some" },
  { label: "Knows your OPT deadline and paces to it", us: true, boards: false, agents: false },
  { label: "Finds the hiring manager and drafts the email", us: true, boards: false, agents: true },
  { label: "You send from your own inbox", us: true, boards: "n/a", agents: "Varies" },
  { label: "Free tier with real matches", us: "10 jobs", boards: true, agents: "Trial" },
  { label: "Priced for students in India", us: "₹399/mo", boards: "n/a", agents: false },
];
