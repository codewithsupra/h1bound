import { createAdminInsForge } from "@/lib/insforge/admin";

export const metadata = { title: "Unsubscribed · H1Bound", robots: { index: false } };

export default async function Unsubscribe({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { data } = await createAdminInsForge().database.rpc("unsubscribe", { p_token: token });
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-20">
      <h1 className="font-display text-3xl font-bold">{data ? "You're unsubscribed" : "That link didn't work"}</h1>
      <p className="mt-3 text-slate">
        {data ? "Maya won't email you anymore. You can turn updates back on from your account anytime." : "It may have expired. You can turn email updates off from your account page."}
      </p>
      <a href="/account" className="mt-6 inline-block underline">Go to account</a>
    </main>
  );
}
