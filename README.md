# Wetin You Talk?

A Jackbox-style party game for Africans everywhere. One person hosts, everyone joins from their phone with a 4-letter code (or a WhatsApp link). Two ways to play:

- **📱 Everyone on phones**: each phone is the controller *and* the display. Built for families on a WhatsApp or Zoom call across Lagos, London and Houston.
- **📺 One big screen**: a TV or laptop shows the game and phones are the controllers. Built for owambes, Christmas at home and youth nights.

Content is tagged by region (🇳🇬 🇬🇭 🇰🇪 🇿🇦 + pan-African), so a room can play Naija jokes only, or Naija × Ghana for the jollof wars.

## How a game works

| Phase | What happens |
|---|---|
| Lobby | 3–8 players join. The first player (or the TV) is the VIP who starts the game, changes settings and can remove players. |
| Answering | Each player gets **2 prompts**. Every prompt is shared with exactly one other player. |
| Voting | Two anonymous answers go head to head. Everyone *except* the two authors votes, and can **change their vote** until voting closes. Vote counts stay hidden until the reveal. |
| Reveal | Authors and voters are shown. **100 pts per vote**; taking every vote earns **+250 "Gbas Gbos!"** |
| Rounds | Round 1 (×1), Round 2 (×2 points), **Last Lash** (×3): everybody answers one prompt and votes for any answer except their own. |

**Bots:** short of friends? The VIP can fill up to **4 seats with bots** (lobby → *Add a bot*), or tap **🤖 Practice with bots** on the home page to start a room with you and 2 bots. Bots are labelled *Bot* everywhere, answer from a curated line pool matched to the countries in play, and vote mostly at random (nudged towards answers with some effort in them). They can't be VIP and can't start a game alone.

Timers: 75 s to answer (60 s in Last Lash), 20 s to vote, 8 s reveals. Answering ends as soon as everyone has answered. Once everyone has voted, voting stays open for a **3 s lock-in window** for last-second changes (changes never extend it), then the reveal starts. The VIP can skip any phase.

## Architecture

```
packages/game-core     Pure TypeScript: state machine, scoring, prompt deck, wire protocol (zod).
                       No I/O, injected clock + RNG → fully unit-tested and reusable by future
                       Telegram / Discord clients.
apps/room-server       Node + ws. Authoritative rooms, phase timers, resume tokens, rate limiting,
                       origin allow-list, idle-room sweeping. Clients only send inputs.
apps/web               Next.js 16 App Router. Landing page is static; /room/[code] is the live room.
```

**Anti-cheat by design:** the server sends each client a *projection* of the room (`projectRoom`). Answers are never sent before voting, and authors are never sent before the reveal, so nothing leaks through the network tab. This is covered by tests.

**Reconnects:** each client gets an opaque resume token (stored in localStorage). If a phone locks, switches to WhatsApp or loses signal, it resumes into the same seat. If the last player we were waiting on drops, the game moves on without them.

## Reliability and security

| Concern | What's in place |
|---|---|
| **Idempotency (rooms)** | `create`/`join` carry a client `requestId`. A retry after a lost reply gets the **same seat and token**; two racing duplicates share one in-flight promise, so they can never create two players. A re-sent identical answer or vote is a no-op. Leaving twice is harmless. |
| **Idempotency (HTTP)** | `POST /api/profiles`, `/shop/buy`, `/me/equip` and `/checkout` honour an `Idempotency-Key` header: same key + same body replays the first response (`Idempotency-Replayed: true`), concurrent duplicates wait for the first, same key + different body is `422`, and 5xx responses aren't cached. The checkout key is forwarded to Stripe. The web client sends a key per action and retries a network failure **once with the same key**. The DB ledger's unique refs remain the final guarantee for coins. |
| **Concurrency** | The game state machine is pure and single-threaded per room. Each socket's messages are processed strictly in order. Coin writes use row locks (`SELECT … FOR UPDATE`) in transactions, the balance has a `CHECK (coins >= 0)`, and the ledger refs are unique. |
| **Sessions** | Room seats are opaque 192-bit tokens, revoked on leave/kick. Profile tokens are 256-bit and stored **hashed** (SHA-256). The web app keeps them in localStorage, protected by a strict `connect-src` CSP. |
| **Rate limits** | Per socket: 30 messages / 5 s. Per IP: concurrent sockets, room creation, join attempts (stops room-code guessing), all API calls, profile creation, Stripe checkouts. All return `429` (+ `Retry-After` over HTTP). Set `TRUST_PROXY=true` behind Railway/Render so the real client IP is used. |
| **Middleware (HTTP)** | `errorBoundary → requestId → accessLog → securityHeaders → cors → rateLimit → router` (auth, route limits, idempotency, body limits, 415 for non-JSON). Every response has an `X-Request-Id`, and every request logs one JSON line. |
| **Web headers** | CSP (`connect-src` limited to the room server), `X-Frame-Options: DENY`, `nosniff`, `Permissions-Policy`, HSTS in production. Pages stay statically generated. |
| **Sad paths** | Server down → after 5 failed connects the client stops spinning and shows "Can't reach the game" with Try again (plus auto-retry when the phone comes back online). Lost connection mid-game → banner, the seat is kept, and the client resumes on reconnect. Profiles unavailable → the game still works as a guest. |

All of this is in-memory per process, which matches the single-instance design (rooms live in memory). To scale out, move rooms, limiters and idempotency records to Redis.

## Run locally

Requires Node 20.11+.

```bash
npm install
npm run build -w @afro-party/game-core   # web + server consume the built package
npm run dev:server                       # ws://localhost:8787/ws
cp apps/web/.env.example apps/web/.env.local
npm run dev:web                          # http://localhost:3000
```

**Env files:** the web app reads `apps/web/.env.local` (copy `.env.example`). The room server needs **no** env file locally; it runs on safe defaults. To override anything (e.g. Stripe test keys), copy `apps/room-server/.env.example` to `apps/room-server/.env`. Both are git-ignored. In production, set variables in the Netlify/Railway dashboards instead of committing files.

To test on real phones on the same Wi-Fi, set `NEXT_PUBLIC_ROOM_SERVER_URL=ws://<your-LAN-IP>:8787/ws` and open `http://<your-LAN-IP>:3000`.

## Checks

```bash
npm test                  # every package: 60 game-core tests (rules, scoring, privacy, progression, bots)
                          #   + 38 room-server tests (real Postgres via PGlite, real sockets, bot timing on fake clocks)
npm run typecheck
npm run check:filenames   # kebab-case enforcement (protects case-sensitive Linux builds)
npm run build
npm run smoke             # with the server running: 4 bots play a full game over real WebSockets
python3 scripts/ui-play-through.py   # with server + web running: a TV and 3 phones play in a real browser
python3 scripts/ui-progression.py    # rewards → profile → shop purchase → equip → reactions
python3 scripts/ui-vote-change.py    # a voter switches answers; only the final vote counts
SERVER_CMD="node apps/room-server/dist/server.js" python3 scripts/ui-leave.py   # leave flows + server-down recovery
python3 scripts/ui-solo-bots.py      # one person plays a whole game vs bots (start the server with BOT_DELAY_PERCENT=10 to speed it up)
```

## Progression, coins and the shop

- **XP and levels:** every finished game gives XP (finishing, answers, votes received, sweeps, winning). Levels follow a gentle curve (100, 150, 200 … XP) up to 50. Each level-up pays **+50 coins**.
- **Badges:** 12 badges (e.g. *Gbas Gbos!*, *Jollof Diplomat*, *Pan-African*, *Last Lash King*), each with a one-off coin reward.
- **Coins:** earned from games (capped at **300/day** from games to blunt farming), badges and level-ups, or bought with real money via Stripe.
- **Shop:** avatars, card designs (shown behind your answers at the reveal), name colours, reaction packs and **deck packs**. Some items are free level rewards. **Nothing changes points, votes or odds.** Every coin price also shows its real-money equivalent.
- **Deck packs travel:** if *anyone* in the room owns a pack, the VIP can switch it on for everybody.
- **Profiles:** guest profiles are created automatically (no sign-up). Players can copy a secret backup code from their profile to restore it on another phone.
- **Bots and rewards:** bot votes score points on screen but never count towards XP or badges, so you can't farm *Crowd Favourite* with a room full of bots. A game with fewer than **2 people** is a **practice game**: XP only, no coins, no badges, and it doesn't count towards games played or wins. With 2+ people, bots just fill seats and the game pays out normally.
- **Ledger:** every coin movement is a row in `coin_ledger` with a unique `ref`, so a replayed Stripe webhook or a retried reward can never pay twice.

## Deploy

| Piece | Where | Settings |
|---|---|---|
| `apps/web` | **Netlify** | Base directory: *(empty)*. Package directory: `apps/web` (uses `apps/web/netlify.toml`). Env: `NEXT_PUBLIC_ROOM_SERVER_URL=wss://<server>/ws` |
| `apps/room-server` | **Railway** (or Render/Fly) | Build `npm install && npm run build -w @afro-party/game-core && npm run build -w @afro-party/room-server`; start `npm start -w @afro-party/room-server`. **One instance** (rooms live in memory) |
| Database | Railway Postgres, Supabase or Neon | `DATABASE_URL` on the room server. Tables are created automatically on boot. `DATABASE_SSL=false` only for a private network DB |

Room server env:

```
NODE_ENV=production
ALLOWED_ORIGINS=https://<your-site>.netlify.app
DATABASE_URL=postgres://...
PUBLIC_WEB_URL=https://<your-site>.netlify.app
TRUST_PROXY=true                     # Railway sits in front: use the real client IP for rate limits
STRIPE_SECRET_KEY=sk_live_...        # optional: without both Stripe keys, coins are earn-only
STRIPE_WEBHOOK_SECRET=whsec_...
```

Stripe: create a webhook endpoint at `https://<server>/api/stripe/webhook` for `checkout.session.completed` and `checkout.session.async_payment_succeeded`. Coins are credited **only** from the signed webhook, never from the browser redirect. Test with `sk_test_` keys and `stripe listen --forward-to localhost:8787/api/stripe/webhook` first.

Without `DATABASE_URL` in development the server uses an embedded Postgres (PGlite) in `.data/pglite`, so XP and the shop work locally with zero setup. Netlify's build settings are untested until your first deploy: if the first build fails, check the Package directory setting first.

**Before taking real money:** add refund handling (a refund or chargeback should claw back unspent coins), publish terms that say coins have no cash value, and keep guest backup codes prominent. Phone-number or email sign-in is the next upgrade.

## Content rules (`packages/game-core/src/content/wetin-you-talk-prompts.ts`, `bot-answers.ts`)

- One `___` blank, room for a punchline under 80 characters.
- Laugh *with* a culture, never *at* a group: no ethnic, tribal or religious targets.
- **No song lyrics, audio clips, brand mascots or real private people.** Music needs licences (see notes).
- Adult themes → `familySafe: false`.
- Bot answers must work as a punchline for almost any prompt, stay family-safe (bots play in family mode too) and never name real people.
- Every region must keep ≥ 17 family-safe prompts (a test enforces this) so a full 8-player game never runs dry.

The starter deck is a **draft**. Get native speakers from each country to review it before public launch.
