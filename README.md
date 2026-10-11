# TradieBooks MVP

Mobile-first web prototype for Australian solo tradies.

## Features
- Create / edit / delete invoices
- Multi-line invoice editing, preview, and sequential invoice numbers
- Add and edit receipts with the GST amount shown on the receipt
- Record and edit receipt and full invoice payment dates
- Cash or non-cash GST estimate, with selectable historical quarters
- BAS estimate and quarterly GST report use the selected basis
- Older receipts without GST amounts are flagged for review and excluded from purchase GST totals
- Paid invoices without payment dates are flagged and excluded from cash-basis sales estimates
- Local backup export and validated import with a replacement preview
- One-click accountant ZIP export with invoice, item, payment, receipt, quarterly GST and review CSVs
- Optional email-code accounts and cloud book recovery through Supabase
- Existing browser books can be backed up, migrated and checked by record counts and totals

The accountant export is generated locally in the browser and downloads one ZIP. It includes all recorded invoices and receipts, a selected-quarter summary, quarterly GST estimates, a review list and a JSON backup. When cloud accounts are enabled, book data is also sent to the user's Supabase project.

## Set up cloud accounts
1. Create a Supabase project. In **SQL Editor**, run [`supabase/schema.sql`](supabase/schema.sql). This creates a per-user book table, row level security policies and an atomic revision-checked save function.
2. In **Authentication > Providers > Email**, enable email sign-in. In **Authentication > Email Templates**, add `{{ .Token }}` to both the **Confirm signup** and **Magic Link** templates and save each one. Supabase can use the signup template for a new email and the magic-link template for a returning email. The sign-in page verifies the emailed six-digit code, allowing migration in the same browser as the old local book. Supabase's default email service only delivers to authorized project team addresses; configure custom SMTP before inviting testers who are not on the team.
3. In [`supabase-config.js`](supabase-config.js), set the project's HTTPS URL and **publishable key** (or legacy anon key). Never put a service role key in browser code. Commit and deploy this file only after the SQL and email template are ready.
4. Test with two separate email accounts. Each account should see only its own book. On the original browser, download the offered backup before uploading the old local book. On a second device, sign in with the same email and verify the invoice and receipt counts and totals.

Until the project URL and key are configured, the current local-only app continues to work. Once configured, every page requires sign-in. On each page the cloud book is loaded before it is shown, and edits are confirmed only after the cloud save succeeds. A revision check rejects a stale device's save instead of silently overwriting a newer book. This first version stores one JSON book per user; it does not merge simultaneous edits or support offline edits. Keep exporting backups regularly.

## BAS estimate limits
Cash-basis calculations use the date a full invoice payment was recorded. Partial payments are not supported. Receipt dates are used for purchase GST in both modes. Check GST credit eligibility and accounting treatment before lodging.

## Deploy
This is a static site. Deploy the HTML files to Vercel or Cloudflare Pages.
