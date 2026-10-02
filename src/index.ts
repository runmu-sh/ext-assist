/**
 * @runmu.sh/ext-assist: the Assist help desk, after Underspire's Assist view.
 *
 * GMCP in (checked by the host against schema/*.json before any handler runs): Client.Assist.Inbox / Thread /
 * Message. Out: Client.Assist.Action (when an action's via is `gmcp`). Actions (`mu.actions`, ids `assist.view`,
 * `assist.claim`, `assist.status`, `assist.reply`): default `@assistview #{account}` … `@assist #{account} = {text}`.
 * The panel is `show: 'auto'` and `role: 'staff'`; an Inbox marks the session staff (`provideIdentity`). New
 * requests raise a mention (once per player: synced seen marks, keyed) and count on the panel's tab badge until
 * viewed. The API (./types.ts) is exported per caller with `ctx.exports`.
 */
import { defineExtension, h, type ActionSession as HostSession, type Dispose, type Mu, type PanelMountCtx } from '@muclient/sdk';
import { CSS } from './css';
import { age, clock, plateOf, sortInbox, whoOf } from './text';
import type { ActionArgs, ActionHandler, ActionSession, AssistApi, Message, Mode, Source, Thread } from './types';

const P = 'Client.Assist';
const PANEL = 'assist';
const STATUSES = ['open', 'pending', 'resolved'];
const ACTIONS = { view: 'assist.view', claim: 'assist.claim', status: 'assist.status', reply: 'assist.reply' } as const;
type ActionName = keyof typeof ACTIONS;
/** The seen marks (what counts as new), per world on every device of the player. */
const SEEN = 'seen.assist';
const SEEN_MAX = 1000;
/** More new requests than this at once raise one "N new tickets" mention. */
const BURST = 3;

interface St { inbox: Thread[]; threads: Map<string, Thread>; fresh: Set<string>; open: string | null; draft: string; staff: Dispose | null }

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const idOk = (v: unknown): v is string | number => typeof v === 'string' || typeof v === 'number';
const key = (t: { account_id: string | number }) => String(t.account_id);

export default defineExtension({
  activate(ctx) {
    const mu: Mu = ctx.mu;
    const subs = ctx.subscriptions;

    // ── per-session state (dropped when the session closes) ──
    const states = new Map<string, St>();
    const S = (sid: string): St => states.get(sid) ?? states.set(sid, { inbox: [], threads: new Map(), fresh: new Set(), open: null, draft: '', staff: null }).get(sid)!;
    subs.push(mu.sessions.each((s) => () => { states.get(s.id)?.staff?.(); states.delete(s.id); lastBadge.delete(s.id); }));
    const active = () => mu.sessions.active()?.id ?? null;
    const need = (sid?: string) => { const s = sid ?? active(); if (!s) throw new Error('assist: no active session'); return s; };
    const sessionOf = (sid: string) => mu.sessions.list().find((s) => s.id === sid) ?? null;

    // ── settings: Show panel (the host's row, from `show: 'auto'`), Driven by, Rich text, and the actions' rows ──
    mu.ui.style(CSS);
    mu.settings.define({
      title: 'Assist',
      items: [
        { key: 'assist.source', label: 'Driven by', default: 'both', kind: 'select', scope: 'world', group: 'Assist', options: [{ value: 'both', label: 'gmcp + api' }, { value: 'gmcp', label: 'gmcp' }, { value: 'api', label: 'api' }] },
        { key: 'assist.rich', label: 'Rich text in messages', default: true, kind: 'toggle', scope: 'both', group: 'Assist' },
      ],
    });
    const setting = <T>(k: string, sid: string | null, fallback: T): T => {
      try { const v = mu.settings.get<T>(k, sid ? { sid } : undefined); return v === undefined || v === null ? fallback : v; } catch { return fallback; }
    };
    const mode = (sid: string | null): Mode => { const v = setting<string>('assist.enabled', sid, 'auto'); return v === 'off' || v === 'on' ? v : 'auto'; };
    const source = (sid: string | null): Source => { const v = setting<string>('assist.source', sid, 'both'); return v === 'gmcp' || v === 'api' ? v : 'both'; };
    const acceptsGmcp = (sid: string) => mode(sid) !== 'off' && source(sid) !== 'api';
    const acceptsApi = (sid: string) => mode(sid) !== 'off' && source(sid) !== 'gmcp';

    const ARGS = { account: { label: 'account id' }, key: { label: 'account key' } };
    const gmcpAction = (action: ActionName) => (v: Record<string, string>): [string, unknown] =>
      [`${P}.Action`, { action, account_id: v.account, ...(v.status ? { status: v.status } : {}), ...(v.text ? { text: v.text } : {}) }];
    mu.actions.define({ id: ACTIONS.view, label: 'View', group: 'Assist', via: 'command', command: '@assistview #{account}', gmcp: gmcpAction('view'), args: ARGS });
    mu.actions.define({ id: ACTIONS.claim, label: 'Claim', group: 'Assist', via: 'command', command: '@assistclaim #{account}', gmcp: gmcpAction('claim'), args: ARGS });
    mu.actions.define({ id: ACTIONS.status, label: 'Status', group: 'Assist', via: 'command', command: '@assiststatus #{account} {status}', gmcp: gmcpAction('status'), args: { ...ARGS, status: { label: 'open, pending or resolved' } } });
    mu.actions.define({ id: ACTIONS.reply, label: 'Reply', group: 'Assist', via: 'command', command: '@assist #{account} = {text}', gmcp: gmcpAction('reply'), args: { ...ARGS, text: { label: 'reply' } } });
    const shows = (a: ActionName, sid: string) => { try { return mu.actions.visible(ACTIONS[a], sid); } catch { return true; } };
    /** Run an action with the thread's account id and key (`{account}`, `{key}`). */
    // Unkeyed: a click happens in one client, and a keyed line is not echoed in the output.
    const run = (a: ActionName, sid: string, id: string, extra: Record<string, string> = {}) => {
      const t = threadOf(sid, id);
      return mu.actions.run(ACTIONS[a], { account: id, key: t.account_key || t.account_name || `#${id}`, ...extra }, { sid });
    };

    // ── the model ──
    const redraws = new Set<() => void>();
    const lastBadge = new Map<string, number>();
    let registered = false;
    const badge = (sid: string) => {
      if (!registered) return;
      const n = states.get(sid)?.fresh.size ?? 0;
      if ((lastBadge.get(sid) ?? 0) === n && lastBadge.has(sid)) return;
      lastBadge.set(sid, n);
      try { mu.panels.badge(PANEL, n ? { count: n } : null, sid); } catch (e) { mu.log.warn('assist: badge failed', e); }
    };
    const changed = (sid: string) => { badge(sid); for (const f of [...redraws]) f(); };
    const touch = (sid: string) => { if (registered) { try { mu.panels.touch(PANEL, sid); } catch { /* not offered */ } } };
    const setStaff = (sid: string, on: boolean) => {
      const st = S(sid);
      if (on && !st.staff) st.staff = mu.sessions.provideIdentity(sid, { roles: ['staff'] });
      if (!on && st.staff) { st.staff(); st.staff = null; }
    };
    const threadOf = (sid: string, id: string): Thread => {
      const st = S(sid);
      return { ...st.inbox.find((x) => key(x) === id), ...st.threads.get(id), account_id: id };
    };

    /** Ids not seen before in the session's world (marked seen now). The first inbox a world ever gets marks all. */
    const freshIds = (sid: string, ids: string[]): string[] => {
      const world = sessionOf(sid)?.worldId ?? null;
      const store = mu.storage.world(world, { sync: true });
      const had = store.get<string[] | undefined>(SEEN, undefined);
      const seen = new Set(had ?? []);
      const out = ids.filter((id) => !seen.has(id));
      if (out.length || !had) store.set(SEEN, [...seen, ...out].slice(-SEEN_MAX));
      return had ? out : [];
    };
    const announce = (sid: string, rows: Thread[]) => {
      if (!rows.length) return;
      if (rows.length > BURST) {
        void mu.notify.mention({ sid, title: `${rows.length} new tickets`, body: rows.slice(0, BURST).map(whoOf).join(' · '), key: `assist:${rows.map(key).sort().join(',')}` });
        return;
      }
      for (const t of rows) void mu.notify.mention({ sid, title: 'New ticket', body: whoOf(t), key: `assist:${key(t)}` });
    };

    const setInbox = (sid: string, list: Thread[], replay = false) => {
      const st = S(sid);
      st.inbox = sortInbox(list.filter((t) => isObj(t) && idOk(t.account_id)).map((t) => ({ ...t, account_id: key(t) })));
      const ids = new Set(st.inbox.map(key));
      for (const id of [...st.fresh]) if (!ids.has(id)) st.fresh.delete(id);
      const fresh = freshIds(sid, [...ids]);
      if (!replay) {
        for (const id of fresh) if (st.open !== id) st.fresh.add(id);
        announce(sid, st.inbox.filter((t) => fresh.includes(key(t))));
      }
      // An inbox is only ever sent to staff.
      setStaff(sid, true);
      touch(sid);
      changed(sid);
    };
    const setThread = (sid: string, t: Thread) => {
      const st = S(sid), id = key(t);
      st.threads.set(id, { ...st.threads.get(id), ...t, account_id: id, messages: Array.isArray(t.messages) ? [...t.messages] : st.threads.get(id)?.messages ?? [] });
      const row = st.inbox.find((x) => key(x) === id);
      if (row && t.account_key) row.account_key = t.account_key;
      touch(sid);
      changed(sid);
    };
    const pushMessage = (sid: string, d: { account_id: string | number; message: Message }) => {
      if (!isObj(d) || !idOk(d.account_id) || !isObj(d.message)) return;
      const st = S(sid), id = key(d);
      const t = st.threads.get(id);
      if (t) t.messages = [...(t.messages ?? []), d.message];
      const row = st.inbox.find((x) => key(x) === id);
      if (row) { row.count = (row.count ?? 0) + 1; row.preview = typeof d.message.text === "string" ? d.message.text : row.preview; }
      changed(sid);
    };

    subs.push(mu.gmcp.on(P, (data, meta) => {
      const { sid, pkg } = meta;
      if (!acceptsGmcp(sid)) return;
      const sub = pkg.slice(P.length + 1).toLowerCase();
      const d = data as any;
      if (sub === 'inbox') setInbox(sid, Array.isArray(d?.threads) ? d.threads : [], !!meta.replay);
      else if (sub === 'thread') { if (isObj(d) && idOk(d.account_id)) setThread(sid, d as unknown as Thread); }
      // A replayed Message is the last one again, already in a replayed Thread: appending it would repeat it.
      else if (sub === 'message') { if (!meta.replay) pushMessage(sid, d); }
    }));

    // ── the panel ──
    function mount(el: HTMLElement, pc: PanelMountCtx): Dispose {
      el.classList.add('mx', 'assist');
      el.dataset.testid = 'assist';
      const css = mu.ui.css;
      const fill = (...kids: Array<Node | null>) => el.replaceChildren(...kids.filter((k): k is Node => !!k));
      const draw = () => {
        const sid = pc.sid ?? active();
        const focused = el.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.focus : undefined;
        if (!sid) { fill(h('p', { class: 'empty' }, 'No session')); return; }
        const st = S(sid);
        const head = (...extra: Array<Node | null>) => h('div', { class: 'hd' }, h('span', { class: `tag ${css.glow}` }, 'Assist'), h('span', { class: 'sub' }, 'help desk'), ...extra);
        if (!st.open) {
          fill(head(h('span', { class: 'count', 'data-testid': 'assist-count' }, `${st.inbox.length} open`)),
            h('div', { class: 'list', 'data-testid': 'assist-list' },
              st.inbox.length ? st.inbox.map((t) => {
                const id = key(t), status = t.status || 'open';
                return h('button', {
                  class: `${css.row} row ticket${st.fresh.has(id) ? ` ${css.hot}` : ''}`, type: 'button', 'data-id': id, 'data-focus': `row-${id}`,
                  onclick: () => { st.open = id; st.fresh.delete(id); changed(sid); void run('view', sid, id); },
                },
                h('span', { class: 'r1' }, h('span', { class: 'who' }, whoOf(t)),
                  h('span', { class: 'meta' },
                    t.assignee ? h('span', { class: 'asg', title: `claimed by ${t.assignee}` }, t.assignee) : null,
                    h('span', { class: `${plateOf(status, css)} status` }, status),
                    age(t) ? h('span', { class: 'age' }, age(t)) : null,
                    t.count ? h('span', { class: 'age n', title: 'messages' }, `· ${t.count}`) : null)),
                t.preview ? h('span', { class: 'prev' }, t.preview) : null);
              }) : h('p', { class: 'empty', 'data-testid': 'assist-empty' }, 'No open tickets.')));
        } else {
          const id = st.open;
          const t = threadOf(sid, id);
          const status = t.status || 'open';
          const rich = setting<boolean>('assist.rich', sid, true);
          const who = whoOf(t);
          let input: HTMLInputElement | null = null;
          const msgBody = (m: Message): Node => {
            if (rich && m.html) { const s = h('span'); s.append(mu.ui.sanitize(m.html, 'inline')); return s; }
            return document.createTextNode(m.text ?? (m.html ? (mu.ui.sanitize(m.html, 'inline').textContent ?? '') : ''));
          };
          const sender = (m: Message): Node => {
            if (rich && m.sender_html) { const s = h('span', { class: 's' }); s.append(mu.ui.sanitize(m.sender_html, 'inline')); return s; }
            return h('span', { class: 's' }, m.sender ?? '?');
          };
          let select: HTMLSelectElement | null = null;
          fill(head(h('button', { class: `${css.cmd} back`, type: 'button', 'data-testid': 'assist-back', 'data-focus': 'back', onclick: () => { st.open = null; changed(sid); } }, 'Inbox')),
            h('div', { class: 'convo', 'data-testid': 'assist-thread' },
              h('div', { class: 'who-head' },
                h('span', { class: 'petitioner' }, who, t.account_name && t.account_key ? h('span', { class: 'acct' }, t.account_name) : null),
                h('span', { class: plateOf(status, css), 'data-testid': 'assist-plate' }, status),
                h('span', { class: 'actions' },
                  shows('status', sid) ? (select = h('select', {
                    class: `${css.field} act`, 'aria-label': 'status', 'data-testid': 'assist-status', 'data-focus': 'status',
                    onchange: (e: Event) => { void run('status', sid, id, { status: (e.target as HTMLSelectElement).value }); },
                  }, (STATUSES.includes(status) ? STATUSES : [...STATUSES, status]).map((s) => h('option', { value: s }, s)))) : null,
                  shows('claim', sid) ? h('button', {
                    class: `${css.cmd} act`, type: 'button', 'data-action': 'claim', 'data-focus': 'claim',
                    onclick: () => void run('claim', sid, id),
                  }, t.assignee ? `Claimed · ${t.assignee}` : 'Claim') : null)),
              h('div', { class: 'msgs', 'data-testid': 'assist-msgs' },
                t.messages?.length ? t.messages.map((m) => h('div', { class: `m${m.visibility === 'internal' ? ' note' : ''}` },
                  m.ts !== undefined && clock(m.ts) ? h('span', { class: 'ts' }, clock(m.ts)) : null,
                  sender(m), h('span', { class: 't' }, msgBody(m)))) : h('p', { class: 'empty' }, 'No messages in this thread.')),
              shows('reply', sid) ? h('form', {
                class: 'reply', onsubmit: async (e: Event) => {
                  e.preventDefault();
                  const text = input!.value.trim();
                  if (!text) return;
                  input!.value = ''; st.draft = '';
                  await run('reply', sid, id, { text });
                },
              }, h('span', { class: `chev ${css.glow}`, 'aria-hidden': 'true' }, '>'),
              (input = h('input', {
                type: 'text', 'aria-label': 'assist reply', placeholder: `Reply to ${t.account_key || 'petitioner'}`, autocomplete: 'off',
                'data-testid': 'assist-reply', 'data-focus': 'reply', oninput: (e: Event) => { st.draft = (e.target as HTMLInputElement).value; },
              }))) : null));
          if (select) select.value = status;
          if (input) input.value = st.draft;
        }
        if (focused) (el.querySelector(`[data-focus="${focused}"]`) as HTMLElement | null)?.focus();
      };
      redraws.add(draw);
      const off = mu.sessions.on('switch', () => draw());
      draw();
      return () => { redraws.delete(draw); off(); el.replaceChildren(); };
    }
    mu.panels.register({ id: PANEL, title: 'Assist', singleton: true, defaultPosition: 'right-bottom', show: 'auto', role: 'staff', mount });
    registered = true;
    for (const s of mu.sessions.list()) { if (states.get(s.id)?.inbox.length) touch(s.id); badge(s.id); }

    // Core.Supports while Assist is not off in the active session's world (off withdraws it, as before).
    let supportsOff: Dispose | null = null;
    const syncSupports = () => {
      const want = mode(active()) !== 'off';
      if (want && !supportsOff) supportsOff = mu.gmcp.supports([`${P} 1`]);
      if (!want && supportsOff) { supportsOff(); supportsOff = null; }
    };
    syncSupports();
    subs.push(() => { supportsOff?.(); supportsOff = null; }, mu.sessions.on('switch', () => syncSupports()));
    try { subs.push(mu.settings.watch('assist.enabled', () => { syncSupports(); for (const f of [...redraws]) f(); })); } catch { /* the row is the host's */ }
    try { subs.push(mu.settings.watch('assist.rich', () => { for (const f of [...redraws]) f(); })); } catch { /* defined above */ }

    // ── the exported API (one per calling extension; the handlers it registers go when it is disabled) ──
    const oldSession = (s: HostSession): ActionSession => ({
      ...s, send: (c) => mu.sessions.send(c, { sid: s.sid }), gmcp: async (pkg, data) => (await mu.gmcp.send(pkg, data, { sid: s.sid })) === true,
    });
    const configure: AssistApi['configure'] = (cfg, w) => {
      const set = (k: string, v: unknown) => mu.settings.set(`assist.${k}`, v, w);
      for (const a of Object.keys(cfg.actions ?? {})) if (!(a in ACTIONS)) throw new Error(`Assist: no action "${a}"`);
      if (cfg.enabled) set('enabled', cfg.enabled);
      if (cfg.source) set('source', cfg.source);
      for (const [a, c] of Object.entries(cfg.actions ?? {})) {
        if (c.via) set(`action.${a}.via`, c.via);
        if (c.cmd !== undefined) set(`action.${a}.cmd`, c.cmd);
      }
      for (const [o, v] of Object.entries(cfg.options ?? {})) set(o, v);
      syncSupports();
      for (const f of [...redraws]) f();
    };
    const api = (track: (d: Dispose) => Dispose): AssistApi => ({
      enable: (m, w) => configure({ enabled: m }, w),
      setRole: (role, sid) => { const s = need(sid); setStaff(s, role === 'staff'); changed(s); },
      open: () => mu.panels.open(PANEL),
      set(what: 'inbox' | 'thread', data: any, sid?: string) {
        const s = need(sid);
        if (!acceptsApi(s)) return;
        if (what === 'inbox') setInbox(s, Array.isArray(data?.threads) ? data.threads : []);
        else if (isObj(data) && idOk(data.account_id)) setThread(s, data as unknown as Thread);
      },
      upsert(_w, t, sid) {
        const s = need(sid);
        if (!acceptsApi(s) || !isObj(t) || !idOk(t.account_id)) return;
        const st = S(s), id = key(t);
        const row = st.inbox.find((x) => key(x) === id);
        if (row) Object.assign(row, t, { account_id: id }); else st.inbox.push({ ...t, account_id: id });
        st.inbox = sortInbox(st.inbox);
        const th = st.threads.get(id);
        if (th) Object.assign(th, t, { account_id: id });
        touch(s);
        changed(s);
      },
      remove(_w, accountId, sid) {
        const s = need(sid), st = S(s), id = String(accountId);
        st.inbox = st.inbox.filter((x) => key(x) !== id);
        st.fresh.delete(id);
        changed(s);
      },
      push: (_w, m, sid) => { const s = need(sid); if (acceptsApi(s)) pushMessage(s, m); },
      get: (_w, sid) => S(need(sid)).inbox.map((t) => ({ ...t })),
      onAction: (a, fn: ActionHandler) => {
        const id = (ACTIONS as Record<string, string>)[a] ?? `assist.${a}`;
        return track(mu.actions.handle(id, (args, s) => fn({ action: a, account: args.account ?? '', ...args } as ActionArgs, oldSession(s))));
      },
      configure,
    });
    ctx.exports((caller) => api((d) => caller.track(d)));
    // v1 callers (and a host before 1.12) read activate's return value.
    return api((d) => d);
  },
});
