import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/insforge/server";
import { loadPipeline, loadShell } from "@/lib/server/pipeline";
import { SITE_NAME } from "@/lib/site";
import { Pipeline } from "@/components/app/pipeline";

export const metadata = { title: `Pipeline · ${SITE_NAME}` };

export default async function PipelinePage() {
  // Layouts and pages render in parallel, so each page checks the session itself.
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [rows, shell] = await Promise.all([loadPipeline(user.id), loadShell(user)]);
  return <Pipeline rows={rows} now={shell.now} visaEndsOn={shell.visaEndsOn} gmail={shell.gmail} pro={shell.pro} firstName={shell.firstName} />;
}
