import { disconnectGmailAction, disconnectTelegramAction } from "@/app/actions/account";

/** Where daily picks arrive and how emails get sent. Each connection is opt-in and can be removed. */
export function Connections({ gmail, telegram, gmailAvailable, telegramAvailable }: { gmail: boolean; telegram: boolean; gmailAvailable: boolean; telegramAvailable: boolean }) {
  return (
    <section className="mt-6 glass rounded-3xl p-6">
      <h2 className="font-display text-lg font-semibold">Daily picks and sending</h2>
      <ul className="mt-3 divide-y divide-haze">
        <li className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="font-medium">Telegram</p>
            <p className="text-sm text-mist">Your best new matches each morning, with buttons to learn about the company or draft your email.</p>
          </div>
          {telegram ? (
            <form action={disconnectTelegramAction}><button className="btn-ghost !px-4 !py-2 text-sm">Disconnect</button></form>
          ) : telegramAvailable ? (
            <a href="/api/telegram/link" className="btn-light !px-4 !py-2 text-sm">Connect Telegram</a>
          ) : (
            <span className="text-sm text-mist">Coming soon</span>
          )}
        </li>
        <li className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="font-medium">Gmail</p>
            <p className="text-sm text-mist">Send emails Maya drafts from your own address, after you review them. We can&apos;t read your inbox.</p>
          </div>
          {gmail ? (
            <form action={disconnectGmailAction}><button className="btn-ghost !px-4 !py-2 text-sm">Disconnect</button></form>
          ) : gmailAvailable ? (
            <a href="/api/gmail/connect" className="btn-light !px-4 !py-2 text-sm">Connect Gmail</a>
          ) : (
            <span className="text-sm text-mist">Coming soon</span>
          )}
        </li>
      </ul>
    </section>
  );
}
