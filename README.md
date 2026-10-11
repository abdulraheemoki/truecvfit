# TrueCVFit

**Tailor your CV to a job without the fluff.**

TrueCVFit is a free web tool that matches your CV to a job description. You paste (or upload) your CV and the job advert, and it:

- puts your most relevant experience first,
- rephrases your points in the job's language,
- shows you what the job asks for that your CV doesn't,
- and **never adds anything you didn't write.**

No sign-up. Nothing saved. Works on any phone.

Built by **Abdulraheem Oki**.

---

## Why I built it

Most AI CV tools have the same two problems: they make things up (skills, tools, numbers, "led a team of 10"), and they fill your CV with buzzwords like *results-driven* and *passionate*. Most of them also want an account and keep your data.

TrueCVFit is built the other way round. The AI is only allowed to rephrase, and ordinary code checks every line it writes before you see it.

## How it works

```
Your phone                                         Cloudflare
──────────                                         ──────────
1. Read CV + job description (PDF/Word/text)
2. Find the job's requirements
3. Score every CV point against them
4. Strip name, email, phone, links
5. Send only the relevant points  ───────────────►  Worker → Workers AI
                                                    (rephrase only, no storage,
6. Honesty check on every rewrite  ◄───────────────  no logging)
7. Keep good rewrites, throw away the rest
8. Reorder, show gaps, before/after view
9. Copy / Word / PDF — made on your phone
```

### The honesty check

Every AI rewrite is compared with the user's original point by plain code (`public/js/engine.js`, `checkRewrite`). A rewrite is **rejected and the original kept** if it:

| Check | Example it catches |
|---|---|
| Adds or changes a number | "served customers" → "served 120 customers" |
| Adds a name, tool or acronym | "wrote captions" → "wrote captions in Hootsuite" |
| Makes the role sound bigger | "helped organise" → "led", "managed", "spearheaded" |
| Adds a buzzword | "fast-paced", "results-driven", "leverage", "passionate" … |
| Copies a duty or skill from the job description | "wrote captions" → "wrote captions and monitored engagement" |
| Is much longer than the original | padding |

The **What changed** tab shows every rewrite next to the original, including the rejected ones and why they were rejected.

### Privacy

- No accounts, no database, no cookies, no analytics, no browser storage.
- Files are read on the user's own device.
- Name and contact details never leave the device.
- Only the CV points that relate to the job are sent, once, to Cloudflare Workers AI. Cloudflare states it does not use Workers AI inputs or outputs to train models.
- The Worker doesn't log anything (`observability` is switched off).
- Fonts and libraries are self-hosted, so there are no third-party requests.

## Tech

- **Front end:** plain HTML, CSS and JavaScript. No framework, no build step.
- **Back end:** one Cloudflare Worker (`src/worker.js`) using Workers AI (Gemma 4, with Llama 3.3 as a backup).
- **File reading:** pdf.js, mammoth.js. **File output:** docx, jsPDF with Noto Sans (supports Yoruba and other accented names).
- **Hosting:** Cloudflare Workers free plan, deployed automatically from this repository.

## Project layout

```
public/            the website
  index.html
  styles.css
  js/engine.js     matching, gaps, honesty checks (no network calls)
  js/app.js        page behaviour, uploads, downloads
  vendor/          third-party libraries (self-hosted)
  fonts/           self-hosted fonts
  _headers         security headers
src/worker.js      the AI piece
test/              automated tests
wrangler.jsonc     Cloudflare settings
SETUP.md           step-by-step guide to putting it online
```

## Running the tests

```
npm test
```

## Limits

- The Cloudflare free plan includes a daily AI allowance (resets at midnight UTC). When it runs out, TrueCVFit still reorders the CV and shows the gaps; it just doesn't rephrase until the next day.
- Scanned PDFs (images of text) can't be read. Users can paste the text instead.
- The honesty check is strict on purpose. It sometimes rejects a harmless rewrite, which is the safer mistake.

## Licences

TrueCVFit's own code is MIT licensed. Licence texts for everything else are in the `licenses` folder. Third-party libraries keep their own licences: pdf.js (Apache 2.0), mammoth.js (BSD-2), jsPDF (MIT), docx (MIT). Fonts: Bricolage Grotesque, Atkinson Hyperlegible and Noto Sans (SIL Open Font License).
