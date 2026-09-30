# Assist (`@runmu.sh/ext-assist`, id `assist`)

The help-desk module (06-world-modules §4, R-MOD-ASSIST). It is a first-party extension on the marketplace (`assist`): install it from Extensions → Discover, then enable it per world under Installed. Its settings sub-page is *Settings → Extensions → Assist*, with Show panel `off|auto|on`, Driven by, and the via and command for each action. While it is on it sends `Core.Supports.Add ["Client.Assist 1"]`.

## GMCP contract
| Direction | Package | Payload |
|---|---|---|
| S→C | `Client.Assist.Inbox` | `{ "threads": [Thread] }`: the whole list; this also marks the session as staff |
| S→C | `Client.Assist.Thread` | `{ "account_id", "account_key", "messages": [Message] }` |
| S→C | `Client.Assist.Message` | `{ "account_id", "message": Message }` |
| C→S | `Client.Assist.Action` | `{ "action", "account_id", "status"?, "text"? }` (only when an action's via is `gmcp`) |

`Thread = { account_id, account_key?, account_name?, assignee?, status?, age_mins?, count?, preview? }`. Malformed packages produce one `session.error` line.

Default actions:
| Action | Command |
|---|---|
| view | `@assistview #{account}` |
| claim | `@assistclaim #{account}` |
| status | `@assiststatus #{account} {status}` |
| reply | `@assist #{account} = {text}` |

## API (`ctx.api('assist')`, types `@runmu.sh/ext-assist/types`)
`enable(mode, worldId?)`, `setRole`, `open`, `set('inbox'|'thread', …)`, `upsert`/`remove('thread', …)`, `push('message', …)`, `get('inbox')`, `onAction(action, fn)` (return `true` to suppress the command), and `configure(cfg, worldId?)`.

## What it looks like
The header is ASSIST with a faint HELP DESK sub-line and a gold count. Inbox rows are `.sh-row` lines, each carrying the account key (gold, uppercase), the assignee, a status plate (open hot, pending gold, resolved dim), age, message count and a one-line preview. A conversation shows `[ INBOX ]`, the petitioner with its plate, `[ CLAIM ]` and the open/pending/resolved select (an underline field), then the messages, then a `>` "assist reply" line. The empty states are uppercase faint labels: NO OPEN TICKETS. and NO MESSAGES IN THIS THREAD. It uses the SDK 1.5 primitives (`mu.ui.css`).