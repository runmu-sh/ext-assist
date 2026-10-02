/**
 * Assist in the headless μClient host (@runmu.sh/dev/test) with a DOM: the GMCP contract, the inbox and thread
 * markup, the actions (commands, gmcp, handlers), new-request mentions and the tab badge, the staff role, the
 * Show panel / Driven by settings, per-session state, the exported API and disposal.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { boot, mount, tick, calls, gmcpSent, validate, load, ROOT } from './helpers.mjs';

const INBOX = { threads: [
  { account_id: 81, account_key: 'tallow', account_name: 'Juno', assignee: 'Vessa', status: 'pending', age_mins: 44, count: 2, preview: 'my ship' },
  { account_id: 77, account_key: 'newbie-ash', account_name: 'Pell', status: 'open', age_mins: 3, count: 1, preview: 'How do I get out of the chapel?' },
] };
const THREAD = { account_id: 77, account_key: 'newbie-ash', account_name: 'Pell', status: 'open', messages: [{ sender: 'Pell', text: 'How do I get out of the chapel?', ts: 1700000000 }] };
const commands = (host) => host.sends('command').map((s) => s.text ?? s.line ?? s.cmd);
const schema = (f) => JSON.parse(readFileSync(join(ROOT, 'schema', f), 'utf8'));
const lastBadge = (host, sid) => calls(host, 'panels.badge').filter((c) => (c.args[2] ?? 's1') === sid).at(-1)?.args[1];
const mentions = (host) => calls(host, 'notify.mention').map((c) => c.args[0]);

test('manifest: api ^1.12, the four messages with schemas, send-commands, no ext-kit', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.muclient.api, '^1.12');
  assert.deepEqual(pkg.muclient.capabilities, ['send-commands']);
  const g = pkg.muclient.contributes.gmcp[0];
  assert.equal(g.package, 'Client.Assist 1');
  assert.deepEqual(Object.fromEntries(Object.entries(g.messages).map(([k, v]) => [k, v.dir])), { 'Client.Assist.Inbox': 'in', 'Client.Assist.Thread': 'in', 'Client.Assist.Message': 'in', 'Client.Assist.Action': 'out' });
  assert.ok(!pkg.devDependencies['@runmu.sh/ext-kit'] && !pkg.dependencies);
  assert.equal(pkg.devDependencies['@muclient/sdk'], 'npm:@runmu.sh/sdk@^1.12.0');
  assert.ok(!readFileSync(join(ROOT, 'dist', 'index.js'), 'utf8').includes('ext-kit'));
});

test('contracts accept the demo payloads and reject malformed ones', () => {
  assert.equal(validate(schema('inbox.json'), INBOX), null);
  assert.equal(validate(schema('thread.json'), THREAD), null);
  assert.equal(validate(schema('message.json'), { account_id: '77', message: { sender: 'Vessa', text: 'Go north.', sender_html: '<b>Vessa</b>' } }), null);
  assert.equal(validate(schema('action.json'), { action: 'reply', account_id: '77', text: 'hi' }), null);
  assert.match(validate(schema('inbox.json'), {}), /threads: required/);
  assert.match(validate(schema('inbox.json'), { threads: [{ account_key: 'x' }] }), /account_id: required/);
  assert.match(validate(schema('thread.json'), { account_id: 1 }), /messages: required/);
  assert.match(validate(schema('message.json'), { account_id: 1, message: { text: 3 } }), /expected string/);
  assert.match(validate(schema('action.json'), { action: 'take', account_id: '1' }), /not one of/);
});

test('the panel: show auto, role staff, in the Views menu; the Show panel row is the host\'s', async () => {
  const host = await boot();
  const p = host.panels.get('assist');
  assert.equal(p.show, 'auto');
  assert.equal(p.role, 'staff');
  assert.equal(p.title, 'Assist');
  assert.notEqual(p.inViewsMenu, false);
  const keys = host.settingsSchema.items.map((i) => i.key);
  assert.deepEqual(keys, ['assist.source', 'assist.rich']);
  await host.unload();
});

test('an inbox marks the session staff, touches the panel, and renders the rows oldest-first by created', async () => {
  const host = await boot();
  host.gmcp('s1', 'Client.Assist.Inbox', INBOX);
  assert.deepEqual(host.sessions.find((s) => s.id === 's1').roles, ['staff']);
  assert.ok(calls(host, 'panels.touch').some((c) => c.args[0] === 'assist' && c.args[1] === 's1'));
  assert.ok(!calls(host, 'panels.touch').some((c) => c.args[1] === 's2'), 'per session');
  const v = mount(host, 's1');
  assert.ok(v.el.classList.contains('mx') && v.el.classList.contains('assist'));
  assert.equal(v.el.dataset.testid, 'assist');
  assert.equal(v.$('.tag').textContent, 'Assist');
  assert.ok(v.$('.tag').classList.contains('glow-text'));
  assert.equal(v.$('.sub').textContent, 'help desk');
  assert.equal(v.$('[data-testid=assist-count]').textContent, '2 open');
  assert.deepEqual(v.$$('.row .who').map((e) => e.textContent), ['tallow', 'newbie-ash'], 'no created: the game\'s order');
  const r81 = v.$('.row[data-id="81"]');
  assert.ok(r81.classList.contains('sh-row') && r81.tagName === 'BUTTON');
  assert.equal(r81.querySelector('.asg').textContent, 'Vessa');
  assert.equal(r81.querySelector('.asg').title, 'claimed by Vessa');
  assert.equal(r81.querySelector('.status').className, 'sh-plate gold status');
  assert.equal(v.$('.row[data-id="77"] .status').className, 'sh-plate hot status');
  assert.deepEqual([...r81.querySelectorAll('.age')].map((e) => e.textContent), ['44m', '· 2']);
  assert.equal(v.$('.row[data-id="77"] .prev').textContent, 'How do I get out of the chapel?');
  const now = Math.floor(Date.now() / 1000);
  host.gmcp('s1', 'Client.Assist.Inbox', { threads: [{ account_id: 1, account_key: 'late', created: now - 30 }, { account_id: 2, account_key: 'early', created: now - 3 * 3600 }, { account_id: 3, account_key: 'nostatus' }] });
  assert.deepEqual(v.$$('.row .who').map((e) => e.textContent), ['early', 'late', 'nostatus']);
  assert.deepEqual(v.$$('.row .status').map((e) => e.textContent), ['open', 'open', 'open'], 'status defaults to open');
  assert.equal(v.$('.row[data-id="1"] .age').textContent, 'now');
  assert.equal(v.$('.row[data-id="2"] .age').textContent, '3h');
  assert.equal(v.$('.row[data-id="3"] .age'), null, 'no age without created / age_mins');
  host.gmcp('s1', 'Client.Assist.Inbox', { threads: [] });
  assert.equal(v.$('[data-testid=assist-empty]').textContent, 'No open tickets.');
  assert.equal(v.$('[data-testid=assist-count]').textContent, '0 open');
  v.unmount();
  await host.unload();
});

test('text helpers: ages, clock, plates, who', async () => {
  const t = await load('src/text.ts');
  const now = Date.UTC(2026, 0, 1);
  assert.equal(t.age({ created: now / 1000 - 20 }, now), 'now');
  assert.equal(t.age({ created: now - 5 * 60000 }, now), '5m', 'ms epoch');
  assert.equal(t.age({ age_mins: 59 }), '59m');
  assert.equal(t.age({ age_mins: 60 * 24 * 2 }), '2d');
  assert.equal(t.age({ age_mins: 0 }), 'now');
  assert.equal(t.age({}), '');
  assert.match(t.clock(1700000000), /^\d\d:\d\d$/);
  assert.equal(t.clock('nope'), '');
  const css = { plate: 'sh-plate', hot: 'hot', gold: 'gold', dim: 'dim' };
  assert.equal(t.plateOf('resolved', css), 'sh-plate dim');
  assert.equal(t.plateOf('closed', css), 'sh-plate dim');
  assert.equal(t.plateOf('weird', css), 'sh-plate');
  assert.equal(t.whoOf({ account_id: 9 }), '#9');
  assert.equal(t.whoOf({ account_id: 9, account_name: 'N' }), 'N');
});

test('open a thread: View is sent, the thread shows at once, then fills from Client.Assist.Thread', async () => {
  const host = await boot();
  host.gmcp('s1', 'Client.Assist.Inbox', INBOX);
  const v = mount(host, 's1');
  v.$('.row[data-id="77"]').click();
  await tick();
  assert.deepEqual(commands(host), ['@assistview #77']);
  assert.equal(v.$('[data-testid=assist-back]').textContent, 'Inbox');
  assert.ok(v.$('[data-testid=assist-back]').classList.contains('sh-cmd'));
  assert.equal(v.$('[data-testid=assist-count]'), null);
  assert.equal(v.$('.petitioner').firstChild.textContent, 'newbie-ash');
  assert.equal(v.$('.petitioner .acct').textContent, 'Pell');
  assert.equal(v.$('[data-testid=assist-plate]').textContent, 'open');
  assert.equal(v.$('[data-testid=assist-msgs] .empty').textContent, 'No messages in this thread.');
  assert.equal(v.$('[data-testid=assist-reply]').placeholder, 'Reply to newbie-ash');
  assert.equal(v.$('[data-testid=assist-reply]').getAttribute('aria-label'), 'assist reply');
  assert.equal(v.$('.chev').textContent, '>');
  host.gmcp('s1', 'Client.Assist.Thread', THREAD);
  assert.equal(v.$$('[data-testid=assist-msgs] .m').length, 1);
  assert.equal(v.$('.m .s').textContent, 'Pell');
  assert.equal(v.$('.m .t').textContent, 'How do I get out of the chapel?');
  assert.match(v.$('.m .ts').textContent, /^\d\d:\d\d$/);
  host.gmcp('s1', 'Client.Assist.Message', { account_id: 77, message: { sender: 'Vessa', text: 'Go north.', visibility: 'internal' } });
  assert.equal(v.$$('.m').length, 2);
  assert.ok(v.$$('.m')[1].classList.contains('note'));
  assert.equal(v.$$('.m')[1].querySelector('.ts'), null);
  v.$('[data-testid=assist-back]').click();
  assert.equal(v.$('.row[data-id="77"] .prev').textContent, 'Go north.', 'the row follows the last message');
  assert.equal(v.$$('.row[data-id="77"] .age')[1].textContent, '· 2');
  v.unmount();
  await host.unload();
});

test('claim, status and reply run the actions with the default commands; the select shows the status', async () => {
  const host = await boot();
  host.gmcp('s1', 'Client.Assist.Inbox', INBOX);
  const v = mount(host, 's1');
  v.$('.row[data-id="81"]').click();
  const sel = v.$('[data-testid=assist-status]');
  assert.ok(sel.classList.contains('sh-field'));
  assert.equal(sel.value, 'pending');
  assert.deepEqual([...sel.options].map((o) => o.value), ['open', 'pending', 'resolved']);
  assert.equal(v.$('[data-action=claim]').textContent, 'Claimed · Vessa');
  assert.ok(v.$('[data-action=claim]').classList.contains('sh-cmd'));
  v.$('[data-action=claim]').click();
  sel.value = 'resolved';
  sel.dispatchEvent(new Event('change'));
  const input = v.$('[data-testid=assist-reply]');
  input.value = '  Go north.  ';
  input.form.dispatchEvent(new Event('submit', { cancelable: true }));
  await tick();
  assert.deepEqual(commands(host), ['@assistview #81', '@assistclaim #81', '@assiststatus #81 resolved', '@assist #81 = Go north.']);
  assert.equal(v.$('[data-testid=assist-reply]').value, '', 'cleared after sending');
  input.value = '   ';
  input.form.dispatchEvent(new Event('submit', { cancelable: true }));
  await tick();
  assert.equal(commands(host).length, 4, 'a blank reply sends nothing');
  host.gmcp('s1', 'Client.Assist.Thread', { account_id: 81, status: 'escalated', messages: [] });
  assert.deepEqual([...v.$('[data-testid=assist-status]').options].map((o) => o.value), ['open', 'pending', 'resolved', 'escalated'], 'an unknown status is kept as an option');
  assert.equal(v.$('[data-testid=assist-status]').value, 'escalated');
  assert.equal(v.$('[data-testid=assist-plate]').className, 'sh-plate');
  const claim = host.actionRuns.find((r) => r.id === 'assist.claim');
  assert.deepEqual(claim.args, { account: '81', key: 'tallow' });
  v.unmount();
  await host.unload();
});

test('a Thread payload is copied: the game mutating its array later does not double a Message', async () => {
  const host = await boot();
  const msgs = [{ sender: 'Pell', text: 'a' }];
  host.gmcp('s1', 'Client.Assist.Thread', { account_id: 77, messages: msgs });
  msgs.push({ sender: 'Vessa', text: 'b' });
  host.mu.gmcp.state; // the in-page host can hand the same object over
  const fn = host.gmcpHandlers.find((x) => x.pkg === 'Client.Assist').fn;
  fn({ account_id: 77, messages: msgs }, { sid: 's1', pkg: 'Client.Assist.Thread', replay: false });
  msgs.push({ sender: 'Vessa', text: 'c' });
  fn({ account_id: 77, message: msgs.at(-1) }, { sid: 's1', pkg: 'Client.Assist.Message', replay: false });
  const v = mount(host, 's1');
  host.ext.api.set('inbox', { threads: [{ account_id: 77 }] }, 's1');
  v.$('.row[data-id="77"]').click();
  assert.deepEqual(v.$$('.m .t').map((e) => e.textContent), ['a', 'b', 'c']);
  v.unmount();
  await host.unload();
});

test('a reply draft survives a redraw and a remount', async () => {
  const host = await boot();
  host.gmcp('s1', 'Client.Assist.Inbox', INBOX);
  let v = mount(host, 's1');
  v.$('.row[data-id="77"]').click();
  const input = v.$('[data-testid=assist-reply]');
  input.value = 'half';
  input.dispatchEvent(new Event('input'));
  host.gmcp('s1', 'Client.Assist.Thread', THREAD);
  assert.equal(v.$('[data-testid=assist-reply]').value, 'half');
  v.unmount();
  v = mount(host, 's1');
  assert.equal(v.$('[data-testid=assist-reply]').value, 'half', 'the open thread and the draft are per session');
  v.unmount();
  await host.unload();
});

test('via gmcp sends Client.Assist.Action, matching its contract; a refused send falls back to the command', async () => {
  const host = await boot({ settings: { 'assist.action.reply.via': 'gmcp', 'assist.action.status.via': 'gmcp' } });
  host.gmcp('s1', 'Client.Assist.Inbox', INBOX);
  const v = mount(host, 's1');
  v.$('.row[data-id="77"]').click();
  const sel = v.$('[data-testid=assist-status]');
  sel.value = 'pending';
  sel.dispatchEvent(new Event('change'));
  const input = v.$('[data-testid=assist-reply]');
  input.value = 'hi';
  input.form.dispatchEvent(new Event('submit', { cancelable: true }));
  await tick();
  const sent = gmcpSent(host, 'Client.Assist.Action').map((s) => s.data);
  assert.deepEqual(sent, [{ action: 'status', account_id: '77', status: 'pending' }, { action: 'reply', account_id: '77', text: 'hi' }]);
  for (const d of sent) assert.equal(validate(schema('action.json'), d), null);
  host.gmcpOn = false;
  input.value = 'again';
  input.form.dispatchEvent(new Event('submit', { cancelable: true }));
  await tick();
  assert.equal(commands(host).at(-1), '@assist #77 = again');
  v.unmount();
  await host.unload();
});

test('an action set to hidden drops its control', async () => {
  const host = await boot({ settings: { 'assist.action.claim.via': 'none', 'assist.action.reply.via': 'none' } });
  host.gmcp('s1', 'Client.Assist.Inbox', INBOX);
  const v = mount(host, 's1');
  v.$('.row[data-id="77"]').click();
  assert.equal(v.$('[data-action=claim]'), null);
  assert.equal(v.$('[data-testid=assist-reply]'), null);
  assert.ok(v.$('[data-testid=assist-status]'));
  v.unmount();
  await host.unload();
});

test('new requests: a keyed mention each, the tab badge counts unviewed ones, the first inbox is not news', async () => {
  const host = await boot();
  host.gmcp('s1', 'Client.Assist.Inbox', INBOX);
  assert.deepEqual(mentions(host), [], 'the first inbox a world gets marks everything seen');
  assert.equal(lastBadge(host, 's1'), null);
  host.gmcp('s1', 'Client.Assist.Inbox', { threads: [...INBOX.threads, { account_id: 90, account_key: 'wisp', preview: 'stuck' }] });
  assert.deepEqual(mentions(host), [{ sid: 's1', title: 'New ticket', body: 'wisp', key: 'assist:90' }]);
  assert.deepEqual(lastBadge(host, 's1'), { count: 1 });
  const v = mount(host, 's1');
  assert.ok(v.$('.row[data-id="90"]').classList.contains('hot'), 'an unviewed new row is hot');
  host.gmcp('s1', 'Client.Assist.Inbox', { threads: [...INBOX.threads, { account_id: 90, account_key: 'wisp' }] });
  assert.equal(mentions(host).length, 1, 'once per request');
  v.$('.row[data-id="90"]').click();
  assert.equal(lastBadge(host, 's1'), null, 'viewing it clears the badge');
  v.$('[data-testid=assist-back]').click();
  assert.ok(!v.$('.row[data-id="90"]').classList.contains('hot'));
  host.gmcp('s1', 'Client.Assist.Inbox', { threads: [1, 2, 3, 4].map((n) => ({ account_id: 100 + n, account_key: `k${n}` })) });
  const burst = mentions(host).at(-1);
  assert.equal(burst.title, '4 new tickets');
  assert.equal(burst.body, 'k1 · k2 · k3');
  assert.equal(mentions(host).length, 2, 'a burst is one mention');
  assert.deepEqual(lastBadge(host, 's1'), { count: 4 });
  v.unmount();
  await host.unload();
});

test('seen marks are synced per world: another device of the player does not announce them again', async () => {
  const host = await boot();
  host.gmcp('s1', 'Client.Assist.Inbox', INBOX);
  host.gmcp('s1', 'Client.Assist.Inbox', { threads: [{ account_id: 90 }] });
  const store = host.mu.storage.world('w1', { sync: true });
  assert.deepEqual(store.get('seen.assist'), ['81', '77', '90']);
  // a second session of the same world (another tab) sees the same marks
  host.open({ id: 's3', worldId: 'w1' });
  host.gmcp('s3', 'Client.Assist.Inbox', { threads: [{ account_id: 90 }, { account_id: 77 }] });
  assert.equal(mentions(host).length, 1);
  await host.unload();
});

test('a replayed inbox is not news; a replayed Message is not appended twice', async () => {
  const host = await boot();
  host.gmcp('s1', 'Client.Assist.Inbox', INBOX);
  host.gmcp('s1', 'Client.Assist.Thread', THREAD);
  const fn = host.gmcpHandlers.find((x) => x.pkg === 'Client.Assist').fn;
  fn({ threads: [{ account_id: 5 }] }, { sid: 's1', pkg: 'Client.Assist.Inbox', replay: true });
  assert.equal(mentions(host).length, 0);
  assert.equal(lastBadge(host, 's1') ?? null, null);
  fn({ account_id: 77, message: { sender: 'Pell', text: 'x' } }, { sid: 's1', pkg: 'Client.Assist.Message', replay: true });
  const v = mount(host, 's1');
  host.gmcp('s1', 'Client.Assist.Inbox', INBOX);
  v.$('.row[data-id="77"]').click();
  assert.equal(v.$$('.m').length, 1);
  v.unmount();
  await host.unload();
});

test('rich text: html bodies and sender_html are sanitized in; off shows plain text', async () => {
  const host = await boot();
  host.gmcp('s1', 'Client.Assist.Inbox', INBOX);
  host.gmcp('s1', 'Client.Assist.Thread', { account_id: 77, messages: [{ sender: 'Pell', sender_html: '<b>Pell</b>', text: 'plain', html: '<i>rich</i><script>x()</script>' }, { sender: 'Vessa', html: '<em>only html</em>' }] });
  const v = mount(host, 's1');
  v.$('.row[data-id="77"]').click();
  assert.equal(v.$('.m .s b').textContent, 'Pell');
  assert.equal(v.$('.m .t i').textContent, 'rich');
  assert.equal(v.$('.m .t script'), null);
  host.mu.settings.set('assist.rich', false);
  assert.equal(v.$('.m .t').textContent, 'plain');
  assert.equal(v.$('.m .s b'), null);
  assert.equal(v.$$('.m')[1].querySelector('.t').textContent, 'only html', 'html-only falls back to its text');
  v.unmount();
  await host.unload();
});

test('state is per session: s2 has its own inbox, open thread and badge; closing a session drops it', async () => {
  const host = await boot();
  host.gmcp('s1', 'Client.Assist.Inbox', INBOX);
  const a = mount(host, 's1'), b = mount(host, 's2');
  assert.equal(b.$('[data-testid=assist-empty]').textContent, 'No open tickets.');
  assert.deepEqual(host.sessions.find((s) => s.id === 's2').roles, [], 's2 is not staff');
  a.$('.row[data-id="77"]').click();
  assert.ok(a.$('[data-testid=assist-thread]'));
  assert.ok(b.$('[data-testid=assist-list]'));
  host.close('s1');
  assert.equal(host.ext.api.get('inbox', 's1').length, 0);
  a.unmount(); b.unmount();
  await host.unload();
});

test('Driven by: gmcp-only ignores the API, api-only ignores GMCP; Show panel off ignores both', async () => {
  const host = await boot({ settings: { 'assist.source': 'api' } });
  const api = host.ext.api;
  host.gmcp('s1', 'Client.Assist.Inbox', INBOX);
  assert.equal(api.get('inbox', 's1').length, 0);
  api.set('inbox', INBOX, 's1');
  assert.equal(api.get('inbox', 's1').length, 2);
  api.configure({ source: 'gmcp' });
  api.set('inbox', { threads: [] }, 's1');
  assert.equal(api.get('inbox', 's1').length, 2);
  api.configure({ source: 'both', enabled: 'off' });
  assert.equal(host.setting('assist.enabled'), 'off');
  host.gmcp('s1', 'Client.Assist.Inbox', { threads: [] });
  assert.equal(api.get('inbox', 's1').length, 2);
  await host.unload();
});

test('Core.Supports holds Client.Assist 1 while not off', async () => {
  const host = await boot();
  assert.deepEqual(calls(host, 'gmcp.supports').map((c) => c.args[0]), [['Client.Assist 1']]);
  host.ext.api.enable('off');
  assert.equal(calls(host, 'gmcp.supports').length, 1, 'off: not asked again');
  await host.unload();
});

test('the exported API: set / upsert / remove / push / get / setRole / open / configure', async () => {
  const host = await boot();
  const api = host.ext.api;
  api.set('inbox', INBOX, 's1');
  api.upsert('thread', { account_id: 77, status: 'pending' }, 's1');
  api.upsert('thread', { account_id: 5, account_key: 'new' }, 's1');
  assert.deepEqual(api.get('inbox', 's1').map((t) => [t.account_id, t.status]), [['81', 'pending'], ['77', 'pending'], ['5', undefined]]);
  api.remove('thread', 81, 's1');
  assert.deepEqual(api.get('inbox', 's1').map((t) => t.account_id), ['77', '5']);
  api.set('thread', THREAD, 's1');
  api.push('message', { account_id: 77, message: { sender: 'V', text: 'ok' } }, 's1');
  assert.equal(api.get('inbox', 's1')[0].preview, 'ok');
  api.setRole('staff', 's2');
  assert.deepEqual(host.sessions.find((x) => x.id === 's2').roles, ['staff'], 'setRole staff provides the role');
  api.setRole('player', 's2');
  api.open();
  assert.ok(calls(host, 'panels.open').some((c) => c.args[0] === 'assist') || host.calls.some((c) => c.path === 'panels.open'));
  api.configure({ actions: { reply: { via: 'gmcp', cmd: 'xassistreply {key} {text}' } } });
  assert.equal(host.setting('assist.action.reply.via'), 'gmcp');
  assert.equal(host.setting('assist.action.reply.cmd'), 'xassistreply {key} {text}');
  assert.throws(() => api.configure({ actions: { take: {} } }), /Assist: no action "take"/);
  await host.unload();
});

test('onAction: a handler sees the old args and session shape, true swallows the send, and it goes with the caller', async () => {
  const host = await boot();
  const api = host.ext.api;
  const seen = [];
  const off = api.onAction('claim', async (args, s) => { seen.push([args, s.sid, typeof s.send, typeof s.gmcp]); return true; });
  host.gmcp('s1', 'Client.Assist.Inbox', INBOX);
  const v = mount(host, 's1');
  v.$('.row[data-id="77"]').click();
  v.$('[data-action=claim]').click();
  await tick();
  assert.deepEqual(seen, [[{ action: 'claim', account: '77', key: 'newbie-ash' }, 's1', 'function', 'function']]);
  assert.deepEqual(commands(host), ['@assistview #77'], 'handled: nothing sent');
  off();
  v.$('[data-action=claim]').click();
  await tick();
  assert.deepEqual(commands(host), ['@assistview #77', '@assistclaim #77']);
  v.unmount();
  await host.unload();
});

test('the CSS is scoped to the panel, uses theme tokens only, and square 1px rules', async () => {
  const { CSS: css } = await load('src/css.ts');
  const rules = css.split('}').map((r) => r.trim()).filter(Boolean);
  for (const r of rules) { const sel = r.replace(/^@media[^{]*\{/, '').split('{')[0].trim(); for (const s of sel.split(/,(?![^(]*\))/)) assert.match(s.trim(), /^\.ext-panel\[data-ext="assist"\] \.mx\.assist/, s); }
  assert.ok(!/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i.test(css), 'no literal colours');
  assert.ok(!/border-radius:\s*[1-9]/.test(css));
  assert.ok(!/transition|animation/.test(css), 'no motion of our own');
  assert.ok(!/font-weight:\s*(?!400|500)\d/.test(css));
});

test('unload disposes the handlers, the role and the panel', async () => {
  const host = await boot();
  host.gmcp('s1', 'Client.Assist.Inbox', INBOX);
  await host.unload();
  assert.deepEqual(host.errors, []);
  assert.deepEqual(host.live().filter((l) => !/^(log|ui\.css)/.test(l.path ?? '')), [], 'nothing left registered');
});
