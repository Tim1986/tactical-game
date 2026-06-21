# Tactical Game — Project Handoff Doc

**Purpose of this file:** Tim has low/no coding background and works with Claude across many chat sessions (screenshot limits force new chats often). This doc is the single source of truth a brand-new Claude conversation needs to get oriented fast — what exists, where it lives, what's safe to assume, and how to actually run commands. Update this doc at the end of every working session.

**Last updated:** 2026-06-19

---

## 1. What this project is

A tactical RPG with a mobile frontend (React Native/Expo) and a Node.js/Express backend, deployed on Railway with PostgreSQL. Turn-based combat, team-building, matchmaking, and challenge system.

---

## 2. How Tim works (read this first)

- **Tim does not write or read code directly.** Every code change must come as a ready-to-run terminal command (`sed`, `cat > file << 'EOF'`, etc.) that Tim copy-pastes into Git Bash. Do not say "edit this file" — give the exact command.
- **Claude cannot access Tim's machine.** Claude's `bash_tool`/`view`/`str_replace` only touch a sandboxed container, NOT `C:\Users\timot\...`. Every file read/edit on the real project requires Tim to run a command and paste the output back. This is a hard boundary, not a missing permission.
- **Verify before acting.** Tim's repo has had repeated issues with stale assumptions (wrong line numbers, files in unexpected locations, Railway config silently overriding the dashboard). Always confirm current file state with `grep`/`cat`/`sed -n` before editing, especially in large files like `test.tsx`.
- **One command block at a time** when the result needs to be checked before proceeding (e.g., editing a specific line). Batch multiple read-only commands together when just gathering context.
- **Avoid `sed` line-anchored edits without a fresh `grep` confirming the exact current line number first.** This codebase has been bitten by off-by-one line mismatches multiple times. Prefer `c\` (full line replace) with a freshly-grepped line number over fragile pattern-matching `sed -i 's|...|...|'` when the line has complex characters (parens, asterisks, quotes).
- **Avoid unescaped `!` in double-quoted bash heredocs/strings** — it triggers bash history expansion in Tim's Git Bash (MINGW64) and silently breaks multi-line command blocks. Use single quotes when the pattern contains `!`.

---

## 3. Repo & deployment structure (IMPORTANT — this was a multi-hour bug source)

### Backend
- **Repo:** `Tim1986/tactical-game-backend` (standalone repo, separate from mobile)
- **Local path:** `C:\Users\timot\Claude\backend`
- **Remote name locally:** `standalone` (not `origin` — historical artifact, just how it's set up). Push with `git push standalone main`.
- **Deploys via:** Railway, service name `tactical-game-backend`, project `luminous-patience`
- **Builder:** Dockerfile (NOT Railpack/Nixpacks — this matters, see Known Gotchas)
- **Live URL:** `https://tactical-game-backend-production.up.railway.app`
- **Stack:** Node.js/Express, TypeScript (compiles to `dist/`), PostgreSQL, `tsc` build
- **Deploy command:** `railway up --detach` (after pushing to GitHub) forces a fresh build bypassing any GitHub webhook lag
- **To bust Docker build cache:** bump the `CACHE_BUST` variable in Railway dashboard (Variables tab), then redeploy. The Dockerfile has `ARG CACHE_BUST=1` / `RUN echo "Cache bust: $CACHE_BUST"` right before `npm run build`.

### Mobile
- **Repo:** `Tim1986/tactical-game` (this is the PARENT repo — confusing but important)
- **Local path of the actual git repo root:** `C:\Users\timot\Claude` (NOT `C:\Users\timot\Claude\mobile`)
- **The mobile app's files live in:** `C:\Users\timot\Claude\mobile\` as a regular tracked subfolder (e.g. tracked as `mobile/app.json`, `mobile/src/...`) — it is NOT its own git repo, has no separate `.git`
- **So:** to commit/push mobile changes, `cd /c/Users/timot/Claude` (the parent), not `cd /c/Users/timot/Claude/mobile`
- **Push with:** `git push origin master` (standard `origin`, unlike backend)
- **A `backend/` folder used to also live in this parent repo** as an orphaned git "gitlink" (looked like a submodule but had no `.gitmodules`). It was removed on 2026-06-19 (`git rm --cached backend` + added `backend/` to `.gitignore`). The backend's real home is the standalone repo above. Don't be confused if you see backend-flavored commit messages in this repo's history — that's leftover from before the split.

### Database
- Railway Postgres service, name "Postgres", in the same `luminous-patience` project
- Backend connects via `DATABASE_URL=${{Postgres.DATABASE_URL}}` (Railway variable reference — resolves to the **private internal** network address `postgres.railway.internal`, not the public proxy, avoiding egress fees)
- To query directly: `cd /c/Users/timot/Claude/backend && railway connect Postgres` — drops into a live `psql` shell against production

---

## 4. Known gotchas (read before debugging deploy issues)

1. **An orphaned `railway.toml` file silently overrode every Railway dashboard setting for hours.** It set `builder = "NIXPACKS"` and a stale `startCommand` that ran an old build, completely ignoring the Dockerfile and any UI changes. It was deleted on 2026-06-19. If deploys ever start behaving inconsistently with dashboard settings again, **check for `railway.toml`, `railway.json`, or `nixpacks.toml` in the backend repo root first** — config-as-code always wins over the dashboard.
2. **Railway's CLI start-command field and the Dockerfile CMD can silently diverge.** If logs show unexpected behavior (e.g., migrate running when it shouldn't, or vice versa), check Settings → Deploy → Custom Start Command in the Railway dashboard — clear it if it shouldn't be overriding the Dockerfile.
3. **Always generate a Public Domain in Railway Networking settings** for a new service, or the healthcheck has nothing to hit and will fail forever even if the app is perfectly healthy.
4. **`railway up --detach`** uploads your local disk directly, bypassing GitHub — useful for fast iteration/debugging, but remember to `git push` too so GitHub stays in sync as the source of truth.
5. **CORS is currently locked to `http://localhost:8081`** (Expo web dev server origin) as of 2026-06-19. This only affects browser-based clients — native iOS/Android builds are unaffected by CORS entirely. **When deploying any web build to a real domain, add that domain to the CORS origin array in `src/app.ts`** (there's a comment in the code marking exactly where).

---

## 5. Current feature state

### Auth
- `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all` all working
- JWT access token (15m expiry) + refresh token (30d expiry)
- **As of 2026-06-19: registration auto-creates a "Default Team"** (fighter, barbarian, ranger, rogue) in the same DB transaction as user creation, so every new player has an immediately-usable team with zero setup required. Returned in the `/auth/register` response as a `team` field. This was a deliberate UX decision — team-building is optional, not required to start playing.

### Teams
- CRUD via `/teams` (GET, POST, PUT `/teams/:id`, DELETE `/teams/:id`)
- Max 10 teams per user, exactly 4 units per team
- Units must be unlocked at the player's account level (`unlockLevel <= accountLevel`)
- Default placement: `[{x:1,y:1},{x:1,y:3},{x:1,y:5},{x:1,y:7}]`

### Units
- 8 unit classes total exist in `unit_definitions`. Fighter, barbarian, ranger, rogue are confirmed unlock_level 1.
- **Design intent (per Tim, 2026-06-19): eventually 6 of 8 classes unlocked at level 1, the other 2 unlock after playing a few games.** Not yet implemented — currently it's unclear exactly which units are locked vs unlocked beyond confirming the default-team four are level 1.

### Matches / Matchmaking / Challenges
- All routes exist and were spot-checked working (challenges returns proper 401 without auth, 200 with auth)
- Background jobs running in production: matchmaking queue processor (every 30s), turn deadline enforcer (every 5 min)

### Mobile
- Expo Router-based navigation, typed routes
- `API_BASE_URL` in `mobile/src/api/client.ts` points to the live backend URL above
- Tested working via `npx expo start --web` — registration, login, and team placement confirmed functional end-to-end

---

## 6. Security/maintenance notes

- `npm audit` (backend) as of 2026-06-19: 9 vulnerabilities remain, all assessed as **low real-world risk** — they're in dev-only tooling (`vite`/`esbuild`/`vitest`, never deployed) or build-time-only transitive deps (`tar` via `bcrypt`'s `node-pre-gyp`, `uuid` via `node-cron`). Decision made: not worth forcing breaking major-version bumps for these. Revisit if `npm audit` flags something new/runtime-relevant.
- JWT secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`) were regenerated during the backend repo migration (2026-06-19). Any sessions issued before that point are invalid — not a bug, just a one-time consequence of the migration.

---

## 7. Session log

### 2026-06-19 (session 1) — Backend migration & deploy debugging
- Migrated backend from nested-repo setup (inside `Tim1986/tactical-game`) to standalone `tactical-game-backend` repo to fix a Railway snapshot-size issue
- Spent significant time debugging a silent server crash on deploy — root cause was an orphaned `railway.toml` overriding all dashboard config (see Gotcha #1)
- Fixed `app.set('trust proxy', 1)` for rate-limit warning
- Verified full auth flow, challenges endpoint, database connectivity end-to-end via curl
- Cleaned up: removed orphaned `backend` gitlink from parent mobile repo, restored correct git history, locked CORS to `localhost:8081`, ran `npm audit fix`, deleted unused `fix.py` and old zip files

### 2026-06-19 (session 1, continued) — Default team feature
- Implemented: new user registration auto-creates a "Default Team" (fighter/barbarian/ranger/rogue) in the same DB transaction as user creation
- Backend: `src/services/authService.ts` — `register()` now wraps user + team insert in `withTransaction`
- Mobile: `src/api/client.ts` — `AuthResult.team` field added
- Fixed 13 pre-existing TypeScript errors found via `npx tsc --noEmit` while in the codebase (typed routes, missing `surface` color token, missing `FALLBACK_SPRITE` constant, `sel` null-safety in nested closure, `DimensionValue` casts for percentage-width styles)
- Verified end-to-end via curl: registration returns a real, persisted team row; confirmed via `/teams` GET

---

## 8. Quick reference commands

```bash
# Backend: edit, deploy
cd /c/Users/timot/Claude/backend
# ...make changes...
git add -A && git commit -m "..." && git push standalone main
railway up --detach
railway logs          # check deploy
curl -i https://tactical-game-backend-production.up.railway.app/health

# Backend: query production DB directly
cd /c/Users/timot/Claude/backend
railway connect Postgres
# then standard psql: \dt, \d tablename, SELECT ..., \q to exit

# Mobile: edit, deploy (note: cd to PARENT folder, not mobile/)
cd /c/Users/timot/Claude
# ...make changes inside mobile/...
git add -A && git commit -m "..." && git push origin master

# Mobile: type-check before committing
cd /c/Users/timot/Claude/mobile
npx tsc --noEmit

# Mobile: run locally for testing
cd /c/Users/timot/Claude/mobile
npx expo start --web
```

---

## 9. Open items / not yet done

- Tighten unit unlock-level design (6 of 8 at level 1, 2 unlock via gameplay) — currently undefined which 2 are gated or what the unlock condition is
- No web production domain yet — CORS will need updating when one exists
- `npm audit` has 9 low-risk items deliberately left unresolved (see Security notes above)
- Diagonal sprite art: Rogue is the test class. SW/SE/NW/NE contact+passing walk pairs done; 4 diagonal idle poses prompted but not yet generated/confirmed as of last session
- DTest board rotation is proven to work visually but not yet integrated with any real diagonal sprite art — next step is wiring Rogue's diagonal images into a sprite map for DTest and visually validating before deciding whether to commit to diagonal board orientation game-wide

---

## 10. Diagonal sprite pipeline (pixel art walk cycles)

**Problem solved:** AI image generation (ChatGPT) struggles to produce two genuinely distinct walk-cycle frames from one reference — it tends to default to near-duplicate poses even when explicitly asked for "the opposite" leg position. Solved with a 2-step generation method instead of 1-step.

**Tooling note:** Aseprite (manual pixel editing) and PixelLab (AI sprite rotation tool) were both tried and abandoned for this specific art style — PixelLab's resolution caps (max 128x128, reference image max 200x200) destroy detail on Tim's illustrated-style character art. The AI-prompt-chaining method below is what actually worked.

### The method (validated on Rogue, SW/SE/NW/NE)

**Step 1 — Contact pose:** Feed the *idle* reference image (south-facing or north-facing depending on which diagonal). Ask for a wide-stride "contact pose" — one leg fully forward, planted; other leg fully back, heel raised, toe pushing off. Explicit V-shape, explicit left/right-of-frame anchoring (NOT "left foot/right foot" language — that fails on robed/skirted characters where leg sidedness is visually ambiguous).

**Step 2 — Passing pose:** Feed the **Step 1 output** (not the original idle) as reference. Ask for the "passing position" — support leg straight/vertical/full weight, swing leg bent and lifted **only slightly** (critical: low knee lift, explicitly tied to keeping hip/head height matched to the Step 1 pose, or the 2-frame loop will visually "bounce"/"hop"). Must explicitly forbid "both legs similarly bent" (a failure mode that reads as a relaxed idle stance, not mid-stride).

**Known failure modes and fixes:**
- Asking for "the opposite pose" directly → near-duplicate output. Fix: describe Step 2 as a structurally distinct pose (passing/midpoint), not "the reverse of step 1."
- High knee lift in passing pose → bounce/hop artifact when looped. Fix: explicitly cap lift height and tie it to height-matching the contact pose.
- Both legs similarly weighted/bent in passing pose → reads as standing still. Fix: explicitly demand asymmetry (support leg "stiff," swing leg "loose").
- Model defaults back to a previously-generated diagonal direction even when a different one is requested. Fix: explicitly name the direction as "mirror opposite of [other direction]" and anchor everything to left/right-of-frame, not viewer-relative or anatomical language.

**Idle poses for all 4 diagonals** (SW/SE from south idle, NW/NE from north idle) use a simpler single-step prompt — explicitly "neutral standing pose, NOT walking," weight balanced on both feet.

Full validated prompt text for all of the above lives in this conversation's history (session of 2026-06-19/20) — re-derive or ask Tim to re-paste if needed in a future session, since the exact wording matters and was iterated on live against real outputs.

### Code: DTest page (2026-06-19/20 session)

- New file `app/(tabs)/dtest.tsx` — exact copy of `test.tsx` at time of creation, then modified in isolation. `test.tsx` is untouched (verified via `git diff`).
- Registered as a new tab in `app/(tabs)/_layout.tsx` (name: `dtest`, title: "DTest")
- Rotation implemented as actual coordinate-space rotation (not a CSS transform on the whole board) so unit sprite art stays upright while only board *position* rotates — this was a deliberate choice over the simpler "rotate everything visually" approach, since the latter would tilt character art sideways
- `tileScreenPos()` in `dtest.tsx` rotates `(gx, gy)` -45° (this reads as counter-clockwise visually, despite earlier intent to do clockwise — Tim confirmed counter-clockwise looks correct and to leave it as-is) around board center before applying the existing tilt-compression math
- Individual tile `View` elements also get `rotate: '-45deg'` applied directly so the square tiles themselves render as diamonds matching the rotated grid (without this, tiles stayed axis-aligned squares at rotated positions, creating a "basket weave" visual bug — this was caught and fixed same session)
- **Status as of last session:** rotation and tile-shape fix both confirmed visually correct by Tim. No diagonal sprite art wired in yet — DTest currently shows existing (non-diagonal) sprites misaligned on the rotated board, which is expected/intentional until Rogue's diagonal art is ready to swap in.
