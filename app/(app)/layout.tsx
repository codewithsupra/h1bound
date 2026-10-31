import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/insforge/server";
import { loadShell } from "@/lib/server/pipeline";
import { loadChat } from "@/lib/server/chat-store";
import { Workspace } from "@/components/app/workspace";

/** Signed-in workspace: Pipeline, Your case, Settings, with Maya docked. Guests go to sign in. */
export default async function WorkspaceLayout({ children }: LayoutProps<"/">) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const [shell, history] = await Promise.all([loadShell(user), loadChat(user.id)]);
  return <Workspace shell={shell} history={history} now={shell.now}>{children}</Workspace>;
}
