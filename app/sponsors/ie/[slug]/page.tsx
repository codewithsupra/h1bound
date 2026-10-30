import { LicencePage, licenceMetadata } from "@/app/sponsors/_components/licence-page";

// Daily ISR; pages render on first visit (there are too many to prerender).
export const revalidate = 86400;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

export function generateMetadata({ params }: PageProps<"/sponsors/ie/[slug]">) {
  return licenceMetadata("IE", params);
}

export default function Page({ params }: PageProps<"/sponsors/ie/[slug]">) {
  return <LicencePage country="IE" params={params} />;
}
