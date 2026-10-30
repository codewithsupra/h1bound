/** Landing page copy that is data-shaped (FAQ, comparison), kept in one place. */
import { SITE_NAME } from "./site";

export const FAQ: { q: string; a: string }[] = [
  {
    q: `Who is ${SITE_NAME} for?`,
    a: "International students and recent graduates who want a job in the UK, the Netherlands or Ireland, or a remote role they can do from where they are. If you need a visa to work there, the sponsor checks are the point; if you don't, Maya still finds and ranks jobs for you.",
  },
  {
    q: "How do you know a company can sponsor me?",
    a: "From the governments themselves. The UK Home Office publishes its register of licensed sponsors, the Dutch IND publishes its register of recognised sponsors, and Ireland publishes every employment permit issued, by company. In the UK and the Netherlands an employer can only sponsor if it's on that list, so we hide its jobs from people who'd need a sponsor.",
  },
  {
    q: "Does a licence mean they'll sponsor me?",
    a: "No. It means they can. Whether they will depends on the role and the salary, so Maya also reads each posting and drops ones that rule out sponsorship. She never says \"will sponsor you\".",
  },
  {
    q: "I'm on a UK Graduate visa. Does this help me?",
    a: "Yes. You can start any UK job now, so Maya shows you everything, but puts licensed sponsors first: they're the ones who can switch you to a Skilled Worker visa before your Graduate visa ends.",
  },
  {
    q: "Will Maya email employers for me?",
    a: "Only when you say so. On Pro, Maya finds the hiring manager (or a founder at a small company) and drafts a short email. You read it, change what you like, and send it from your own Gmail with one tap. We can only send emails you approve; we can't read your inbox.",
  },
  {
    q: "Where do the culture and review summaries come from?",
    a: "Public sources: the company's own pages, news, forums and public review snippets, summarized with links so you can check them. We link to Glassdoor for employee ratings rather than copying them.",
  },
  {
    q: "What does it cost?",
    a: "Free: 10 matched jobs with their sponsor record, and CV reviews on 5 of them. Invite friends for 5 more jobs each. Pro is €10 a month ($12 outside Europe, ₹399 in India), and you can try it free for 7 days, no card.",
  },
  {
    q: "What happens to my CV?",
    a: "It's read once and turned into an encrypted profile; the file itself is never stored. Your chat is encrypted too. Delete everything from your account page in one step.",
  },
  {
    q: "Is Maya a person?",
    a: "No, Maya is an AI, and says so whenever you ask. She's built to talk like a friend in recruiting: short, specific, one question at a time.",
  },
  {
    q: "Can I try it without signing up?",
    a: "Yes. Open Maya, drop in your CV and see 5 matches without an account. Create a free account to keep the chat and get 5 more.",
  },
];

export type Cell = boolean | string;

export const COMPARISON: { label: string; us: Cell; boards: Cell; agents: Cell }[] = [
  { label: "Checks every employer against the official sponsor registers", us: true, boards: false, agents: false },
  { label: "Hides jobs you can't legally take", us: true, boards: false, agents: false },
  { label: "Knows your visa and where you can work freely", us: true, boards: false, agents: "Some" },
  { label: "Finds the hiring manager and drafts the email", us: true, boards: false, agents: true },
  { label: "Sends from your own Gmail, only when you approve", us: true, boards: "n/a", agents: "Varies" },
  { label: "Company culture summaries with sources", us: true, boards: "Some", agents: false },
  { label: "Free tier with real matches", us: "10 jobs", boards: true, agents: "Trial" },
  { label: "Priced for students in Europe and India", us: "€10 / ₹399", boards: "n/a", agents: false },
];
