# The shared leaderboard

Two boards: the tower's fastest full escape, and the Heartwood Pit's deepest
wave. Both are device-local until you do the three steps below — the game works
either way, and shows `THIS DEVICE` instead of `GLOBAL` when it is on its own.

The pieces:

- `api/scores.js` — a Vercel function. The only thing that talks to the database.
- Supabase — a free Postgres table holding the rows.
- `src/game/leaderboard.js` — the game. Writes every run to the device as well,
  and falls back to the device board if the server is unreachable.

The browser never gets a database key, which is the whole point: a key in the
bundle is a key in everyone's devtools, and the board would be fiction within a
day.

## 1. Create the table

In your Supabase project: **SQL Editor → New query**, paste this, run it.

```sql
create table public.scores (
  id       bigserial primary key,
  board    text        not null check (board in ('tower','endless')),
  name     text        not null,
  seconds  numeric     not null,
  kills    int         not null default 0,
  coins    int         not null default 0,
  wave     int         not null default 0,
  at       timestamptz not null default now(),
  ip_hash  text
);

create index scores_board_idx on public.scores (board, wave desc, seconds asc);
create index scores_ip_idx    on public.scores (ip_hash, at desc);

-- No direct access from browsers. Only the service key (used by the Vercel
-- function, server-side) can read or write, and row level security enforces it.
alter table public.scores enable row level security;
```

## 2. Give Vercel the keys

Supabase → **Project Settings → API**. Copy the **Project URL** and the
**`service_role`** key (the secret one, *not* `anon`).

Vercel → your project → **Settings → Environment Variables**, add both for
Production and Preview:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | the project URL, e.g. `https://abcd.supabase.co` |
| `SUPABASE_SERVICE_KEY` | the `service_role` key |

The `service_role` key bypasses row level security, so it must never appear in
client code, a commit, or a screenshot. It lives only in Vercel.

## 3. Redeploy

Environment variables are read at deploy time, so redeploy after adding them.
Check it:

```bash
curl "https://verdant-black.vercel.app/api/scores?board=endless&limit=5"
```

`[]` means it works and the board is empty. `{"error":"leaderboard not
configured"}` means the variables aren't set on the deployment you hit.

## What the server refuses

Scores arrive from a browser nobody controls, so `validate()` in
`api/scores.js` rejects what the game cannot produce. The bounds are derived
from the real content (`FLOORS`, `waveSpec`), so they move when the game does:

- a tower time without roughly a full tower's worth of kills (a real escape
  kills ~1,886), or faster than those kills physically take;
- more than 8 kills a second, on either board;
- a pit wave with too few kills for the waves that must have been survived, or
  reached implausibly quickly;
- more than 30 submissions an hour from one address (the address is stored only
  as a salted hash, never in the clear).

None of this makes cheating impossible — a determined person can replay a
plausible-looking POST. It makes the board mostly honest, which is what a
leaderboard on a free web game can reasonably be. If it ever matters more than
that, the next step is signing runs in the game and verifying the signature
server-side.

## Moving the deployment

`src/game/leaderboard.js` has the deployed URL near the top (`API`) so that a
downloaded or portal-hosted build still reaches the same board. If the domain
changes, change it there.
