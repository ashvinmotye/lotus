# Lotus v2

A mobile-first installable period and wellbeing tracker. Its records and backups stay on the device in plain JSON. The app works offline after first load. A separate push service stores only anonymous device subscriptions so reminders can arrive while the PWA is closed.

## What's changed

- Keeps the Lotus look, screens, check-in fields and 10:00–22:00 two-hourly reminders.
- Removes routine login, master password, encrypted storage, Supabase account and health-data sync.
- Adds optional urine LH result, cervical mucus and user-supplied ovulation date/source. Current-cycle predictions update when these change and remain labeled as estimates.
- Exports/restores an unencrypted JSON backup. Existing encrypted Lotus backups can be imported once with the old password.
- If the app is installed on the **same origin** as v1.1.0, first launch offers a one-time import of the existing local vault using the old password. It leaves the old encrypted vault in place for rollback.
- After import, turn reminders on again in Settings. The migration attempts to unsubscribe the old device registration so old and new schedules do not both notify it.

## Preview the tracker locally

Serve this folder from localhost (for example, `python3 -m http.server 8080`) and open `http://localhost:8080`. Localhost is a secure context for Web Crypto and service workers. Create a profile, save a check-in, use the calendar and export a backup. Push registration requires the deployment steps below; localhost is not included in the production origin allowlist.

## Deploy without interrupting the old Lotus

1. Host the files at the intended HTTPS origin. If replacing v1, keep the **same origin** so the migration screen can read its old IndexedDB vault. A different origin cannot access that vault; use an exported old encrypted backup instead.
   When updating an installed v1 PWA, refresh or close/reopen it once more after the new service worker activates. **Do not uninstall the old PWA to clear its cache before importing**, since uninstalling can remove the local records that migration needs.
2. In Supabase Edge Function secrets, configure `LOTUS_APP_ORIGIN` as the app's exact origin, such as `https://lotus.example.com`. Retain the existing `LOTUS_VAPID_PUBLIC_KEY`, `LOTUS_VAPID_PRIVATE_KEY`, `LOTUS_VAPID_SUBJECT` and `LOTUS_CRON_SECRET` values. The Edge runtime needs `SUPABASE_URL` and either `SUPABASE_SECRET_KEY` or the existing `SUPABASE_SERVICE_ROLE_KEY` server-side. **Never** place the private key, server key or cron secret in `config.js`.
3. Deploy `supabase/functions/lotus-push-register-v2` and `supabase/functions/lotus-push-send-v2` as separate Edge Functions. Set **Verify JWT = off** for both. The register endpoint checks the exact allowed origin and a random per-device secret for updates/deletes; the sender checks `x-cron-secret`.
4. In the Supabase SQL editor, run `supabase/setup.sql`. It creates the push-only table, a slot-claim function, and a 15-minute cron job. It expects the existing Supabase Vault secrets `lotus_project_url`, `lotus_service_role_key` and `lotus_cron_secret` from the earlier Lotus deployment; create them in the Vault if they do not yet exist. Set up `pg_cron` and `pg_net` extensions. Check the job's next invocation and Edge Function response (`ok: true`).
5. `config.js` contains only the public Supabase project URL and public VAPID key copied from v1. Edit these public values if deploying to a different project or rotating keys.
6. Install/open Lotus on the device, go to **Settings → Reminders**, enable notifications, and use **Test this device**. The 10/12/14/16/18/20/22 reminders are sent in the timezone captured on this device at registration. If you change timezone, turn reminders off and back on to update it.
7. At the v1-to-v2 cutover, disable the **old** Lotus push cron job so the same existing subscription does not receive duplicate reminders. Do this only when v2 push has been verified. The old vault and old push table need not be deleted for the new app to work.

The sender and registration function use a new `lotus_push_v2` table; neither function receives tracker entries or backups. The registration function is public for new devices, so keep its origin allowlist accurate and monitor unexpected registration volume if you use it beyond a personal installation.

## Notes on estimates and storage

Calendar estimates use up to eight completed cycles. A positive LH test revises the **possible** current-cycle ovulation range by roughly 1–2 days after the test; it does not confirm ovulation. Watery or clear/stretchy mucus marks possible fertile signs. A clinician-provided date can anchor a retrospective estimate. The next period is shown as a range when a current-cycle observation exists. Do not use these estimates as contraception.

Medical basis for the labels and broad timing: [ASRM fertility evaluation](https://www.asrm.org/practice-guidance/practice-committee-documents/fertility-evaluation-of-infertile-women-a-committee-opinion-2021/), [ASRM optimizing natural fertility](https://www.asrm.org/practice-guidance/practice-committee-documents/optimizing-natural-fertility-a-committee-opinion-2021/), and [ASRM luteal-phase guidance](https://www.asrm.org/practice-guidance/practice-committee-documents/diagnosis-and-treatment-of-luteal-phase-deciency-a-committee-opinion/). The specific Lotus algorithm is a product estimate, not a clinically validated ovulation test.

Backups are readable JSON. They omit the device's push credentials; restoring a backup preserves this device's existing reminder registration. Because records are not encrypted, anyone with access to the browser's data or an exported backup can read them.
