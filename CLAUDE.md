# دفتر البيت — Daftar Al-Bait

Arabic (RTL) household app: tasks + shopping lists, shared by a family, used mostly on phones (Android Chrome / Samsung Internet, iPhone Safari) as an installed web app.

## Stack & deploy
- Single static page: `index.html` (all CSS + JS inline, no build step, no framework). Plus `config.js`, `manifest.webmanifest`, `_headers`, icons.
- Hosting: Cloudflare Pages, auto-deploys every push to `main` (~1–2 min) → https://daftar-albait.pages.dev
- Backend: Firebase (loaded as ES modules from `https://www.gstatic.com/firebasejs/<sdkVersion>/…`):
  - Auth: Google sign-in (popup, redirect fallback).
  - Firestore: shared data; access limited by Firestore security rules (family email allow-list, managed in the Firebase console — not in this repo).
  - Firebase AI Logic (Gemini) + App Check: wired in code, **not enabled yet** by the owner (`appCheckSiteKey` empty). Inbox items fall back to manual classification.
- `config.js` holds the owner's Firebase config. **Never overwrite or reformat it** unless explicitly asked.

## Data model (Firestore)
- `items/{id}`: `{title, cat, date|null, pin, done, doneAt|null, priority:"normal"|"urgent", recur:{n,unit}|null, createdAt, aiCat?, ev?}`
  - Only the supermarket (`super`, see `usesTrip`) has one shared list date in `config/trips`; its items follow it unless `pin:true` (own date). The date is dropped once nothing follows it, so the next item starts undated.
  - Every other shop category dates each item (`date`, `pin:false`); no list date. Old non-super trips are moved onto their items once (`migrateTrips`).
  - A shop date in the past is ignored → remaining items become undated (`effDate`).
  - Bought shop items stay on the calendar on the day bought (`doneAt`) for 365 days, then are swept.
- `config/categories`: `{list:[{id,name,kind:"shop"|"task",color,kw:[]}]}` (absent → `DEFAULT_CATS` in code).
- `config/trips`: `{<catId>: "YYYY-MM-DD"}`.
- `config/events`: `{list:[{id,name,emoji,createdAt}]}` — المناسبات. An event is a tag (`item.ev`), never a category: tagged items stay in their store/tasks as usual. Adding from the dock while an event is open tags the new item. Ending an event deletes it and clears `ev` on its items.
- `history/recent`: `{items:{<normalizedName>:{t,c,n,d}}}` — purchase history for entry suggestions (365 days). Written with merge.
- Loading: open items (`done==false`) live; done items only from the earliest visible calendar day (`ensureDoneFrom`) to save free-tier reads.

## UX decisions already made by the owner (keep them)
- Tabs order: الرئيسية، المشتريات، المهام، المناسبات، الوارد، التصنيفات. Badge counts on tabs. Swipe sideways switches tabs; pull-to-refresh is off.
- Tasks tab: one flat list (no category grouping); each task has its own date.
- Priority `"urgent"` is labelled «مهم» in the UI (value unchanged).
- Events tab: «مناسبة جديدة» always on top; each event is one box (tinted header with emoji, name, progress; chevron like the store groups) that opens in place with its items inside, grouped by category. One box open at a time (the entry bar adds to it); items show their dates as in shopping; undated items get a «+ تاريخ» button; «إضافة عناصر موجودة» links open items; event picker in the item edit sheet.
- No auto-splitting of entries: one entry = one item.
- No date is auto-assigned on entry except the store's current date, or a date the user spoke/typed.
- Home: calendar (arrows: left = next month, right = previous), shrinks to one week with an animation when swiping up / scrolling the list; day list grouped by category, collapsible; full-screen focus mode for "super" (supermarket) only.
- Shop tab: bought items disappear immediately (no undo toast); collapsible store groups; store date chip shows the date only.
- One font family (IBM Plex Sans Arabic); light/dark toggle per device; mic button uses the browser Web Speech API (`ar-SA`) and auto-adds on final result.
- Inputs keep 16px font (prevents iOS zoom).

## Working rules
- Write user-facing text in Arabic (MSA, short).
- Test before pushing: `npm i playwright @fontsource/ibm-plex-sans-arabic && node dev/smoke-test.js` — runs the page in Chromium (`/opt/pw-browsers/chromium`, phone viewport 390×844) with Firebase routed to in-memory mocks (`dev/firebase-mocks/`): sign-in, add, AI inbox, buy, suggestions, export/import, access denied, `#voice` link. Must print `errors…: []`. Extend it for the flow you changed; add screenshots to judge layout.
- Preview before pushing: `node dev/build-preview.js` builds `dev/preview.html` (app + Firebase mocks + sample data saved in the browser; not committed). Publish it as the owner's preview artifact (same URL each time: https://claude.ai/artifact/5VMz12awZ6DUpZebqctNne). The owner tests there and approves before anything is pushed to `main`. Export download and the mic don't work inside the artifact sandbox.
- Commit messages: short, describe the user-visible change. Push to `main` only after testing.
- Rollback: Cloudflare → Deployments → previous deployment → Rollback.
