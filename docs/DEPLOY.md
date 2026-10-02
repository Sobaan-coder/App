# Put Study OS online for free (Supabase + Netlify)

This guide takes about 30 minutes. You don't need to install anything; everything happens in the browser. At the end you'll have a public link like `https://study-os.netlify.app` that works on computers, Android and iPhone.

| Service | What it does | Free plan limits worth knowing |
| --- | --- | --- |
| **Supabase** | Database, logins, file storage | 500 MB database and 1 GB files. The project pauses after about a week with no visitors; open the dashboard and click **Restore**. |
| **Netlify** | Runs the website | Each request can run up to 60 seconds, so very large PDFs may time out. Monthly usage credits are plenty for testing. |
| **AI provider** | Tutor, planner, syllabus import, paper mapping | Needs an API key; see [Step 3](#step-3--get-an-ai-key). |

---

## Step 1: Create the database (Supabase)

1. Go to **https://supabase.com**, click **Start your project**, and sign up (signing in with GitHub is easiest).
2. Click **New project**:
   - **Name:** `study-os`
   - **Database password:** click *Generate* and save it somewhere safe.
   - **Region:** the one closest to your students (for Pakistan: *Mumbai* or *Singapore*).
   - Click **Create new project** and wait about 2 minutes.
3. Set up the database:
   - Open the setup file on GitHub: `supabase/setup.sql` on the `feature/study-os` branch. Click **Raw**, then select all (Ctrl+A) and copy (Ctrl+C).
   - In Supabase, open **SQL Editor** in the left sidebar and click **New query**.
   - Paste the file and click **Run**. If Supabase warns about "destructive operations", confirm.
   - You should see **Success** at the bottom. This creates the tables, the security rules, the 3 private file buckets and the course catalogue (CA Pakistan, ACCA, CFA, MDCAT and others).
4. Copy your keys from **Project Settings → API Keys** and keep this tab open for Step 2:
   - **Project URL** (also shown under *Project Settings → Data API*), e.g. `https://abcd1234.supabase.co`
   - The **anon / public** key (called the *publishable* key on newer projects)
   - The **service_role** key (called the *secret* key on newer projects)

   ⚠️ The service_role/secret key has full access to your database. Only ever paste it into Netlify's environment variables, never anywhere public.

## Step 2: Put the website online (Netlify)

1. Go to **https://netlify.com** and sign up with **GitHub**.
2. Click **Add new project → Import an existing project → GitHub**, and allow Netlify to access the `Sobaan-coder/App` repository.
3. Choose the repository and set **Branch to deploy** to `feature/study-os`, or `main` once you merge it. Leave the build settings as they are; they come from `netlify.toml`.
4. Before deploying, click **Add environment variables** (or add them later under *Site configuration → Environment variables*):

   | Key | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL from Step 1 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/publishable key |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role/secret key |
   | `NEXT_PUBLIC_SITE_URL` | leave for now; set in step 6 |
   | `CRON_SECRET` | any long random text, e.g. 40 random letters and numbers |
   | `AI_PROVIDER`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `AI_FAST_MODEL` | see Step 3 |

5. Click **Deploy**. The first build takes about 3 minutes.
6. Set your site address:
   - Go to **Site configuration → Change site name** and pick a name, e.g. `study-os-pk`. Your address becomes `https://study-os-pk.netlify.app`.
   - Add the variable `NEXT_PUBLIC_SITE_URL` with that full address.
   - Go to **Deploys → Trigger deploy → Deploy site**. The redeploy is needed because `NEXT_PUBLIC_` values are built into the site.

## Step 3: Get an AI key

The app works with Anthropic (Claude) or with any OpenAI-compatible provider.

**Option A: Anthropic (default, paid per use, cheap at small scale).** Create a key at https://console.anthropic.com, then set:

```
AI_PROVIDER = anthropic
AI_API_KEY  = sk-ant-...
```

`AI_MODEL` and `AI_FAST_MODEL` can stay empty to use the defaults.

**Option B: a provider with a free tier, e.g. Google Gemini.** Create a key in Google AI Studio (https://aistudio.google.com), then set:

```
AI_PROVIDER   = openai
AI_BASE_URL   = https://generativelanguage.googleapis.com/v1beta/openai/
AI_API_KEY    = <your Gemini key>
AI_MODEL      = <a current Gemini model name, e.g. a "pro" model, from AI Studio>
AI_FAST_MODEL = <a current "flash" model name>
```

Free tiers have low request limits, and the free output may be used by the provider to improve its models. That's fine for testing, but check the terms before real students upload their notes.

Also:
- Leave `EMBEDDING_MODEL` unset. The tutor then finds passages by keyword search, which works well; you can add embeddings later (see the README).
- After changing any variable, redeploy (**Deploys → Trigger deploy**).

## Step 4: Connect logins to your site (Supabase)

1. In Supabase, go to **Authentication → URL Configuration**:
   - **Site URL:** `https://study-os-pk.netlify.app` (your address)
   - **Redirect URLs:** add `https://study-os-pk.netlify.app/**`
2. Optional but recommended: in **Authentication → Emails → Templates**:
   - **Confirm signup** template: change the link to
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
   - **Reset password** template: change the link to
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password`

**Email limit.** Supabase's built-in email sender sends only a few emails per hour, which is fine for testing. Before inviting real students, connect a free email service in **Authentication → Emails → SMTP settings**; Resend and Brevo both have free plans.

## Step 5: Try it and make yourself admin

1. Open your site, click **Get started**, and sign up with your email.
2. Click the link in the confirmation email. You'll land in onboarding; choose **Load demo workspace** to see the app filled with example data.
3. To make yourself admin, open Supabase **SQL Editor → New query** and run:
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'your@email.com');
   ```
   Reload the site; **Admin** now appears in the sidebar.

## Step 6: Install it on phones

- **Android (Chrome):** open your site, tap **⋮ → Install app** (or *Add to Home screen*).
- **iPhone (Safari):** open your site, tap **Share → Add to Home Screen**.

It opens full-screen with its own icon, like a normal app.

---

## If something goes wrong

| Problem | Fix |
| --- | --- |
| Build fails on Netlify | Open the deploy log. Usually an environment variable is missing or misspelled (the names are case-sensitive). |
| "Invalid API key" or login does nothing | Check the three Supabase variables, then redeploy. |
| Confirmation link opens `localhost` | The Site URL in Supabase (Step 4) is still the default. |
| AI features show an error | Check the AI variables; see **Admin → Errors** for the exact message. |
| Uploaded file stuck on "Processing" | It will be retried automatically every 10 minutes. Very large scanned PDFs can exceed the 60-second limit. |
| Site shows an error after a week of no use | The Supabase project paused. Open the Supabase dashboard and click **Restore project**. |

**Updating the app later.** Every push to the deployed branch redeploys automatically. If a change adds a new file in `supabase/migrations/`, run just that file in the SQL Editor. Don't re-run the whole `setup.sql` on a database that is already set up.
