import { NextResponse, type NextRequest } from "next/server";
import { createAdminInsForge } from "@/lib/insforge/admin";
import { loadOps } from "@/lib/ops-data";
import { sendEmail } from "@/lib/server/email";
import { SITE_NAME } from "@/lib/site";

export const maxDuration = 120;

/**
 * Daily health check (InsForge schedule, Bearer CRON_SECRET). Looks at the last 48 hours and emails
 * OWNER_EMAIL only when a threshold is breached, so silence means healthy. Always returns the findings.
 */
export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const until = new Date();
  const ops = await loadOps(createAdminInsForge().database, { since: new Date(until.getTime() - 48 * 3_600_000).toISOString(), until: until.toISOString() });
  let alerted = false;
  const owner = process.env.OWNER_EMAIL;
  if (ops.problems.length && owner) {
    alerted = await sendEmail(owner, `${SITE_NAME}: ${ops.problems.length} operational problem${ops.problems.length === 1 ? "" : "s"}`, `${ops.problems.map((p) => `- ${p}`).join("\n")}\n\nWindow: last 48 hours. Details: npx tsx --env-file=.env.local scripts/ops-report.mts`, "", "");
  }
  return NextResponse.json({ problems: ops.problems, alerted, ownerConfigured: Boolean(owner) });
}
