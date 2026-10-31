import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "@/lib/legal";
import { SITE_NAME, SITE_URL } from "@/lib/site";

export const metadata = { title: `Privacy · ${SITE_NAME}`, description: `How ${SITE_NAME} handles your CV, chats, Gmail and Telegram data.` };

export default function PrivacyPage() {
  const contact = CONTACT_EMAIL ? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> : <>replying to any email we have sent you</>;
  return (
    <>
      <h1>Privacy policy</h1>
      <p className="text-sm text-mist">Last updated {LEGAL_UPDATED}</p>
      <p>{SITE_NAME} ({SITE_URL}) helps international students find jobs in the UK, the Netherlands, Ireland and remote roles at employers that can sponsor visas. This page explains what we collect, why, who processes it, and how to delete it.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account:</strong> your email address and name, from sign-up or Google sign-in.</li>
        <li><strong>Your CV:</strong> the text we extract from the file you upload. We store that text encrypted and never store the file itself.</li>
        <li><strong>Your case:</strong> citizenship, current visa, visa end date, target countries and roles, your pitch and links, and your answers to Maya&apos;s questions. Identity details, pitch and links are encrypted; matching fields (skills, countries, visa type, visa end date) are stored as plain values so ranking stays fast.</li>
        <li><strong>Your pipeline:</strong> jobs we showed you, their stage, your notes (encrypted) and whether contacts replied, as you tell us.</li>
        <li><strong>Chats with Maya</strong>, encrypted.</li>
        <li><strong>Emails Maya drafts</strong> and the contact found for them, encrypted, plus when you sent them.</li>
        <li><strong>Gmail, if you connect it:</strong> your Gmail address and a refresh token, both encrypted. See &ldquo;Google user data&rdquo; below.</li>
        <li><strong>Telegram, if you connect it:</strong> your chat ID, encrypted.</li>
        <li><strong>Billing:</strong> handled by Stripe. We never see your card number.</li>
      </ul>

      <h2>Google user data</h2>
      <p>If you connect Gmail, we request only the <code>gmail.send</code> scope (plus your email address). We use it for one thing: sending an email you have reviewed and approved by tapping Send, from your own address. We cannot read, search or delete anything in your mailbox. We don&apos;t use Gmail data for advertising, don&apos;t sell it, don&apos;t use it to train AI models, and don&apos;t let people read it.</p>
      <p>{SITE_NAME}&apos;s use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. You can disconnect Gmail any time in Settings or at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">your Google account permissions</a>; disconnecting deletes the stored token.</p>

      <h2>Why we use it</h2>
      <ul>
        <li>To match you with jobs you can legally take, using the official UK, Dutch and Irish sponsor registers.</li>
        <li>To draft emails, find the likely hiring contact, and send what you approve.</li>
        <li>To deliver daily picks by email or Telegram, if you turn them on.</li>
        <li>To run your subscription and keep the service secure.</li>
      </ul>
      <p>The legal bases are performing our contract with you and, for optional channels like daily picks, your consent, which you can withdraw in Settings.</p>

      <h2>Who processes it</h2>
      <ul>
        <li><strong>InsForge</strong>: database, authentication and storage.</li>
        <li><strong>Vercel</strong>: hosting.</li>
        <li><strong>OpenRouter</strong>, routed to providers with zero data retention: the AI behind Maya. Your data is not used to train models.</li>
        <li><strong>Hunter</strong>: finding a likely hiring contact&apos;s public work email. We send it the company name only, never your data.</li>
        <li><strong>Resend</strong>: daily-pick emails. <strong>Telegram</strong>: picks, if you connect it. <strong>Google</strong>: sending through your Gmail. <strong>Stripe</strong>: payments.</li>
      </ul>
      <p>Some processors are outside the UK and EEA; transfers rely on standard contractual clauses or equivalent safeguards.</p>

      <h2>How long we keep it</h2>
      <p>As long as you have an account. Deleting your account (Settings, then Delete my account) erases your profile, CV text, chats, pipeline, drafts and connections. Billing records Stripe must keep by law stay with Stripe.</p>

      <h2>Your rights</h2>
      <p>You can see and download everything we hold (Settings, then Download my data), correct it on Your case, withdraw consent, object, or delete it all. You can also complain to your data protection authority, such as the UK ICO, the Dutch Autoriteit Persoonsgegevens or the Irish Data Protection Commission.</p>

      <h2>Cookies</h2>
      <p>We use only the cookies needed to keep you signed in, remember a guest chat and track a referral link. No advertising or cross-site tracking cookies.</p>

      <h2>Contact</h2>
      <p>Questions or requests: {CONTACT_EMAIL ? "email " : "reach us by "}{contact}. See also our <Link href="/terms">terms</Link>.</p>
    </>
  );
}
