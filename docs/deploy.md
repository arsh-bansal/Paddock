# Hosting Paddock

Paddock is one container: the Express server serves the built web app and the API. The repo has a
`Dockerfile`, so any container host works. Two tested-by-design options below.

**Before you deploy**
- Rotate the Gemini key if it has ever been shown on screen, and keep it out of git.
- Run `npm run snapshot` and commit `data/snapshot/` so the six preset districts load instantly and
  never call Open-Meteo. Other locations are fetched live and cached on the instance's temporary disk.
- Open-Meteo's free API is for non-commercial use with daily limits; fine for a hackathon demo.
  Check their terms before any commercial use.

## Option A: Google Cloud Run (recommended)

Fast cold starts, scales to zero, has a free tier (check current pricing), and runs in Melbourne
(`australia-southeast2`). You already use Google for Gemini.

```bash
# one-off setup (install the gcloud CLI first)
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com

# store the Gemini key as a secret (paste the key, then Ctrl-D)
gcloud secrets create gemini-api-key --data-file=-

# deploy from the repo root (builds the Dockerfile in Cloud Build)
gcloud run deploy paddock \
  --source . \
  --region australia-southeast2 \
  --allow-unauthenticated \
  --set-secrets GEMINI_API_KEY=gemini-api-key:latest \
  --memory 1Gi \
  --max-instances 3
```

The first deploy may ask you to grant the Cloud Run service account access to the secret
(`roles/secretmanager.secretAccessor`); accept or run the command it prints. It prints a
`https://paddock-….run.app` URL when done. Redeploy after changes with the same `gcloud run deploy`.

`--max-instances 3` caps cost if the link gets shared widely. Optionally add
`--min-instances 1` on demo day so the first judge never waits for a cold start (this costs a little
while it's on).

## Option B: Render (no CLI)

1. render.com → New → Web Service → connect the GitHub repo.
2. Runtime: **Docker** (it finds the `Dockerfile`).
3. Environment: add `GEMINI_API_KEY`.
4. Health check path: `/api/health`.

Render's free plan sleeps when idle, so the first visit after a quiet spell is slow. For demo day,
use a paid instance or open the link a few minutes before presenting.

## Checking a deployment

- `https://YOUR-URL/api/health` → `{"ok":true,"ai":true}` (`ai:false` means the Gemini key isn't set).
- Pick each preset district; all six should load instantly from the snapshot.
- Download a PDF and save a report; both run in the browser.

## How the container behaves

- `PORT` comes from the platform (defaults to 8080 in the image); `NODE_ENV=production`.
- Runtime cache: `PADDOCK_CACHE_DIR=/tmp/paddock-cache` (temporary disk), plus an in-memory cache
  capped at 20 locations.
- Shuts down cleanly on `SIGTERM` (finishes in-flight requests, force-exits after 10 s).
- Rate limits: 30 climate requests and 12 AI requests per minute per visitor.

## Gemini reliability

Gemini sometimes answers `503 UNAVAILABLE: This model is currently experiencing high demand`. The
server retries twice (after 0.8 s and 2 s), and the last try uses a lighter model
(`GEMINI_FALLBACK_MODEL`, default `gemini-flash-lite-latest`). Over-long or slightly malformed replies
are trimmed rather than rejected, and empty replies are retried. If it still fails, the app says "The
AI is busy right now. Try again in a few seconds." Check what happened with:

```bash
gcloud run services logs read paddock --region australia-southeast2 --limit 50 | grep -i gemini
```

Keys on a paid (billing-enabled) tier are generally prioritised over free-tier keys under load.
