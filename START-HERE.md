# V14: Vercel + Google Sheets

**Prepared locally. Not deployed. No business records have been uploaded.**

This project keeps the V13 mobile layout and adds Google sign-in, owner-only
editing, approved viewers, private Sheets storage, conflict detection and
five previous saved versions. Your current local app remains unchanged.

## What is ready

- The owner can add work, record payments, edit lots, close months and restore backups.
- Approved viewers can see ALL workshop records, including wages and party balances,
  and print statements. They cannot save changes or manage backups.
- Unknown accounts are denied. Each request checks the current approved email list.
- The website files contain no imported workbook records or earnings archive.
- Only the owner's unsaved changes are retained in browser storage for recovery.
  Viewers' loaded records are kept in memory, not persistently cached by this app.
- A failed save shows Retry / Download my changes. A conflicting version requires
  downloading pending changes before loading the latest records; no automatic merge.
- Refresh records loads another device's newer version. No constant polling consumes
  the shared Google request allowance.

## What is still needed before activation

1. A suitable Vercel plan for business use. Hobby is restricted to non-commercial use.
2. A Google OAuth Web application client ID and secret for sign-in.
3. The email addresses of approved viewers (Google accounts). The configured owner
   is `mohdsaad.work3@gmail.com`; verify this is the intended owner.
4. A one-time Google Apps Script connector deployment and its private signing secret.
5. The latest backup from your existing app, imported only after live checks pass.

**Do not paste client secrets, signing secrets or passwords into chat.**
Enter them in your own Google/Vercel project settings when activation is authorised.

## Before migration

Keep using V13 for current work. Export Settings → Backups → Download backup.
V14 is a server-based project: opening public/index.html directly does not activate it.
The previous V11 Apps Script UI package is not used by this Vercel version.

The existing database spreadsheet is:
https://docs.google.com/spreadsheets/d/1LTKFqQWC4byI-tqCP8ssmgOlYyIKN7_8IDy5go0yFnA/edit

It must remain private. Staff receive access to the app, not edit access to the Sheet.

## Validation completed

- Server tests: signed sessions, expiration/tampering, revoked users, viewer write
  rejection, request-origin checks, Google login state/nonce/PKCE with mocked Google
  responses, signed Sheets requests and safe connection errors.
- Connector tests: signatures, owner/viewer roles, expired requests, atomic commit
  failures, stale-version rejection, idempotent retries, backups and salary locks.
- Isolated Chrome tests: owner save/retry/reload, viewer controls, read-only lot
  details, no persistent viewer cache, setup gate and no private-source exposure.
- Google's official sign-in dependency was installed and locked.

Live Google login, the Apps Script deployment, real Sheets writes, Vercel runtime,
and a 30-user load test remain to be verified after configuration. These local tests
do not prove live integration. The app is online-first, not a full offline app.

See SETUP.md for the exact activation steps. Do not activate until you decide to deploy.
