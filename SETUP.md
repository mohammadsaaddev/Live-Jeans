# Activation guide — perform only when ready to deploy

## Architecture

Phone/computer → Vercel app → signed Vercel server request → Google Apps Script
connector → private Google Sheet.

Apps Script supplies a shared lock so simultaneous requests from separate Vercel
servers cannot overwrite each other. It performs one atomic Sheets batch containing
the state, revision, previous version and readable record tabs. Sheets remains the
database; no additional database is required.

## 1. Prepare Google sign-in

In Google Cloud Console, configure the OAuth consent screen and create an OAuth
client of type Web application. Request only openid, email and profile for login.
Add the eventual exact callback URL: `https://YOUR-APP/api/callback`.
If the OAuth app is in Testing status, add the owner and viewers as test users.
Google consent-screen publication requirements should be checked before rollout.

## 2. Prepare the Sheets connector

Create a NEW Apps Script project. Paste google-sheets/Code.gs and Validation.gs
into Script files. Enable showing the manifest in Project Settings, and replace
appsscript.json with the supplied manifest (enables the advanced Sheets service).
Check DATABASE_ID and OWNER_EMAIL in Code.gs match your spreadsheet and owner.

Generate two different random secrets of at least 32 random bytes. Example local
command, run twice: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
Keep them out of source control. One is SESSION_SECRET; the other is BRIDGE_SECRET.

Set BRIDGE_SECRET in Apps Script → Project Settings → Script Properties.
Deploy this connector as a Web app, executing as the owner, reachable by Anyone.
This makes the CONNECTOR URL reachable, not the Google Sheet public. Every request
must carry a valid HMAC signature and recent timestamp; unsigned requests are denied.
Only the Vercel server knows the signing secret. Never embed it in frontend JavaScript.
Approve the connector's Sheets permission yourself. Copy its /exec URL.

Use this single connector deployment for this database: multiple separate script
projects would have separate locks and would not protect one another.

## 3. Configure Vercel

Import the V14 project root (the folder containing package.json and vercel.json),
not public/ alone. Use framework Other, no build command, output directory public.
Root api/index.mjs supplies the Node.js function; /api/* rewrites route to it.

Enter private environment values from .env.example:

- APP_ORIGIN: exact HTTPS site origin, with no trailing slash.
- GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET: the Google OAuth client credentials.
- OWNER_EMAIL: owner Google email, matching Code.gs.
- VIEWER_EMAILS: comma-separated approved Google account emails; blank denies all viewers.
- SESSION_SECRET and BRIDGE_SECRET: the separate generated secrets.
- SHEETS_BRIDGE_URL: Apps Script /exec URL.

Do not give these variables NEXT_PUBLIC_ or VITE_ prefixes. Do not put them in public/.
Do not commit .env files or share the spreadsheet with Anyone.
Changing viewer emails in Vercel requires redeploying the updated environment;
the changed server allowlist then applies to existing sessions on their next request.

## 4. Check before importing business records

Sign in as owner; confirm the empty-database message. Sign in as an approved viewer
and an unapproved account in separate browser profiles. Verify writes are denied.
Use a disposable test spreadsheet/deployment first for a complete save, failed-save,
closed-month and two-owner-device conflict test. Do not use fabricated records in
the production database.

Then the owner selects the latest real app backup in the empty-database banner.
Wait for Saved to Google Sheets. Reload and reconcile worker counts, lot counts,
monthly earnings/payments and party balances against the original app.
Only after this should the team start using the shared link.

## Daily use and limits

The readable tabs are reports regenerated on save; manual changes to those tabs
do not update the app. Hidden _State is the authoritative compressed database;
_Backups contains the five previous saved versions. Do not edit either directly.
The connector is compatible with the prepared V11 Sheet structure, but do not run
old and new apps concurrently against it.

Everyone with view access can read all workshop records. Per-karigar private views
are not included. View-only does not prevent screenshots or copying visible data.

All requests through the connector share the owner's Google quotas. Thirty approved
accounts are not a guarantee of thirty simultaneous actions. Use Refresh when needed;
live load testing is still required. Reads, saves and backups use a shared lock.

The request limit is 2 MB of JSON; compressed state is capped at 1.5 million
characters. Google cell/request limits may be reached sooner for unusually large
individual records. A rejected save keeps the prior committed state and leaves the
owner's pending changes available to download. Download separate backups regularly.

## Local preview (no deployment)

Node.js 22+ is required. Run `npm ci`, then `npm test`. For a preview, run `npm start`
and visit http://localhost:3000. Without credentials it shows a setup-required gate.
For local Google login testing, set APP_ORIGIN=http://localhost:3000,
ALLOW_LOCAL_HTTP=true, add the corresponding callback URL in Google Cloud and load
private environment values into the process. Node can load a local file with
`node --env-file=.env.local server/local.mjs`. Never enable local HTTP for production.

## Reference documentation

- https://vercel.com/docs/functions/runtimes/node-js
- https://developers.google.com/identity/openid-connect/openid-connect
- https://developers.google.com/apps-script/guides/web
- https://developers.google.com/apps-script/reference/lock/lock-service
- https://developers.google.com/workspace/sheets/api/limits
