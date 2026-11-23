import { hiringCsv, sponsorsHiringNow } from "@/lib/server/hiring-now";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

/** The "Sponsors hiring now" list as a CSV: free, no sign-up. */
export async function GET() {
  try {
    const csv = hiringCsv(await sponsorsHiringNow(), SITE_URL);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="sponsors-hiring-now-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (e) {
    console.error(`[hiring-csv] ${(e as Error).message}`);
    return new Response("The list is unavailable right now. Try again in a few minutes.", { status: 503 });
  }
}
