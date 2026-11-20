# Cleanup — personal data removal assistant

A private, single-user web app that helps you find things you posted online in the past (photos, comments, profiles, your address or phone number), decide what should go, send removal requests **in your own name**, and keep checking until each item is actually gone.

It runs on your own machine (or your own private server). Nothing is sent anywhere without you clicking **Send**.

## How it works

| Step | What happens |
|---|---|
| 1. Seeds | You add old usernames, email addresses, phone numbers, name variants and a few reference photos of your own face. |
| 2. Account discovery | You connect one or more Gmail accounts. The app reads sign-up / welcome / verification emails (read-only) and lists the sites where you had accounts, with the username when it can find it. |
| 3. Search | For each seed and discovered account it queries Google Programmable Search and/or Brave Search, runs site-specific queries (Reddit first, via Reddit's official API), and can run a FaceCheck.ID face search with your own photos. Results from Google Lens / PimEyes / Bing that you run yourself can be pasted in. |
| 4. Face match | Optional local step (face_recognition / dlib): every image found is compared with your reference faces and gets a match score. |
| 5. Classify | Each finding is labelled mine / not mine / unsure, type (photo, comment, post, profile, address, contact) and risk (high / medium / low), with a short reason — by Claude if you add an API key, otherwise by local rules. |
| 6. Review | A dashboard lists findings, highest risk first, filterable by site, risk, type and ownership. You click **Remove** or **Keep**. |
| 7. Removal | For each Remove item the app suggests routes and drafts the request: delete it yourself, subreddit moderator message, platform privacy/support request, DPDP Act 2023 erasure request to the Grievance Officer, GDPR Art. 17 request, or Google "Refresh Outdated Content". You edit the draft, pick a Gmail account and click Send. |
| 8. Tracking | Each request is Draft → Sent → Acknowledged → Removed / Rejected. Every 3 days the app re-checks sent items, notices replies in the Gmail thread, drafts a polite follow-up after 15 days with no reply (you still review and send it), and marks an item **Removed** only when the page returns 404/410 or the content is no longer on it. When a page from Google results is gone it drafts a Google refresh request. |

## Ground rules built into the code

- **Never auto-sends.** The only code path that sends email is the Send button, which also requires ticking "I have reviewed this message". The scheduler only re-checks and drafts.
- **Your own name only.** Templates are written as a private individual. Sending is blocked if the text contains wording that could read as a legal threat or a claim to be a lawyer ("lawyer", "attorney", "legal action", "court", "police", …).
- **ID documents**: only a masked Aadhaar can be stored (you must confirm it is masked). It is attached only if you tick both "the site explicitly asked for proof of identity" and "I confirm attaching this document".
- **No logins, no CAPTCHA solving, no scraping that breaks terms.** Search goes through official APIs (Google, Brave, Reddit, FaceCheck). The few pages the app fetches itself (re-checks, candidate images) are fetched only if the site's `robots.txt` allows it, with an honest User-Agent. If robots.txt forbids it, the item is flagged for you to check by hand.
- **Your face only.** Reference faces come only from photos you upload and confirm as your own; there is no way to search for someone else's face. Face encodings are stored encrypted; candidate images are scored in memory and discarded.
- **Removed means removed.** You can mark a request Acknowledged or Rejected yourself, but not Removed — only a check that finds the content gone can do that.

## Security

- Single user: a strong password (argon2) **and** TOTP two-factor authentication, set up on first visit. Failed logins are rate-limited.
- The whole database is encrypted with **SQLCipher** (`DB_KEY`). Uploaded photos and documents are encrypted on disk with a separate key (`FILE_KEY`), and Gmail tokens and the TOTP secret are encrypted again inside the database.
- Gmail scopes are exactly `gmail.readonly` and `gmail.send`.
- Same-origin check on every state-changing request, strict Content-Security-Policy, no third-party scripts (htmx is served locally).
- **Settings → Wipe everything** (needs your password + a TOTP code) revokes every Gmail token with Google, then deletes the database and every stored file.
- Docker Compose binds to `127.0.0.1` only. If you run it on a server, put it behind HTTPS (Caddy, nginx) and set `BASE_URL=https://…` and `SECURE_COOKIES=true`.
- Back up your `.env`: if you lose `DB_KEY` / `FILE_KEY` the data cannot be recovered (that is the point).
- Thumbnails on the review page load directly from the sites where they were found, so those sites see your IP address (no referrer is sent).

## Setup

### 1. Generate secrets

```bash
cp .env.example .env
python3 -c "import secrets; print('DB_KEY=' + secrets.token_urlsafe(32))" >> .env
python3 -c "import base64, os; print('FILE_KEY=' + base64.urlsafe_b64encode(os.urandom(32)).decode())" >> .env
python3 -c "import secrets; print('SESSION_SECRET=' + secrets.token_urlsafe(32))" >> .env
```

Then delete the empty `DB_KEY=`, `FILE_KEY=` and `SESSION_SECRET=` lines near the top of `.env`, so each appears once.

### 2. Google Cloud OAuth credentials (Gmail)

1. Go to <https://console.cloud.google.com/>, create a project (e.g. "cleanup-personal").
2. **APIs & Services → Library**: enable the **Gmail API**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform): user type **External**, app name "Cleanup", your email as support and developer contact. Add the scopes `.../auth/gmail.readonly` and `.../auth/gmail.send`. Leave the app in **Testing** and add each Gmail address you want to connect as a **test user**.
4. **Credentials → Create credentials → OAuth client ID**, type **Web application**. Authorised redirect URI: `http://localhost:8000/accounts/gmail/callback` (or `https://your-host/accounts/gmail/callback` — it must match `BASE_URL`).
5. Put the client ID and secret in `.env` as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

While the app is in Testing mode Google expires refresh tokens after about 7 days; reconnect the account from the Accounts page when that happens. Publishing an app that uses Gmail's restricted scopes requires Google's verification and security assessment, which isn't worth it for one person.

### 3. Search API keys (at least one web search provider)

**Google Programmable Search (Custom Search JSON API)**
1. Create a search engine at <https://programmablesearchengine.google.com/> and turn on **Search the entire web**. Copy the **Search engine ID** → `GOOGLE_CSE_CX`.
2. In the same Google Cloud project, enable the **Custom Search API**, then **Credentials → Create credentials → API key**. Restrict the key to the Custom Search API → `GOOGLE_CSE_KEY`.
3. The free tier is 100 queries/day. Google has been restricting this API for new customers; if your project can't get access, use Brave below.

**Brave Search API** (alternative or addition): create a key at <https://api-dashboard.search.brave.com/> → `BRAVE_API_KEY`.

**Reddit** (recommended — lists every comment and post of your old usernames): at <https://www.reddit.com/prefs/apps> create an app of type **script**, then copy the client ID (under the app name) and secret → `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`. The app uses app-only OAuth; it never logs in as you.

**FaceCheck.ID** (optional face search): get an API token from FaceCheck.ID → `FACECHECK_API_TOKEN`. Leave `FACECHECK_TESTING_MODE=true` to try it without spending credits (it returns sample results), then set it to `false`. Check their current API docs; the endpoints are in `app/services/face.py`.

**Classifier** (optional): an Anthropic API key → `ANTHROPIC_API_KEY`. Only the finding's URL, title and snippet, your usernames and name variants, and yes/no flags for "your email/phone appears here" are sent — never the email or phone number itself. Without a key, local rules are used.

### 4. Run

With Docker:

```bash
docker compose up --build            # without local face matching
WITH_FACE=true docker compose up --build   # with face matching (builds dlib, ~10 min)
```

Without Docker (Python 3.12+; on ARM Linux install `libsqlcipher-dev` first):

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt          # add -r requirements-face.txt for face matching (needs cmake)
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Open <http://localhost:8000>, choose a password and scan the 2FA QR code.

## Using it

1. **Seeds** — add usernames, emails, phone numbers and name variants (one per line). Upload 2–3 clear photos of your face. Fill in "Your details for requests" (name, optionally postal address).
2. **Accounts** — connect each Gmail account and click **Scan for sign-ups**. Fix usernames and mark which accounts still exist.
3. **Dashboard** — run **Search**, then **Face-match** (if installed), then **Classify**. For Google Lens / PimEyes / Bing: run the search yourself, paste the result links under **Seeds → Import face / reverse-image results**, then face-match.
4. **Review** — work through the list, highest risk first. Click Remove or Keep.
5. On a Remove finding, pick a route and **Draft**. Check the recipient: add missing privacy / Grievance Officer addresses on the **Sites** page (taken from the site's privacy policy). Edit the text, choose the Gmail account, tick the review box, **Send**. For self-delete, subreddit and web-form routes, do the step yourself and click **Mark as sent**.
6. **Requests** — watch statuses. Follow-up drafts appear after 15 days with no reply.

### About the legal templates

- **DPDP Act 2023** (India): the request cites the right to erasure (Section 12) and withdrawal of consent (Section 6(4)) and goes to the site's Grievance Officer. The DPDP Rules, 2025 phase in most obligations over 18 months from November 2025, so a site may not yet be legally required to act on it; it is still a clear, reasonable request.
- **GDPR Art. 17** applies to services established in the EU or offering services to people in the EU.
- These are plain requests from an individual, not legal advice.

## Development

```bash
pip install -r requirements-dev.txt
pytest
```

Layout:

```
app/
  main.py              FastAPI app, security middleware, scheduler startup
  config.py            settings from .env
  db.py                SQLCipher engine + models
  auth.py              password + TOTP
  crypto.py            Fernet file/token encryption
  site_directory.py    starter site contacts (editable in the UI)
  routes/              auth, core (seeds/accounts/jobs/docs/sites/settings), review (findings/requests)
  services/
    gmail.py           OAuth, sign-up scan, send, reply detection, token revocation
    search.py          Google CSE, Brave, Reddit API
    face.py            reference enrolment, local face match, FaceCheck, manual import
    classifier.py      Claude or rule-based labelling
    removal.py         route selection + drafting
    tracker.py         re-checks, Removed detection, follow-up drafts
    http.py            robots.txt-respecting fetcher
    jobs.py            background jobs + scheduler
    wipe.py            wipe everything
  templates/removal/   request templates (plain text, editable)
tests/
```
