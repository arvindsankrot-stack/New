# Transformation Coach

A private, mobile-first PWA that works as a personal 12-month (extendable to 24-month) transformation coach and tracker. It covers fitness, nutrition, mobility, clinician-prescribed HRT tracking, feminization changes, relaxation/hypno, and private personal logs.

When you open it in the morning, it answers one question: **what do I need to do today?**

## Run it

```bash
npm install
npm run dev        # local development
npm test           # unit tests (domain logic + encrypted vault)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

### Install on iPhone

1. Deploy `dist/` to any static host with HTTPS, such as Cloudflare Pages, Netlify, Vercel or GitHub Pages. The app uses relative paths, so a sub-path works.
2. Open the site in Safari, tap **Share**, then **Add to Home Screen**.
3. Open it from the Home Screen icon, create a passcode, and allow notifications from **More → Reminders**.

## Privacy model

- **Local-first and encrypted.** Every record is encrypted with AES-256-GCM before it is written to IndexedDB. The key comes from the user's passcode (PBKDF2-SHA256, 600k iterations), cannot be extracted, and exists only in memory while the app is unlocked. Photos go in a separate encrypted blob store. They are downscaled, which removes EXIF and location data, and are decrypted only when viewed.
- **No server, no analytics, no third-party requests.** A strict Content-Security-Policy (`connect-src 'self'`) enforces this. Nothing sensitive goes in URLs, because navigation is in-memory state.
- **Sessions.** The app auto-locks after inactivity or time in the background (1–30 min, configurable). It covers its content in the app switcher, and it backs off after repeated wrong passcodes.
- **Export and delete.** You can download an encrypted backup that restores only with the passcode, export readable JSON (with a warning), import, change the passcode (all data is re-encrypted), or delete everything.
- The passcode cannot be recovered. If it is forgotten, the only option is to erase the data and restore from a backup.

## What's built

| Area | Features |
|---|---|
| **Today** (Home) | Day X / 365, month phase, START → CURRENT → TARGET, calories/protein, HRT checklist, adaptive workout, mobility, hypno, personal log, lab/check-in/weekly prompts, "Missed yesterday. Let's continue today." |
| **Track** | Food (≈60 common Indian foods, quick-add, morning-shake button, custom foods, macros, remaining targets), Body (new record per entry, history never overwritten, WHR, bust−underbust, in/cm), HRT day log with missed-dose notes, Hypno (timer, focus, mood before/after), Chastity (session log with safety alerts), Mobility and Pelvic floor |
| **Workout** | Months 1–3: 3 foundation sessions a week. From month 4: Glutes A / Upper / Mobility / Glutes B / Full body. Double-progression adapts reps, load and sets to logged performance. Session logger autosaves. Cardio log with a weekly target ramping to 150–210 min. |
| **HRT** | Clinician-entered regimen (medication, dose, unit, route, time, frequency, dates, clinician, notes), today / 7-day / 30-day adherence, lab results with charts, clinician-defined lab reminders, monthly feminization log with private fields |
| **Progress** | Charts (weight, waist, belly, hips, bust, underbust, WHR, protein, calories, workouts, adherence, hypno, flexibility) over 1M / 3M / 6M / 12M / all, with hover values and data tables. Weekly review (objective stats only), monthly report with next-month objectives, Month 0/3/6/9/12 checkpoint table, Month 13–24 recommendations generated from actual results |
| **More** | On-device coach, monthly check-in flow, encrypted progress photos (front/side/back plus consistency checklist), reminders, profile/goals/settings, privacy & data, guardrails |

### Calories

Calories use Mifflin–St Jeor. The sex constant is a user choice (average by default, since HRT shifts body composition). The target is a gentle deficit and is never set below BMR or 1400 kcal. A 3-week weight-trend fit **suggests** adjustments; it never applies them on its own. If waist is falling while weight is flat, no cut is suggested.

## Medical and safety guardrails

These rules are enforced in code (see `src/domain/hrt.ts`, `safety.ts` and `coach.ts`):

- **HRT:** nothing is prescribed, and no dose is ever raised, lowered or combined. Dose questions go to the clinician, and a missed dose never triggers a "double up" suggestion.
- **Labs:** results are flagged only against the reference range the user types in, always with "Discuss this result with your clinician."
- **Chastity:** pain, numbness, discolouration, swelling, skin injury or difficulty urinating triggers a prominent "remove and check" alert, and continuing the session is blocked.
- **Stretching and pelvic floor:** pain is never a progression metric.
- **Targets:** they are shown as directional goals, never guarantees. There are no streaks and no success score.
- **Hypno / mental conditioning:** tracking focuses on relaxation, identity, confidence, body acceptance and chosen submissiveness, and keeps the user's autonomy and consent intact.

## Code structure

```
src/
  db/          types.ts (data model; every record has id, user_id, date, created_at, updated_at)
               crypto.ts, vault.ts (encrypted IndexedDB), store.ts (reactive in-memory store)
  domain/      pure, tested logic: program, nutrition, hrt, body, reports, safety, coach, dates
  data/        Indian food database
  pages/       Home, Track (+ tabs), Workout, HRT, Progress, More (+ sub-pages)
  ui/          components, SVG charts, icons
  reminders.ts local reminder engine
public/        manifest, service worker, icons
```

### Extension points for later phases

- **Server sync or multi-device:** add an adapter at `persist()` in `store.ts`. Records already carry `user_id`, `created_at` and `updated_at` for last-write-wins merging, and `LOCAL_USER` would become the authenticated user id. Sync the vault ciphertext end-to-end so the server never sees plaintext.
- **Background push (iOS):** needs a push server (Web Push / VAPID). The notification preferences and neutral message text already exist in the `notifications` table.
- **AI coach:** swap `interpret()` in `domain/coach.ts` for an LLM call that returns the same `CoachAction` union. Every reply must keep the TRACKED FACT / ESTIMATE / GOAL / MEDICAL labels.
- **Adaptive programme:** `prescribe()` and `weeklySchedule()` in `domain/program.ts` are the only places the plan is decided.

## Limitations

- Reminders fire while the app is open or recently backgrounded. Reliable closed-app notifications on iOS need a push server.
- Data lives on one device. Download encrypted backups regularly.
- Food values are approximations of typical home servings.
