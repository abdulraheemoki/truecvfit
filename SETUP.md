# Putting TrueCVFit online

This takes about 15–20 minutes, once. Do it on a laptop or desktop, not your phone.
You need: the `truecvfit` folder (unzip `truecvfit.zip` first), your GitHub account, and an email address for Cloudflare.

---

## Part 1 — Put the code on GitHub (about 5 minutes)

1. Go to **github.com** and sign in (the same account as your UFD trainer is fine).
2. Click the **+** at the top right, then **New repository**.
3. Fill in:
   - **Repository name:** `truecvfit`
   - **Description:** `Tailor your CV to a job without the fluff. No sign-up, nothing saved, nothing invented.`
   - Choose **Public** (so it shows on your profile).
   - **Do not** tick "Add a README file" — the project already has one.
4. Click **Create repository**.
5. On the next page, click the link that says **uploading an existing file**.
6. On your computer, open the unzipped `truecvfit` folder. Select **everything inside it** (the `public`, `src`, `test` and `licenses` folders, plus `README.md`, `SETUP.md`, `wrangler.jsonc`, `package.json`, `LICENSE`) and drag it all into the browser window.
   - Drag the **contents** of the folder, not the `truecvfit` folder itself.
   - It's fine if `.gitignore` doesn't come along (some computers hide it).
7. Wait for every file to finish uploading, then click **Commit changes** at the bottom.
8. **Check:** the repository's front page should show `public`, `src`, `test`, `wrangler.jsonc` and `README.md` at the top level. If you see a single `truecvfit` folder instead, the files went one level too deep — delete the repository (Settings → bottom of the page) and repeat steps 2–7.

## Part 2 — Put it live on Cloudflare (about 10 minutes)

1. Go to **dash.cloudflare.com/sign-up** and create a free account. Confirm your email.
   - If it asks what you want to do or which plan, choose the **Free** option. You don't need a domain name.
2. In the left-hand menu, open **Workers & Pages** (it may sit under **Compute**).
3. Click **Create application**, then **Get started** next to **Import a repository**.
4. Click **Connect GitHub** (or choose your GitHub account if it's already listed).
   - GitHub will ask which repositories Cloudflare may see. Choose **Only select repositories**, pick **truecvfit**, and approve.
5. Back in Cloudflare, select the **truecvfit** repository.
6. On the settings screen:
   - **Project name:** `truecvfit` — this must be exactly that, or the build fails.
   - **Build command:** leave empty.
   - **Deploy command:** leave as `npx wrangler deploy`.
   - Leave everything else as it is.
7. Click **Save and Deploy**. It takes a minute or two.
8. When it's done, Cloudflare shows a link ending in **.workers.dev** (something like `truecvfit.yourname.workers.dev`). That's your link. Open it on your phone and try it with your own CV.

You don't need to set up the AI separately or copy any keys — the `wrangler.jsonc` file already tells Cloudflare to switch it on.

## Part 3 — Making changes later

Edit any file on GitHub (open the file, click the pencil icon, make the change, **Commit changes**). Cloudflare notices and updates the live site automatically within a couple of minutes. The link never changes.

## Part 4 — Keeping an eye on it

- **AI usage:** Cloudflare dashboard → **AI** → **Workers AI** shows how much of the free daily allowance has been used. It resets every day at midnight UTC (1am UK time in summer).
- **Rough capacity:** I estimate somewhere around 100–150 tailored CVs a day on the free allowance, depending on CV length. That's an estimate, not a tested figure — check the usage page after the first few days of real use. When the allowance runs out, the tool still works (reordering and gaps list), it just stops rephrasing until the next day. **It never starts charging you** — the free plan has no payment details.
- **Build errors:** open your Worker in Cloudflare → **Deployments** → **View build history**. The most common cause is the project name not being exactly `truecvfit`.

## If something goes wrong

| What you see | What to do |
|---|---|
| Build fails mentioning the Worker name | The project name in Cloudflare must be `truecvfit`, matching `wrangler.jsonc`. |
| Site loads but always says rephrasing "isn't available right now" | Workers AI may not be enabled on the account yet. In the dashboard, open **AI → Workers AI** once and accept any prompt, then try again. |
| Site loads but says the daily limit is reached | Normal when lots of people use it. Back the next day. |
| A page shows "Not found" | The files went one folder too deep on GitHub — see Part 1, step 8. |

## Optional extras

- **Your own domain** (e.g. `truecvfit.com`): buy it through Cloudflare, then Worker → **Settings** → **Domains & Routes** → **Add**. Costs money yearly; the free `.workers.dev` link works fine.
- **Link your name:** in `public/index.html`, the line `Built by Abdulraheem Oki` can become a link to your LinkedIn or GitHub profile.
