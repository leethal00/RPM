# RPM Mobile MVP

Expo app for factory and installation workers on iOS and Android. It uses the same Supabase project as the RPM web app, but only calls the restricted `installer_*` RPCs and designated storage buckets.

## Setup

1. Apply the RPM migrations, including `20260924043403_job_photo_categories.sql`, to the same environment as RPM.
2. In RPM Settings → Users, create an RPM Mobile worker and select their jobs. A manufacture-only job needs a client but no site; a site job links to an actual client site.
3. Copy `.env.example` to `.env` and use the project's Supabase URL and **publishable** key. Do not put a service role key in the app.
4. Run `npm ci`, then `npm start` from this directory. Open on an iOS or Android device. Camera and upload behavior need a physical device to verify.

## Standalone phone builds

The `preview` EAS profile makes an installable **RPM Mobile** app with its own home screen icon. It bundles the app, so installers do not need Expo Go or a running development server. Run EAS commands from `apps/installer` (the app root in this repository).

1. Sign in to the RPM team's Expo account with `npx eas-cli@latest login`, then link this app to an EAS project with `npx eas-cli@latest init`. Keep the generated `extra.eas.projectId` in `app.json` and commit it.
2. In that EAS project's **preview** environment, set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the intended RPM backend's URL and publishable key. These are client-visible values. Never use a Supabase service role key. Set the same variable names in the **production** environment before making store builds. The local `.env` file is ignored by Git and is not the source of truth for cloud builds.
3. Run `npx eas-cli@latest build --platform android --profile preview` to produce a signed APK and share its EAS installation link with Android installers. They may need to allow installation from their browser for this APK.
4. For iPhone installers, an Apple Developer Program team must sign the app. Register each iPhone with `npx eas-cli@latest device:create`, then run `npx eas-cli@latest build --platform ios --profile preview`. Share the resulting EAS link with the registered devices. TestFlight is another option when the team is ready to manage distribution through App Store Connect.

The `production` profile is reserved for later App Store / Google Play builds. It uses the same app identifiers (`nz.co.rpm.installer`) so signing, upgrades, and store records must be managed under the RPM team's accounts. Increment `ios.buildNumber` and `android.versionCode` for subsequent releases. This setup does not submit the app to either store.

`installer_workspace` returns only assigned active job fields, actual active sites, notes, permitted drawing metadata, uploaded photos, and the user's running timer. The mobile worker uses the restricted `installer` database role and cannot select raw costing, quoting, or finance tables. A timer is exclusive per user across jobs and records travel and work separately. Photos are copied into app documents before upload and retried on app foreground, Home refresh, and manual retry. They remain queued if registration or upload fails. Photos belong to the job and default to Production for manufacture-only jobs or Installation for site jobs; Site Survey and Delivery are available when relevant.

In the RPM web job detail, **Job photos & mobile** shows uploaded photos and recorded travel/work sessions. Only a reviewed copy of a site-linked photo can be published to a site's gallery.

Current limits: job documents are the site's construction drawings; there is no separate file model for a costing job yet. The new `installation_notes` field is separate from quote details and pricing. Uploaded installer photos appear on the assigned job; existing site photos are also shown.
