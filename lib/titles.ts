/**
 * Groups free-text job titles into families so "Software Engineer II", "SDE" and "Backend Developer"
 * count together when we say "this employer filed 14 H-1Bs for roles like this". Order matters:
 * the first matching rule wins, so specific families come before broad ones.
 */

export const TITLE_FAMILIES = [
  "ml_engineer",
  "data_scientist",
  "data_engineer",
  "data_analyst",
  "devops",
  "security",
  "qa",
  "mobile",
  "frontend",
  "software_engineer",
  "hardware",
  "product_manager",
  "designer",
  "business_analyst",
  "finance",
  "consulting",
  "research",
  "healthcare",
  "other",
] as const;
export type TitleFamily = (typeof TITLE_FAMILIES)[number];

/** Plural, human labels for public pages ("Software engineers"). */
export const FAMILY_LABEL: Record<TitleFamily, string> = {
  ml_engineer: "ML engineers",
  data_scientist: "Data scientists",
  data_engineer: "Data engineers",
  data_analyst: "Data analysts",
  devops: "DevOps and cloud engineers",
  security: "Security engineers",
  qa: "QA and test engineers",
  mobile: "Mobile engineers",
  frontend: "Frontend engineers",
  software_engineer: "Software engineers",
  hardware: "Hardware engineers",
  product_manager: "Product and program managers",
  designer: "Designers",
  business_analyst: "Business analysts",
  finance: "Finance and accounting",
  consulting: "Consultants",
  research: "Researchers and academics",
  healthcare: "Healthcare",
  other: "Other roles",
};

const RULES: [TitleFamily, RegExp][] = [
  ["ml_engineer", /\b(machine learning|ml|ai|deep learning|computer vision|nlp|llm)\b.*\b(engineer|developer|scientist)\b|\bmle\b/],
  ["data_scientist", /\bdata scien|\bapplied scien|\bresearch scientist.*(data|ml)/],
  ["data_engineer", /\b(data|etl|big data|analytics) (engineer|developer|architect)|\bdatabase (engineer|developer|administrator)|\bdba\b/],
  ["data_analyst", /\b(data|reporting|bi|business intelligence|analytics) analyst|\banalytics (manager|lead)\b/],
  ["devops", /\b(devops|site reliability|sre|cloud|platform|infrastructure|systems?) (engineer|architect|administrator|developer)|\bsre\b|\bdevops\b/],
  ["security", /\b(security|cyber|infosec|information security)\b/],
  ["qa", /\b(qa|quality assurance|test|testing|sdet|automation test)\b/],
  ["mobile", /\b(ios|android|mobile)\b/],
  ["frontend", /\b(front ?end|ui) (engineer|developer)|\breact (engineer|developer)|\bweb developer/],
  ["software_engineer", /\b(software|backend|back end|full ?stack|application|java|python|\.net|net|golang|c\+\+|programmer|sde|swe)\b|\b(developer|programmer analyst|computer programmer)\b|\bengineer (i|ii|iii|1|2|3)\b|\bmember of technical staff\b/],
  ["hardware", /\b(hardware|asic|fpga|rtl|vlsi|silicon|electrical|embedded|firmware|semiconductor|design verification)\b/],
  ["product_manager", /\bproduct (manager|owner|lead)|\bprogram manager|\btechnical program/],
  ["designer", /\b(designer|ux|ui\/ux|user experience)\b/],
  ["business_analyst", /\b(business|systems|it|functional|technical|operations) analyst\b|\banalyst\b/],
  ["finance", /\b(accountant|accounting|auditor|audit|financial|finance|actuar|quant|tax)\b/],
  ["consulting", /\b(consultant|consulting|advisory)\b/],
  ["research", /\b(research|postdoc|post doc|scientist|professor|lecturer|faculty)\b/],
  ["healthcare", /\b(physician|nurse|therapist|pharmac|medical|clinical|resident|hospitalist)\b/],
];

export function titleFamily(title: string): TitleFamily {
  const t = ` ${title.toLowerCase().replace(/[^a-z0-9+./ ]+/g, " ").replace(/\s+/g, " ")} `;
  for (const [fam, re] of RULES) if (re.test(t)) return fam;
  return "other";
}

/** "Senior", "Staff", "Principal", "Lead", "Manager", "Director" → not a new-grad role. */
export function isSeniorTitle(title: string): boolean {
  return /\b(senior|sr\.?|staff|principal|lead|manager|director|head of|vp|vice president|architect|distinguished|iii|iv|\b3\b)\b/i.test(title);
}

export function isEntryTitle(title: string): boolean {
  return /\b(new grad|graduate|entry|junior|jr\.?|associate|intern|early career|university|campus|i|1)\b/i.test(title) && !isSeniorTitle(title);
}

export function isInternTitle(title: string): boolean {
  return /\b(intern|internship|co-?op|apprentice)\b/i.test(title);
}
