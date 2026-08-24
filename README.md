# UPI Guardian

**Explain Before You Pay** - a UPI fraud-awareness and payment-safety demo app.
Every screen is real: Supabase Auth + Postgres back the whole app, and every
button in the sidebar is wired to a working feature.

## Features

- **Dashboard** - live safety score, transactions analyzed, money saved
  (from payments you cancelled after a risk warning), recent activity, and
  "Try Demo" cards that run real scenarios through the risk engine.
- **Send Money** - recipient lookup, quick amounts, recent payees, and a
  full risk review (new receiver, large amount, suspicious note) before
  any payment is confirmed.
- **Scan & Pay** - live camera QR scanning (jsQR), image upload, or sample
  QR codes; decodes `upi://pay` and `upi://collect` links and flags fake
  "collect" QR codes disguised as refunds.
- **Payment Requests** - simulate incoming collect requests and see the
  approve/decline flow, with a clear warning that approving sends money OUT.
- **Transactions** - full history with search, filters, sorting and stats.
- **Message Analyzer** - paste text or upload a screenshot (OCR'd in-browser
  with Tesseract.js) and get a real heuristic scam score with the specific
  risk factors detected.
- **Insights** - spend-by-category, risk breakdown and monthly trend charts,
  plus a merged "Scam Timeline" of transactions and analyzed messages.
- **Settings** - edit profile, change password, notification preferences,
  and Trust Person Confirmation (trusted contacts + a payment threshold).
- **Help & Support** - FAQ, safety tips, and a step-by-step Recovery Method
  checklist for if you've been scammed.

## Setup

1. Create a [Supabase](https://supabase.com) project.
2. Go to **Project Settings → API** and copy the Project URL and anon
   public key into `js/supabase-config.js`.
3. Go to **Authentication → Providers → Email** and turn **off**
   "Confirm email" (this app signs users in with a synthetic email built
   from their mobile number - see `js/auth.js` for details).
4. Open the **SQL Editor** and run the whole of `schema.sql` once. It's
   idempotent, so re-running it later (e.g. after pulling an update with
   new tables) is safe.
5. Deploy anywhere that serves static files - this is a build-free static
   site. `vercel.json` is included for one-click Vercel deploys.

## Local preview

No build step is needed. Serve the folder with any static file server, e.g.:

```bash
npx serve .
```

Then open `http://localhost:3000`.

## Notes

- This app does not move real money or connect to a real bank - it's a
  safety-education tool. Transactions you log are stored in your own
  Supabase project so the risk engine and insights have real data to work
  with.
- Camera access for Scan & Pay requires HTTPS (or `localhost`) and browser
  permission.
