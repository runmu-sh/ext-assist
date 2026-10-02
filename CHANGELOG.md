# Changelog

## 1.2.0

- New help requests raise a mention ("New ticket" and the account), shown once even when you have the game open on several devices, and the Assist tab carries a count of the requests you have not looked at yet. Several at once come as one "N new tickets".
- The panel opens by itself the first time a staff inbox arrives, and it is listed under Views only on staff sessions. It goes away on a session that stops being staff.
- The header shows "N open", assignees carry a ◆ mark, a request less than a minute old reads "now", and requests are listed oldest first when the game sends when they were opened (`created`).
- The reply line says who you are replying to ("Reply to newbie-ash"), and senders can be formatted (`sender_html`).
- Rich text in messages is now on by default. If you turned it off, it stays off.
- Malformed GMCP is rejected before it reaches the panel, with one error line in the session.
- A status the game invents (beyond open, pending and resolved) shows in the status list, and a `closed` status gets the dim plate.
- Requires μClient with SDK 1.12.

## 1.1.1

- Its own repository, [runmu-sh/ext-assist](https://github.com/runmu-sh/ext-assist), made with `npm create @runmu.sh/extension` and published to the marketplace from its version tags. The package is `@runmu.sh/ext-assist`, built against `@runmu.sh/sdk` from npm. Nothing changes in the extension itself.

## 1.1.0

- Published to the marketplace as `assist`; no longer bundled with μClient.

## 1.0.0

- The Assist help desk as a first-party extension (06-world-modules §4), with the exported `AssistApi`.
