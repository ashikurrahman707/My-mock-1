# My-Mock — Setup Guide

## What this is right now

A fully working IELTS Speaking practice site that runs **entirely in the
browser** — no server, no build step. Open `index.html` in Chrome (best
speech-recognition support) or serve the folder with any static file
server, and everything works: signup, login, practice rooms, mock
tests, and rule-based evaluation.

Data (accounts, answers, sessions) is stored in the browser's
`localStorage`. That means it's **per-browser, per-device only** —
clearing browser data or switching devices loses it. This was the
fastest way to get you something real and testable today. Moving to
Supabase later (real accounts, real database, works across devices)
means swapping the *inside* of the functions in `js/store.js` — every
page that calls `Auth.login()`, `PracticeStore.saveAnswer()`, etc.
keeps working unchanged.

## Running it

**Easiest:** double-click `index.html`. Some browsers restrict camera/
mic access on `file://` pages — if that happens, run a tiny local
server instead:

```
cd mymock
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Turning on real email verification (currently: dev mode)

Right now, signup shows the verification code directly on the verify
page (clearly labeled "dev mode") instead of emailing it — so you can
test the whole flow immediately. To send real emails from
`easyieltsforeveryone@gmail.com`:

1. Go to **emailjs.com** → sign up free.
2. **Email Services** → Add New Service → Gmail → connect
   `easyieltsforeveryone@gmail.com`.
3. **Email Templates** → create a template with variables
   `{{to_name}}`, `{{to_email}}`, `{{verification_code}}` in the body.
4. Copy your **Public Key**, **Service ID**, **Template ID** into
   `js/email.js` at the top (`CONFIG` object).
5. Add this line to every HTML page's `<head>`, before your other
   scripts: `<script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js"></script>`

Free tier: 200 emails/month, no card required.

## Turning on Google Sheet logging (currently: console log only)

1. Open your target Google Sheet.
2. Extensions → Apps Script. Paste this:
   ```js
   function doPost(e) {
     const data = JSON.parse(e.postData.contents);
     SpreadsheetApp.getActiveSpreadsheet().getActiveSheet()
       .appendRow([data.name, data.email, data.verifiedAt]);
     return ContentService.createTextOutput("OK");
   }
   ```
3. Deploy → New deployment → Web app → Execute as "Me", Who has
   access "Anyone". Deploy, copy the URL.
4. Paste that URL into `js/email.js` → `CONFIG.SHEETS_WEBAPP_URL`.

Free, no billing, no service account needed.

## What's real vs. what's a practice estimate

- **Grammar checking** uses LanguageTool's free public API — genuine
  rule-based grammar/spell-checking, not invented.
- **Transcription** uses the browser's built-in Web Speech API (free,
  Chrome-only for best results) — real speech-to-text, but word-level
  timing/confidence is approximated (browsers don't expose true
  per-word timestamps), documented in `js/practice-room.js`.
- **Fluency, Vocabulary, and overall Band scores** are computed from
  measurable signals (speech rate, pauses, filler words, vocabulary
  diversity, cohesive device usage) — see `lib/evaluation/` (original
  commented TypeScript) and `js/evaluation.js` (browser version) for
  exactly how.
- **Pronunciation** is the weakest score by design — flagged with a
  visibly lower confidence badge in the UI, because no real phonetic
  analysis is possible without paid AI audio processing.

None of this is official IELTS scoring, and the UI says so throughout.

## Known limitations to know about before sharing this with students

- **No server-side security.** Because everything runs client-side,
  a technically savvy user could inspect localStorage or bypass checks
  in DevTools. Fine for early testing with real students on the honor
  system; not fine for a public product with sensitive data. Moving
  auth/storage to Supabase (real backend, real database rules) closes
  this gap — flag it to me when you're ready to do that migration.
- **Data doesn't sync across devices** (see above).
- **LanguageTool's free tier** has a light rate limit (~20 req/min) —
  fine for individual use, may need self-hosting later at scale.
- **Recordings aren't uploaded anywhere** — they exist only in the
  browser tab during the session (not saved to disk/history), since
  there's no storage backend yet. Transcript + scores ARE saved.

## Question bank

`data/questions.json` — parsed from your PDF: 240 Part 1 questions,
168 Part 2 cue cards, 169 Part 3 questions, all topic-tagged so mock
tests can match Part 3 questions to the selected Part 2 topic.
