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
- `config/events`: `{list:[{id,name,emoji,createdAt}]}` — المناسبات. An event is a tag (`item.ev`), never a category: tagged items stay in their store/tasks as usual. Adding (mic or typing) while an event is open tags the new item. Ending an event deletes it and clears `ev` on its items.
- `history/recent`: `{items:{<normalizedName>:{t,c,n,d}}}` — purchase history for entry suggestions (365 days). Written with merge.
- Loading: open items (`done==false`) live; done items only from the earliest visible calendar day (`ensureDoneFrom`) to save free-tier reads.

## UX decisions already made by the owner (keep them)
- Look (approved Nov 2026, "المزيج"): calm ledger style — light `#f4f3f1` / night `#0b0d0c` tokens, green accent `#1f5c4d` (night `#6dbb9f`), black primary buttons, 8px radii, one font. Category colours only as small marks (checkbox border, day segments, store square); night brightens them.
- Top bar: logo mark + «دفتر البيت» + sync dot, theme toggle, menu (☰). The menu sheet holds الوارد and التصنيفات/النسخ الاحتياطي (a dot on ☰ when the inbox has items). Each page has a large title + one-line summary.
- Bottom bar (fixed): اليوم، المشتريات، [mic]، المهام، المناسبات. No badge numbers. The mic sits in the middle (60px green circle): tap = voice (Web Speech, `ar-SA`, auto-adds on final result; the add panel shows what is heard with «اكتب بدلاً من ذلك»); long press (~0.45s) = the typing panel (`body.composing`, a "compose" back-layer). Typing panel: textarea, preview/suggestions, «أضف», mic switch; closes itself after adding. Swipe sideways moves between the four bar sections; pull-to-refresh is off. Inbox/categories are tabs reached only from the menu (`goTab`).
- Tasks tab: one flat list (no category grouping); each task has its own date.
- Priority `"urgent"` is labelled «مهم» in the UI (value unchanged).
- Events tab: title + «مناسبة جديدة» on top; each event is a plain card like the other pages (emoji, name, «تم x من n», thin green progress line, chevron) that opens in place; one open at a time (the mic adds to it). Inside: one flat list sorted by category, neutral checkboxes, the category as a small grey caption, the date at the end or «+ تاريخ»; footer «إضافة عناصر موجودة» + ⋯ (sheet: تعديل / إنهاء with confirm). Event picker in the item edit sheet.
- No auto-splitting of entries: one entry = one item.
- No date is auto-assigned on entry except the store's current date, or a date the user spoke/typed.
- Home (اليوم): week strip by default (weekday + number; today = solid ink, selected = ring; a full-width bottom line split into up to 3 category colours + grey for more), «عرض الشهر»/«عرض الأسبوع» toggles the month; arrows: left = next, right = previous. Day card: count, the supermarket as one row «مشوار السوبرماركت · N أصناف» (tap or long press = its full-screen list for that day), other items flat, inbox row «… في الوارد بلا تصنيف · صنّفها» on today. Then «القادم هذا الأسبوع»: next 6 days grouped by date (supermarket again as one row → whole open list).
- Full-screen focus mode is for "super" only: from the home trip row, or a long press on its store title in the shopping tab (whole open list; bought items leave it). A short tap on the store title still opens/closes it.
- Shop tab: bought items disappear immediately (no undo toast); collapsible store cards (name + «N أصناف»); supermarket date row «السبت 7 نوفمبر · بعد 3 أيام | تغيير»; the supermarket shows 5 items + «و N أصناف أخرى» when it has more than 6 (other stores show all).
- One font family (IBM Plex Sans Arabic); light/dark toggle per device. Toasts appear just above the bottom bar.
- Inputs keep 16px font (prevents iOS zoom).
- Back gesture: every overlay (edit sheet, menu, typing panel, full-screen list, voice prompt) and every non-home tab is a history entry (`pushLayer`/`popLayer`, `goTab`), so back closes the overlay or returns home instead of leaving the app. Sheets with unsaved changes, and unsaved category edits, ask before discarding.
- Accessibility: the bottom bar is a nav with `aria-current="page"`, sheets are modal dialogs that return focus, checkboxes have ~44px touch targets, Arabic counts use `count(n, W_ITEM)` (plural forms).

## Working rules
- Write user-facing text in Arabic (MSA, short).
- Test before pushing: `npm i playwright @fontsource/ibm-plex-sans-arabic && node dev/smoke-test.js` — runs the page in Chromium (`/opt/pw-browsers/chromium`, phone viewport 390×844) with Firebase routed to in-memory mocks (`dev/firebase-mocks/`): sign-in, add, AI inbox, buy, suggestions, export/import, access denied, `#voice` link. Must print `errors…: []`. Extend it for the flow you changed; add screenshots to judge layout.
- Preview before pushing: `node dev/build-preview.js` builds `dev/preview.html` (app + Firebase mocks + sample data saved in the browser; not committed). Publish it as the owner's preview artifact (same URL each time: https://claude.ai/artifact/5VMz12awZ6DUpZebqctNne). The owner tests there and approves before anything is pushed to `main`. Export download and the mic don't work inside the artifact sandbox.
- Commit messages: short, describe the user-visible change. Push to `main` only after testing.
- Rollback: Cloudflare → Deployments → previous deployment → Rollback.
