/**
 * Supabase's API returns at most 1,000 rows per request, however large a limit you ask for, and says
 * nothing when it truncates. Anything that may exceed that must read in pages: use this.
 */
export const PAGE_SIZE = 1000;

type Result = { data: unknown; error: { message: string } | null };

export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<Result>, max = Infinity): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += PAGE_SIZE) {
    const { data, error } = await page(from, Math.min(from + PAGE_SIZE, max) - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}
