# Live-Jeans

A mobile-friendly jeans workshop app for lot-based cutting, karigar work and
monthly payments, party bills, deliveries, returns and ledgers.

## Current status

V14 is prepared for **Vercel hosting and a private Google Sheets database**.
The owner edits records; approved Google accounts have view-only access.
Google login and the Sheets connector still need configuration and live testing.
No business records are included in the website files.

**Automatic Vercel deployments are disabled** in `vercel.json`. Uploading this
repository does not authorise deployment. Enable deployment only when ready.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci
npm test
npm start
```

Open http://localhost:3000. Without private environment configuration, the app
shows the setup-required sign-in screen. Use the existing local app for daily
work until activation and backup migration have been verified.

## Setup and storage

- [Start here](START-HERE.md): readiness, migration and test coverage.
- [Setup guide](SETUP.md): Google sign-in, signed Sheets connector and Vercel settings.
- [.env.example](.env.example): environment-variable names; contains no credentials.

Keep `.env`, `.env.local`, credentials and business backups out of Git. Set real
secrets only in private project settings. Do not make the Google Sheet public.

The readable sheet tabs are regenerated reports. Edit records through the app;
keep separate downloaded backups. This is an online-first app, not a fully
offline system.
