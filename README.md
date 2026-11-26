# iif-hq
IIF Planning HQ: planning and tracking the Innovation Investment Fee cycle, from kickoff to collections.
Live at https://resources.mismo.org/iif-hq/ (sign-in required).

Set up the same way as Summit HQ. The plan lives in the private `iif-hq-data` repo and is saved
through the resources.mismo.org relay under the project key `iif-hq`. No token, secret or plan data is
ever kept in this repo.

Who can do what (set per person in People & Access):
- **Admin** and **Staff**: change the plan.
- **View**: read-only.

Before uploading a new copy of index.html, download the current one from GitHub first and
make changes to that copy, so nothing that changed since is undone.

Back and Forward: the browser's Back button goes to the last page you were on and closes an open
panel first (on a narrow screen, the open menu too); it never undoes a change. This comes from the
shared `/assets/back.js` (owned by Forms and shared pages), loaded right after `/assets/session.js`;
never copy it here or add `history.pushState` for this (CN-033). A new panel or drawer is registered
with `MismoBack.layer({isOpen, close})`, bottom layer first.

Masthead: Certification Management's, to the pixel (CN-053; `hub/standards/mismo-brand.md`). `--hq-h` is
68px (62px at 560px and under) and the left menu and side panel are placed from it, never from a fixed
number. The December hat comes from the shared `/assets/holiday.js` (loaded by session.js); never add
the old `.santa` / `#mismo-hat` / `data-season` hat back.

## Checks
`npm install`, `npx playwright install chromium`, then `npm test` opens the page in a headless
browser against a pretend sign-in and a pretend save relay (`tests/harness.js`) with made-up sample
data (`tests/sample-reference.json`), and runs the checks in `tests/run.js`. Nothing real is read or
changed. Run them before uploading a new index.html; when you add a feature, add a check for it.
The Back checks use the live `https://resources.mismo.org/assets/back.js` (or `MISMO_BACK=<file>`).
