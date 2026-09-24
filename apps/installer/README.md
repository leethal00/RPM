# RPM Install mobile MVP

Expo app for installer accounts on iOS and Android. It uses the same Supabase project as the RPM web app, but only calls the restricted `installer_*` RPCs and designated storage buckets.

## Setup

1. Apply `supabase/migrations/20260924030920_installer_mobile_mvp.sql` to the same environment as RPM.
2. In RPM Settings → Users, create an Installer user and select their assigned jobs. Add mobile installation notes on each job card.
3. Copy `.env.example` to `.env` and use the project's Supabase URL and **publishable** key. Do not put a service role key in the app.
4. Run `npm ci`, then `npm start` from this directory. Open on an iOS or Android device. Camera and upload behavior need a physical device to verify.

`installer_workspace` returns only assigned active job fields, all active sites, notes, permitted drawing metadata, uploaded photos, and the user's running timer. The installer role cannot select raw costing, quoting, or finance tables. A timer is exclusive per user across jobs and records travel and work separately. Photos are copied into app documents before upload and retried on app foreground, Home refresh, and manual retry. They remain queued if registration or upload fails.

In the RPM web job detail, the **Install** tab shows uploaded photos and recorded travel/work sessions.

Current limits: job documents are the site's construction drawings; there is no separate file model for a costing job yet. The new `installation_notes` field is separate from quote details and pricing. Uploaded installer photos appear on the assigned job; existing site photos are also shown.
