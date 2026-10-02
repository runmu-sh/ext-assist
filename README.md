# Assist (`@runmu.sh/ext-assist`, id `assist`)

The staff help desk: account-keyed help threads with claim, status and replies, after Underspire's Assist view. It is on the marketplace as `assist`: install it from Extensions → Discover, then enable it per world under Installed. Requires μClient SDK 1.12.

The panel (`assist`, "Assist") is offered only on staff sessions and opens by itself the first time an inbox arrives (Show panel `off|auto|on`, the host's row under *Settings → Extensions → Assist*). There too: Driven by (`gmcp + api|gmcp|api`), Rich text in messages (default on), and the via and command for each action. While it is not off it sends `Core.Supports.Add ["Client.Assist 1"]`.

New requests (ids not seen before in that world, on any of the player's devices) raise a mention, "New ticket" with the account (more than three at once: one "N new tickets"), and count on the panel's tab badge until opened. The first inbox a world ever sends is not news.

## GMCP contract
Checked by the host against `schema/*.json` before the panel sees it; a malformed message writes one `session.error` line and is dropped.

| Direction | Package | Payload | Schema |
|---|---|---|---|
| S→C | `Client.Assist.Inbox` | `{ "threads": [Thread] }`: the whole list; this also marks the session as staff | `schema/inbox.json` |
| S→C | `Client.Assist.Thread` | `Thread` with `"messages": [Message]` (required) | `schema/thread.json` |
| S→C | `Client.Assist.Message` | `{ "account_id", "message": Message }`: appended to the thread | `schema/message.json` |
| C→S | `Client.Assist.Action` | `{ "action": "view"\|"claim"\|"status"\|"reply", "account_id", "status"?, "text"? }` (only when an action's via is `gmcp`) | `schema/action.json` |

- `Thread = { account_id (string|integer, required), account_key?, account_name?, assignee?, status? ("open"|"pending"|"resolved"|…), age_mins?, created? (epoch s or ms), count?, preview?, messages? }`
- `Message = { text?, html?, sender?, sender_html?, visibility? ("internal" marks a staff note), ts? (epoch s/ms or ISO) }`

With `created` the inbox is sorted oldest first and the age is computed from it; otherwise `age_mins` is shown and the game's order kept.

## Actions
`mu.actions` ids, each in the command palette as "Assist: …" and configurable per world (via `command|gmcp|ext|none`, and the command). Placeholders: `{account}` (id), `{key}` (account key), `{status}`, `{text}`.

| Action | id | Default command |
|---|---|---|
| view | `assist.view` | `@assistview #{account}` |
| claim | `assist.claim` | `@assistclaim #{account}` |
| status | `assist.status` | `@assiststatus #{account} {status}` |
| reply | `assist.reply` | `@assist #{account} = {text}` |

An Underspire-style game would set reply to `xassistreply {key} {text}`.

## API (`ctx.api('@runmu.sh/ext-assist')`, types: the package's `types`, src/types.ts)
One instance per calling extension (`ctx.exports`): what it registers goes away when it is disabled.

`enable(mode, worldId?)`, `setRole('staff'|'player', sid?)`, `open()`, `set('inbox', {threads}, sid?)`, `set('thread', Thread, sid?)`, `upsert('thread', Partial<Thread>, sid?)`, `remove('thread', accountId, sid?)`, `push('message', {account_id, message}, sid?)`, `get('inbox', sid?)`, `onAction(action, fn)` (`fn(args, session)`, args `{action, account, key, status?, text?}`; return `true` to suppress the send), and `configure({enabled?, source?, actions?, options?}, worldId?)`.

## What it looks like
The header is ASSIST with a faint HELP DESK sub-line and a gold "N OPEN". Inbox rows are `.sh-row` lines: the account key (gold, uppercase), ◆ assignee, a status plate (open hot, pending gold, resolved/closed dim), age, message count and a one-line preview; unopened new requests are hot. A conversation shows `[ INBOX ]`, the petitioner with its plate, the open/pending/resolved select (an underline field) and `[ CLAIM ]`, then the messages (time, sender, text; staff notes marked), then a `>` "Reply to …" line. Empty states are uppercase faint labels: NO OPEN TICKETS. and NO MESSAGES IN THIS THREAD. Built on the host's `mu.ui.css` primitives, every rule scoped to `.ext-panel[data-ext="assist"]`, theme tokens only.

Tests: `npm test` (the headless host `@runmu.sh/dev/test` with happy-dom).
