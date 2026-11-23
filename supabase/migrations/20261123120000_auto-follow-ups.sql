-- Follow-ups that send themselves: when the student approves the first email, they can approve its
-- follow-up too. It then goes out on its own after a few days, as a reply in the same Gmail thread,
-- unless the student has marked a reply (or cancels it first).
ALTER TABLE public.outreach
  ADD COLUMN IF NOT EXISTS gmail_thread_id text,           -- Gmail thread of the sent email, so the follow-up lands in it
  ADD COLUMN IF NOT EXISTS rfc_message_id text,            -- our Message-ID header, for In-Reply-To on the follow-up
  ADD COLUMN IF NOT EXISTS sent_meta_enc text,             -- encrypted {to, subject} exactly as sent
  ADD COLUMN IF NOT EXISTS auto_send_at timestamptz,       -- follow-up rows: when it goes out on its own; null = manual
  ADD COLUMN IF NOT EXISTS auto_body_enc text,             -- follow-up rows: the encrypted text the student approved
  ADD COLUMN IF NOT EXISTS auto_attempts int NOT NULL DEFAULT 0;

ALTER TABLE public.outreach DROP CONSTRAINT IF EXISTS outreach_sent_meta_enc_check;
ALTER TABLE public.outreach ADD CONSTRAINT outreach_sent_meta_enc_check CHECK (sent_meta_enc IS NULL OR sent_meta_enc LIKE 'v1:%');
ALTER TABLE public.outreach DROP CONSTRAINT IF EXISTS outreach_auto_body_enc_check;
ALTER TABLE public.outreach ADD CONSTRAINT outreach_auto_body_enc_check CHECK (auto_body_enc IS NULL OR auto_body_enc LIKE 'v1:%');
ALTER TABLE public.outreach DROP CONSTRAINT IF EXISTS outreach_auto_kind_check;
ALTER TABLE public.outreach ADD CONSTRAINT outreach_auto_kind_check CHECK (auto_send_at IS NULL OR (kind = 'follow_up' AND auto_body_enc IS NOT NULL));

CREATE INDEX IF NOT EXISTS outreach_auto_due_idx ON public.outreach (auto_send_at) WHERE auto_send_at IS NOT NULL AND sent_at IS NULL;
