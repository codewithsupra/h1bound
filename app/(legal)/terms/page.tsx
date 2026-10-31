import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/legal";
import { SITE_NAME } from "@/lib/site";

export const metadata = { title: `Terms · ${SITE_NAME}`, description: `The terms for using ${SITE_NAME}.` };

export default function TermsPage() {
  return (
    <>
      <h1>Terms of use</h1>
      <p className="text-sm text-mist">Last updated {LEGAL_UPDATED}</p>
      <p>By using {SITE_NAME} you agree to these terms. If you don&apos;t agree, please don&apos;t use the service.</p>

      <h2>What {SITE_NAME} does</h2>
      <p>{SITE_NAME} matches you with job postings, shows whether employers appear on official visa sponsor registers, drafts outreach emails, and sends them from your Gmail only when you approve each one. Maya is an AI assistant, not a person.</p>

      <h2>No guarantees</h2>
      <ul>
        <li>Register data comes from the UK Home Office, the Dutch IND and the Irish Department of Enterprise. Being on a register means an employer <em>can</em> sponsor, not that it <em>will</em> sponsor you.</li>
        <li>We don&apos;t promise interviews, replies, offers or visas. Any reply rate we show you is your own, counted from what you send and mark.</li>
        <li>Nothing here is legal or immigration advice. Check visa questions with your university or a qualified adviser.</li>
        <li>Contact details found for you are best guesses and may be wrong. Check before you send.</li>
      </ul>

      <h2>Your responsibilities</h2>
      <ul>
        <li>Keep your account secure and the information you give us truthful.</li>
        <li>You are the sender of every email you approve. Don&apos;t use {SITE_NAME} to send spam, bulk or misleading messages, or to harass anyone.</li>
        <li>Don&apos;t scrape, resell or overload the service, or try to get around usage limits.</li>
      </ul>

      <h2>Plans and billing</h2>
      <p>Pro is billed monthly in your local currency through Stripe and renews until you cancel. The free trial lasts 7 days and doesn&apos;t charge you; it ends unless you choose Pro. You can cancel any time in Settings; Pro stays active until the end of the paid period. Where the law gives you a right to a refund, we honour it.</p>

      <h2>Your content</h2>
      <p>Your CV, notes and emails stay yours. You let us process them only to provide the service, as described in our <Link href="/privacy">privacy policy</Link>.</p>

      <h2>Ending your account</h2>
      <p>You can delete your account any time in Settings. We may suspend accounts that break these terms, and will tell you why unless the law prevents it.</p>

      <h2>Liability</h2>
      <p>We provide the service &ldquo;as is&rdquo;. To the extent the law allows, we aren&apos;t liable for indirect losses or for decisions employers or immigration authorities make. Nothing in these terms limits liability that can&apos;t be limited by law, or your statutory consumer rights.</p>

      <h2>Changes</h2>
      <p>If we change these terms in a way that matters, we&apos;ll tell you by email or in the app before the change applies.</p>

      <h2>Contact</h2>
      <p>{CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : "Reply to any email we have sent you."}</p>
    </>
  );
}
