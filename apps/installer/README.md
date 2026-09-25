# RPM Mobile MVP

Expo app for factory workers, installers, and operational administrators on iOS and Android. It uses the same Supabase project as the RPM web app and reads job data through scoped RPCs and designated storage buckets.

## Setup

1. Apply the RPM migrations, including `20260924050452_job_photo_categories.sql` and `20260924051417_mobile_admin_access.sql`, to the same environment as RPM.
2. In RPM Settings → Users, create an RPM Mobile worker and select their jobs, or choose Mobile Admin for all operational jobs. Hugo's existing Rodier Admin account can sign in without changing his web role. A manufacture-only job needs a client but no site; a site job links to an actual client site.
3. Copy `.env.example` to `.env` and use the project's Supabase URL and **publishable** key. Do not put a service role key in the app.
4. Run `npm ci`, then `npm start` from this directory. Open on an iOS or Android device. Camera and upload behavior need a physical device to verify.

## Standalone phone builds

The `preview` EAS profile makes an installable **RPM Mobile** app with its own home screen icon. It bundles the app, so installers do not need Expo Go or a running development server. Run EAS commands from `apps/installer` (the app root in this repository).

1. Sign in to an Expo account with access to the `rodier-rpm` organization using `npx eas-cli@latest login`. This existing app is linked in `app.json` to the RPM Mobile EAS project (`0c2cd86f-9144-43c4-b685-df9e6f9b4744`); do not create another starter project.
2. In that EAS project's **preview** environment, set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the intended RPM backend's URL and publishable key. These are client-visible values. Never use a Supabase service role key. Set the same variable names in the **production** environment before making store builds. The local `.env` file is ignored by Git and is not the source of truth for cloud builds.
3. Run `npx eas-cli@latest build --platform android --profile preview` to produce a signed APK and share its EAS installation link with Android installers. They may need to allow installation from their browser for this APK.
4. For iPhone installers, an Apple Developer Program team must sign the app. Register each iPhone with `npx eas-cli@latest device:create`, then run `npx eas-cli@latest build --platform ios --profile preview`. Share the resulting EAS link with the registered devices. TestFlight is another option when the team is ready to manage distribution through App Store Connect.

The `production` profile is reserved for later App Store / Google Play builds. It uses the same app identifiers (`nz.co.rpm.installer`) so signing, upgrades, and store records must be managed under the RPM team's accounts. Increment `ios.buildNumber` and `android.versionCode` for subsequent releases. This setup does not submit the app to either store.

`installer_workspace` returns only assigned active job fields, actual active sites, notes, permitted drawing metadata, uploaded photos, and the user's running timer. `mobile_admin_workspace` returns all operational jobs, material descriptions and quantities, job notes, and time entries without costs or prices. The mobile worker and mobile admin roles cannot select raw costing, quoting, or finance tables. A timer is exclusive per user across jobs and records travel and work separately. Photos are copied into app documents before upload and retried on app foreground, Home refresh, and manual retry. They remain queued if registration or upload fails. Photos belong to the job and default to Production for manufacture-only jobs or Installation for site jobs; Site Survey and Delivery are available when relevant.

Workers can delete only their own unpublished job photos in RPM Mobile. A super user can delete any job photo in the mobile job screen, search all jobs with photos in the mobile app, or delete it from the desktop job screen. Deletion removes the private photo file and job record. A separately published site gallery copy remains until managed from the site gallery.

On an approved or active job, **Materials used** lets field staff select an existing job material or enter an extra item, quantity, unit, and optional supplier. The entry is saved to `costing_material_actuals` and appears in the desktop job's Actuals tab. The mobile app never reads or enters unit costs; office staff can add costs and correct entries in RPM. This requires migration `20260925020034_mobile_material_used.sql` and a new phone build.

In the RPM web job detail, **Job photos & mobile** shows uploaded photos and recorded travel/work sessions. Only a reviewed copy of a site-linked photo can be published to a site's gallery.

Current limits: job documents are the site's construction drawings; there is no separate file model for a costing job yet. The new `installation_notes` field is separate from quote details and pricing. Uploaded installer photos appear on the assigned job; existing site photos are also shown.

