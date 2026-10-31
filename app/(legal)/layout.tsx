import { SiteHeader } from "@/components/site/site-header";

export default function LegalLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader back />
      <main className="mx-auto w-full max-w-[44rem] flex-1 px-4 py-10 sm:py-14">
        <article className="space-y-4 text-[0.97rem] leading-relaxed text-moon/90 [&_h1]:font-display [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:text-moon [&_h2]:pt-4 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-moon [&_li]:ml-5 [&_li]:list-disc [&_a]:text-runway [&_a]:underline">
          {children}
        </article>
      </main>
    </>
  );
}
