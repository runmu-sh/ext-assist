/**
 * @runmu.sh/ext-assist: the Assist help desk (R-MOD-ASSIST), after Underspire's template 5380–5391
 * (06-world-modules §4). GMCP in: Client.Assist.Inbox / Thread / Message. Actions: view, claim, status,
 * reply (default `@assistview #{account}` … `@assist #{account} = {text}`). `activate` returns the
 * AssistApi (./types.ts).
 */
import { defineExtension, type Dispose, type Mu, type PanelMountCtx } from '@muclient/sdk';
import { WorldModule, replay } from '@runmu.sh/ext-kit/module';
import { MODULE_CSS } from '@runmu.sh/ext-kit/css';
import { h, fill, age, clock, body } from '@runmu.sh/ext-kit/dom';
import type { Schema } from '@runmu.sh/ext-kit/schema';
import type { AssistApi, Message, Thread } from './types';

const P = 'Client.Assist';
const idS: Schema = { type: ['string', 'integer'] };
const msgS: Schema = { type: 'object', properties: { text: { type: 'string' }, html: { type: 'string' }, sender: { type: 'string' }, ts: { type: ['number', 'string'] } } };
const threadS: Schema = {
  type: 'object', required: ['account_id'],
  properties: { account_id: idS, account_key: { type: 'string' }, account_name: { type: 'string' }, assignee: { type: 'string' }, status: { type: 'string' }, age_mins: { type: 'number' }, count: { type: 'integer' }, preview: { type: 'string' }, messages: { type: 'array', items: msgS } },
};
const SCHEMAS: Record<string, Schema> = {
  Inbox: { type: 'object', required: ['threads'], properties: { threads: { type: 'array', items: threadS } } },
  Thread: { ...threadS, required: ['account_id', 'messages'] },
  Message: { type: 'object', required: ['account_id', 'message'], properties: { account_id: idS, message: msgS } },
};
const STATUSES = ['open', 'pending', 'resolved'];
/** Status plates (06 §4): open waits on staff (hot), pending on the player (gold), resolved is dim. */
const PLATE: Record<string, string> = { open: 'hot', pending: 'gold', resolved: 'dim' };
const plate = (s: string) => `sh-plate ${PLATE[s] ?? ''}`.trim();

interface St { inbox: Thread[]; threads: Map<string, Thread>; fresh: Set<string> }

export default defineExtension({
  activate(ctx) {
    const mu: Mu = ctx.mu;
    const stOf = new Map<string, St>();
    const S = (sid: string) => stOf.get(sid) ?? stOf.set(sid, { inbox: [], threads: new Map(), fresh: new Set() }).get(sid)!;
    const active = () => mu.sessions.active()?.id ?? null;
    const need = (sid?: string) => { const s = sid ?? active(); if (!s) throw new Error('no active session'); return s; };
    const key = (t: { account_id: string | number }) => String(t.account_id);

    const mod = new WorldModule(mu, {
      key: 'assist', title: 'Assist', panels: ['assist'], pkg: P, staff: true,
      actions: {
        view: { label: 'View', via: 'command', cmd: '@assistview #{account}' },
        claim: { label: 'Claim', via: 'command', cmd: '@assistclaim #{account}' },
        status: { label: 'Status', via: 'command', cmd: '@assiststatus #{account} {status}' },
        reply: { label: 'Reply', via: 'command', cmd: '@assist #{account} = {text}' },
      },
      gmcpAction: (a, v) => [`${P}.Action`, { action: a, account_id: v.account, ...(v.status ? { status: v.status } : {}), ...(v.text ? { text: v.text } : {}) }],
      options: [{ key: 'rich', label: 'Rich text in messages', default: false, kind: 'toggle', scope: 'both' }],
    });
    mu.ui.style(MODULE_CSS);
    mu.settings.define({ title: 'Assist', items: mod.settingItems() });

    const redraws = new Set<() => void>();
    const redraw = () => redraws.forEach((f) => f());
    const setInbox = (sid: string, list: Thread[]) => {
      const st = S(sid);
      st.inbox = list.map((t) => ({ ...t, account_id: key(t) }));
      const fresh = mod.fresh(sid, st.inbox.map(key));
      for (const id of fresh) st.fresh.add(id);
      mod.announce(st.inbox.filter((t) => fresh.includes(key(t))).map((t) => ({ title: `Help request from ${t.account_key ?? t.account_name ?? '#' + key(t)}`, body: t.preview })));
      // An inbox is only ever sent to staff.
      mod.setStaff(sid, true);
      mod.touched(sid);
      redraw();
    };
    const setThread = (sid: string, t: Thread) => {
      const st = S(sid), id = key(t);
      st.threads.set(id, { ...st.threads.get(id), ...t, account_id: id });
      const row = st.inbox.find((x) => key(x) === id);
      if (row && t.account_key) row.account_key = t.account_key;
      redraw();
    };
    const pushMessage = (sid: string, d: { account_id: string | number; message: Message }) => {
      const st = S(sid), id = key(d);
      const t = st.threads.get(id);
      if (t) t.messages = [...(t.messages ?? []), d.message];
      const row = st.inbox.find((x) => key(x) === id);
      if (row) { row.count = (row.count ?? 0) + 1; row.preview = d.message.text ?? row.preview; }
      redraw();
    };
    const handle = (pkg: string, data: unknown, sid: string) => {
      const sub = pkg.slice(P.length + 1);
      const schema = SCHEMAS[sub];
      if (!schema || !mod.acceptsGmcp(sid) || !mod.check(sid, pkg, schema, data)) return;
      const d = data as any;
      if (sub === 'Inbox') setInbox(sid, d.threads);
      else if (sub === 'Thread') { setThread(sid, d); mod.touched(sid); }
      else pushMessage(sid, d);
    };
    mu.gmcp.on(P, (data, { sid, pkg }) => handle(pkg, data, sid));
    replay(mu, [`${P}.Inbox`], handle);

    const views = new Map<string, { open: string | null; draft: string }>();
    const viewOf = (sid: string) => views.get(sid) ?? views.set(sid, { open: null, draft: '' }).get(sid)!;

    function mount(el: HTMLElement, pc: PanelMountCtx): Dispose {
      el.classList.add('mx', 'assist');
      el.dataset.testid = 'assist';
      const draw = () => {
        const sid = pc.sid ?? active();
        const focused = el.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.focus : undefined;
        if (!sid) { fill(el, h('p', { class: 'empty' }, 'No session')); return; }
        const st = S(sid), v = viewOf(sid);
        const head = (...extra: Array<Node | null>) => h('div', { class: 'hd' }, h('span', { class: 'tag glow-text' }, 'Assist'), h('span', { class: 'sub' }, 'help desk'), ...extra);
        if (!v.open) {
          fill(el, head(st.inbox.length ? h('span', { class: 'count', 'data-testid': 'assist-count' }, String(st.inbox.length)) : null),
            h('div', { class: 'list', 'data-testid': 'assist-list' },
              st.inbox.length ? st.inbox.map((t) => h('button', {
                class: `sh-row row ticket${st.fresh.has(key(t)) ? ' hot' : ''}`, type: 'button', 'data-id': key(t), 'data-focus': `row-${key(t)}`,
                onclick: () => { v.open = key(t); st.fresh.delete(key(t)); draw(); void mod.run('view', { account: key(t) }, sid); },
              },
                h('span', { class: 'r1' }, h('span', { class: 'who' }, t.account_key ?? t.account_name ?? `#${key(t)}`),
                  h('span', { class: 'meta' }, t.assignee ? h('span', { class: 'asg', title: `claimed by ${t.assignee}` }, t.assignee) : null,
                    t.status ? h('span', { class: `${plate(t.status)} status` }, t.status) : null,
                    h('span', { class: 'age' }, age(t.age_mins)), t.count ? h('span', { class: 'age', title: 'messages' }, `· ${t.count}`) : null)),
                t.preview ? h('span', { class: 'prev' }, t.preview) : null)) : h('p', { class: 'empty', 'data-testid': 'assist-empty' }, 'No open tickets.')));
        } else {
          const id = v.open;
          const t: Thread = { ...st.inbox.find((x) => key(x) === id), ...st.threads.get(id), account_id: id };
          const rich = mod.option<boolean>('rich', sid);
          fill(el, head(h('button', { class: 'sh-cmd back', type: 'button', 'data-testid': 'assist-back', 'data-focus': 'back', onclick: () => { v.open = null; draw(); } }, 'Inbox')),
            h('div', { class: 'convo', 'data-testid': 'assist-thread' },
              h('div', { class: 'who-head' },
                h('span', { class: 'petitioner' }, t.account_key ?? t.account_name ?? `#${id}`, t.account_name && t.account_key ? h('span', { class: 'acct' }, t.account_name) : null),
                t.status ? h('span', { class: plate(t.status), 'data-testid': 'assist-plate' }, t.status) : null,
                h('span', { class: 'actions' },
                  mod.shows('status', sid) ? h('select', {
                    class: 'sh-field act', 'aria-label': 'status', 'data-testid': 'assist-status', 'data-focus': 'status',
                    onchange: (e: Event) => { const s = (e.target as HTMLSelectElement).value; void mod.run('status', { account: id, status: s }, sid); },
                  }, STATUSES.map((s) => h('option', { value: s, ...(s === (t.status ?? 'open') ? { selected: true } : {}) }, s))) : null,
                  mod.shows('claim', sid) ? h('button', { class: 'sh-cmd act', type: 'button', 'data-action': 'claim', 'data-focus': 'claim', onclick: () => void mod.run('claim', { account: id }, sid) }, t.assignee ? `Claimed · ${t.assignee}` : 'Claim') : null)),
              h('div', { class: 'msgs', 'data-testid': 'assist-msgs' },
                t.messages?.length ? t.messages.map((m) => h('div', { class: `m${m.visibility === 'internal' ? ' note' : ''}` },
                  m.ts !== undefined ? h('span', { class: 'ts' }, clock(m.ts)) : null,
                  h('span', { class: 's' }, m.sender ?? '?'), h('span', { class: 't' }, body(m, rich)))) : h('p', { class: 'empty' }, 'No messages in this thread.')),
              mod.shows('reply', sid) ? h('form', {
                class: 'reply', onsubmit: async (e: Event) => {
                  e.preventDefault();
                  const input = el.querySelector<HTMLInputElement>('[data-testid=assist-reply]')!;
                  const text = input.value.trim();
                  if (!text) return;
                  await mod.run('reply', { account: id, text }, sid);
                  input.value = ''; v.draft = '';
                },
              }, h('span', { class: 'chev glow-text', 'aria-hidden': 'true' }, '>'),
                h('input', { type: 'text', 'aria-label': 'assist reply', placeholder: 'Reply', autocomplete: 'off', value: v.draft, 'data-testid': 'assist-reply', 'data-focus': 'reply', oninput: (e: Event) => { v.draft = (e.target as HTMLInputElement).value; } })) : null));
        }
        if (focused) (el.querySelector(`[data-focus="${focused}"]`) as HTMLElement | null)?.focus();
      };
      redraws.add(draw);
      const off = mu.sessions.on('switch', () => draw());
      draw();
      return () => { redraws.delete(draw); off(); el.replaceChildren(); };
    }
    mu.panels.register({ id: 'assist', title: 'Assist', singleton: true, defaultPosition: 'right-bottom', inViewsMenu: false, mount });
    // Views visibility, Core.Supports and redraws follow the mode and role once the panels exist.
    ctx.subscriptions.push(...mod.bind(), mod.onChange(redraw));

    const api: AssistApi = {
      enable: (mode, w) => mod.configure({ enabled: mode }, w),
      setRole: (role, sid) => mod.setStaff(need(sid), role === 'staff'),
      open: () => mu.panels.open('assist'),
      set(what: 'inbox' | 'thread', data: any, sid?: string) {
        const s = need(sid);
        if (!mod.acceptsApi(s)) return;
        if (what === 'inbox') setInbox(s, data.threads ?? []); else { setThread(s, data); mod.touched(s); }
      },
      upsert(_w, t, sid) {
        const s = need(sid), st = S(s), id = key(t);
        const row = st.inbox.find((x) => key(x) === id);
        if (row) Object.assign(row, t, { account_id: id }); else st.inbox.push({ ...t, account_id: id });
        const th = st.threads.get(id);
        if (th) Object.assign(th, t, { account_id: id });
        mod.touched(s);
        redraw();
      },
      remove(_w, accountId, sid) { const st = S(need(sid)); st.inbox = st.inbox.filter((x) => key(x) !== String(accountId)); redraw(); },
      push: (_w, m, sid) => pushMessage(need(sid), m),
      get: (_w, sid) => [...S(need(sid)).inbox],
      onAction: (a, fn) => mod.onAction(a, fn as never),
      configure: (cfg, w) => mod.configure(cfg, w),
    };
    return api;
  },
});
