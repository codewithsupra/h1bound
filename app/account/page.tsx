import { redirect } from "next/navigation";

/** The old account page now lives in the workspace. */
export default function AccountPage() {
  redirect("/settings");
}
