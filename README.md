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
- Data stored in browser (localStorage)

## BAS estimate limits
Cash-basis calculations use the date a full invoice payment was recorded. Partial payments are not supported. Receipt dates are used for purchase GST in both modes. Check GST credit eligibility and accounting treatment before lodging.

## Deploy
This is a static site. Deploy the HTML files to Vercel or Cloudflare Pages.
