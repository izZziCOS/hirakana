# Sync server

A Cloudflare Worker that lets Kana Dojo keep the same progress on several devices. It stores one blob per sync code in
a D1 database and never sees the code or the progress itself.

## How it works

- Turning on sync creates a random 24-character code (120 bits). The browser derives two things from it with HKDF:
  the id the blob is stored under, and an AES-GCM key.
- The browser gzips and encrypts its progress before uploading it. The server only gets the id and the ciphertext.
- Each sync downloads the blob, merges it with the local progress (`src/merge.ts`) and uploads the result. Uploads
  carry the version they were based on (`If-Match`). If another device uploaded in between, the server answers 412 and
  the browser starts again.
- Progress that no device has synced for 400 days is deleted by a daily cron job.

| Request                | Response                                                             |
| ---------------------- | -------------------------------------------------------------------- |
| `GET /v1/progress/:id` | 200 with the blob and its `ETag`, or 404                             |
| `PUT /v1/progress/:id` | 204 with the new `ETag`; needs `If-Match: "n"` or `If-None-Match: *` |
|                        | 412 if the blob changed, 413 over 2 MB, 428 without a precondition   |

## Deploying

You need a Cloudflare account; the free plan is enough.

```sh
cd worker
npx wrangler login
npx wrangler d1 create kana-dojo-sync      # copy the database_id it prints into wrangler.toml
npx wrangler d1 execute kana-dojo-sync --remote --file schema.sql
npx wrangler deploy                        # prints the URL, e.g. https://kana-dojo-sync.you.workers.dev
```

Set `ALLOWED_ORIGIN` in `wrangler.toml` to your site's origin (for example `https://you.github.io`) to stop other sites
from using your server.

Then build the site with the server's URL. The **Sync between devices** section in Settings only appears when it is
set, and the build adds the server to the page's Content-Security-Policy.

- **GitHub Pages:** add a repository variable `SYNC_URL` (Settings → Secrets and variables → Actions → Variables).
- **Locally or Docker:** `SYNC_URL=https://kana-dojo-sync.you.workers.dev npm run build`.

To run the server locally, use `npx wrangler d1 execute kana-dojo-sync --local --file schema.sql` and
`npx wrangler dev`, then build the site with `SYNC_URL=http://localhost:8787`.

## Tests

`test/sync.test.ts` runs the handler with an in-memory store and the D1 queries against SQLite (`node:sqlite`).
`e2e/sync.spec.ts` pairs two browsers through a sync link, with Playwright answering requests using the same handler.
