# Deploying Your Own MUSE

This guide walks you through deploying a personal instance of MUSE — your own copy of the app, running on your own accounts, with your own data. It takes about 20–30 minutes.

You will need:
- A [Vercel account](https://vercel.com) (free tier is fine)
- A [Neon account](https://neon.tech) (free tier is fine)
- An API key from [Anthropic](https://console.anthropic.com) or [OpenAI](https://platform.openai.com) — you'll configure this inside the app after deploying
- Your music files, converted to AAC (`.m4a`) — see Step 8 for why

**A note on audio formats and file size:** Vercel Blob's free tier includes 500MB of storage. A single classical album in a lossless format like ALAC or FLAC can easily consume most or all of that. Converting your files to AAC before uploading keeps file sizes manageable while preserving audio quality that is indistinguishable from lossless in normal listening conditions. On Mac, [Permute](https://software.charliemonroe.net/permute/) is a simple drag-and-drop converter. If you are already on a paid Vercel plan, lossless formats are fine.

---

## Step 1 — Fork the repository

1. Go to the [MUSE repository on GitHub](https://github.com/jeanluccurrie/muse).
2. Click **Fork** in the top right to create your own copy under your GitHub account.

---

## Step 2 — Create a Neon database

1. Go to [neon.tech](https://neon.tech) and sign in.
2. Create a new project. Name it anything (e.g. `muse`).
3. Once created, find the **Connection string** on the project dashboard. It looks like:
   ```
   postgresql://user:password@host.neon.tech/neondb?sslmode=require
   ```
4. Copy this string — you'll need it in Step 4.

---

## Step 3 — Deploy to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in.
2. Click **Add New → Project**.
3. Select **Import Git Repository** and choose your forked MUSE repo.
4. On the configuration screen, **do not click Deploy yet** — you need to add environment variables first (see Step 4).

---

## Step 4 — Set environment variables

Environment variables are private settings that your app reads at runtime — passwords, database addresses, and other configuration that should never be stored in code. Vercel keeps these secure and separate from your codebase.

Still on the Vercel project configuration screen, scroll down to the **Environment Variables** section. You'll see two fields: **Name** (the variable name) and **Value** (the secret). Add the following two variables, one at a time:

**Variable 1 — your database**

- **Name:** `DATABASE_URL`
- **Value:** The Neon connection string you copied in Step 2. It should look like:
  ```
  postgresql://user:password@host.neon.tech/neondb?sslmode=require
  ```
  Paste the whole thing, exactly as copied.

After filling in both fields, click **Add** to save it.

**Variable 2 — your login password**

- **Name:** `MUSE_AUTH_PASSWORD`
- **Value:** A password of your choice. This is the password you'll type every time you open MUSE. Pick something you'll remember. If you ever need to change it, go back to Vercel → Settings → Environment Variables, update the value, and redeploy — your new password takes effect immediately after the deploy completes.

Click **Add** to save it.

> **Blob storage token:** You'll notice the app also needs a `BLOB_READ_WRITE_TOKEN` for audio storage. Don't add this manually — Vercel generates and injects it automatically when you connect Blob storage in Step 5. Adding it yourself won't work.

Once both variables are saved, click **Deploy**. Vercel will build and deploy the app. This takes about a minute.

---

## Step 5 — Add Vercel Blob storage

Vercel Blob is used to store your audio files. You need to add it to your project.

1. In the Vercel dashboard, go to your MUSE project.
2. Click the **Storage** tab.
3. Click **Create Database → Blob**.
4. Follow the prompts. When complete, Vercel will automatically add the `BLOB_READ_WRITE_TOKEN` environment variable to your project.
5. Go to the **Deployments** tab and click **Redeploy** on your latest deployment so the app picks up the new variable.

---

## Step 6 — Run the database migration

This creates all the tables MUSE needs to store your progress, journals, and audio. You only need to do this once.

1. Open your deployed app URL and log in with the password you set in Step 4.
2. While still logged in, open a new tab and navigate to:
   ```
   https://your-project.vercel.app/api/migrate
   ```
   Replace `your-project` with your actual Vercel project name.
3. You should see:
   ```
   {"ok":true,"message":"Migration complete — all tables created."}
   ```

That's it. You can close that tab and return to the app.

If you see an error instead, double-check that `DATABASE_URL` is set correctly in Vercel and that you redeployed after adding it (Step 5).

---

## Step 7 — Configure your AI provider

MUSE uses an AI model (MUSE the historian) to provide context and conversation. You configure this inside the app.

1. Log in to your deployed app.
2. Go to **Settings**.
3. Under **AI PROVIDER**, select your provider from the dropdown:
   - **Anthropic** — uses Claude. Get an API key at [console.anthropic.com](https://console.anthropic.com). Recommended.
   - **OpenAI (GPT-4o)** — Get an API key at [platform.openai.com](https://platform.openai.com).
4. Enter your API key in the **API KEY** field.
5. Click **SAVE AI SETTINGS**.

Your key is encrypted before storage and never sent to the browser. All AI calls go through your backend.

**The AI integration is core to the MUSE experience.** MUSE the historian is your personalized tutor on the journey — providing context before each listen, answering your questions, and connecting what you're hearing to the broader sweep of music history. It is what separates MUSE from a playlist. In practice the cost is negligible: a full album with multiple conversations across three listens costs less than $1.00 at current Anthropic pricing. Anthropic is recommended — Claude is the model MUSE was designed around.

---

## Step 8 — Upload your music

MUSE plays music you provide. Audio files are uploaded per-album from the Settings screen.

1. Log in and go to **Settings**.
2. Under **AUDIO**, select the album you want to upload from the dropdown.
3. Click **Choose Files** and select all the tracks for that album at once.
4. Click **Upload** to send them to your storage.

You only need to upload the current album to start. Upload future albums as you reach them on The Path.

**Track ordering:** Files are sorted alphabetically before upload. For correct track order, make sure your filenames start with track numbers — e.g. `01 - Concerto No. 1.m4a`, `02 - Concerto No. 2.m4a`. Most music libraries and ripping software name files this way by default.

**File format and size:** Convert your files to AAC (`.m4a`) before uploading. Lossless formats like ALAC and FLAC produce files that are 5–10× larger, and a single classical album can exceed Vercel Blob's free tier limit. AAC at high quality is indistinguishable in normal listening. On Mac, [Permute](https://software.charliemonroe.net/permute/) makes batch conversion straightforward. If you are on a paid Vercel plan, lossless formats are fine.

**Purchasing albums:** MUSE does not stream from any service — you bring your own files. For purchasing high-quality downloads, [Qobuz](https://www.qobuz.com) and [Bandcamp](https://bandcamp.com) are recommended. Qobuz specializes in classical and offers lossless FLAC downloads (convert to AAC before uploading). Bandcamp is better for contemporary and independent music. The iTunes Store / Apple Music also sells AAC downloads that are ready to upload without conversion.

---

## You're ready

Open your app, log in, and begin The Path. MUSE starts with Corelli's *Concerti Grossi Op. 6* — the beginning of the western classical tradition.

---

## Troubleshooting

**Login doesn't work**
- Confirm `MUSE_AUTH_PASSWORD` is set in Vercel → Settings → Environment Variables.
- After changing environment variables, you must redeploy for them to take effect.

**Migration fails or returns "Unauthorized"**
- You must be logged in to the app before visiting `/api/migrate`. Open the app, log in, then open the migration URL in a new tab in the same browser.
- Check that `DATABASE_URL` is the full Neon connection string including `?sslmode=require`.
- Make sure you redeployed after setting the `DATABASE_URL` variable.

**Audio won't upload**
- Check that Blob storage is connected and `BLOB_READ_WRITE_TOKEN` is set (Vercel → Storage tab).
- Redeploy after adding Blob storage.

**MUSE AI isn't responding**
- Go to Settings and verify your API key is saved.
- Check that your Anthropic or OpenAI account has available credits.

**Build fails on deploy**
- Check the Vercel build logs for the specific error.
- Make sure all required environment variables are set before deploying.
