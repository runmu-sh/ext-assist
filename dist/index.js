// src/index.ts
import { defineExtension, h } from "@muclient/sdk";

// src/css.ts
var S = '.ext-panel[data-ext="assist"] .mx.assist';
var CSS = `
${S} { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; background: var(--bg-elev); color: var(--fg); }
${S} button, ${S} select, ${S} input { font-family: inherit; }
${S} button { cursor: pointer; }
${S} :is(button, input, select):focus-visible { outline: 2px solid var(--accent-bright); outline-offset: -2px; }
${S} .hd { display: flex; align-items: baseline; gap: 1ch; padding: 6px 10px; border-bottom: 1px solid var(--accent); min-height: 24px; flex: 0 0 auto; }
${S} .tag { color: var(--accent-bright); text-transform: uppercase; letter-spacing: .22em; font-size: .8rem; }
${S} .sub { color: var(--fg-dim); text-transform: uppercase; letter-spacing: .18em; font-size: .62rem; }
${S} .count { margin-left: auto; color: var(--gold); font-size: .68rem; letter-spacing: .1em; text-transform: uppercase; }
${S} .back { margin-left: auto; color: var(--fg-dim); font-size: .68rem; min-height: 24px; }
${S} .list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }
${S} .row { display: flex; flex-direction: column; align-items: stretch; text-align: left; width: 100%; background: transparent; color: var(--fg); font-size: inherit; min-height: 24px; gap: 2px; }
${S} .r1 { display: flex; justify-content: space-between; align-items: baseline; gap: 1ch; min-width: 0; }
${S} .meta { display: flex; gap: .7ch; align-items: baseline; flex: none; }
${S} .row .who { color: var(--gold); font-size: .78rem; text-transform: uppercase; letter-spacing: .08em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${S} .asg { color: var(--accent-bright); font-size: .62rem; letter-spacing: .06em; text-transform: uppercase; }
${S} .asg::before { content: "\u25C6 " / ""; }
${S} .age { color: var(--fg-faint); font-size: .68rem; }
${S} .prev { color: var(--fg-dim); font-size: .76rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${S} .empty { color: var(--fg-faint); font-style: normal; padding: 12px 10px; margin: 0; font-size: .66rem; letter-spacing: .14em; text-transform: uppercase; line-height: 1.5; }
${S} .convo { display: flex; flex-direction: column; flex: 1; min-height: 0; }
${S} .who-head { display: flex; align-items: center; gap: 1ch; padding: 5px 10px; border-bottom: 1px solid var(--border); flex: 0 0 auto; min-width: 0; }
${S} .petitioner { color: var(--gold); text-transform: uppercase; letter-spacing: .1em; font-size: .78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
${S} .acct { color: var(--fg-faint); margin-left: 1ch; text-transform: none; font-size: .72rem; }
${S} .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 2px; margin-left: auto; }
${S} .actions .act { min-height: 24px; }
${S} .msgs { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 10px; line-height: 1.5; display: flex; flex-direction: column; gap: 8px; }
${S} .m { font-size: .85rem; }
${S} .m .ts { color: var(--fg-faint); font-size: .72rem; margin-right: .8ch; }
${S} .m .s { color: var(--accent-bright); margin-right: .6ch; text-decoration: none; }
${S} .m.note .s::after { content: " (note)"; color: var(--alert); }
${S} .m .t { color: var(--fg); white-space: pre-wrap; word-break: break-word; }
${S} .m .t a { color: var(--accent-bright); }
${S} .reply { display: flex; align-items: center; gap: .6rem; padding: 6px 10px; border-top: 1px solid var(--accent); flex: 0 0 auto; }
${S} .chev { color: var(--accent-bright); }
${S} .reply input { flex: 1; min-width: 0; background: transparent; border: 0; color: var(--fg); font-size: .85rem; caret-color: var(--accent-bright); min-height: 24px; padding: 0; }
${S} .reply input::placeholder { color: var(--fg-faint); }
@media (max-width: 420px) {
  ${S} .row, ${S} .back, ${S} .actions .act, ${S} .reply input { min-height: 32px; }
}
`;

// src/text.ts
function age(t, now = Date.now()) {
  let mins;
  if (typeof t.created === "number" && Number.isFinite(t.created)) mins = (now - (t.created < 1e12 ? t.created * 1e3 : t.created)) / 6e4;
  else if (typeof t.age_mins === "number" && Number.isFinite(t.age_mins)) mins = t.age_mins;
  else return "";
  const m = Math.max(0, Math.floor(mins));
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}
function clock(ts) {
  if (ts === void 0 || ts === null || ts === "") return "";
  const n = typeof ts === "number" ? ts < 1e12 ? ts * 1e3 : ts : Date.parse(ts);
  if (!Number.isFinite(n)) return "";
  const d = new Date(n);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
var PLATE = { open: "hot", pending: "gold", resolved: "dim", closed: "dim" };
function plateOf(status, css) {
  const p = PLATE[status];
  return p ? `${css.plate} ${css[p]}` : css.plate;
}
var whoOf = (t) => t.account_key || t.account_name || `#${t.account_id}`;
function sortInbox(list) {
  const when = (t) => typeof t.created === "number" && Number.isFinite(t.created) ? t.created < 1e12 ? t.created * 1e3 : t.created : void 0;
  if (!list.some((t) => when(t) !== void 0)) return [...list];
  return list.map((t, i) => ({ t, i, w: when(t) })).sort((a, b) => {
    if (a.w === void 0 || b.w === void 0) return a.w === void 0 && b.w === void 0 ? a.i - b.i : a.w === void 0 ? 1 : -1;
    return a.w - b.w || a.i - b.i;
  }).map((x) => x.t);
}

// src/index.ts
var P = "Client.Assist";
var PANEL = "assist";
var STATUSES = ["open", "pending", "resolved"];
var ACTIONS = { view: "assist.view", claim: "assist.claim", status: "assist.status", reply: "assist.reply" };
var SEEN = "seen.assist";
var SEEN_MAX = 1e3;
var BURST = 3;
var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
var idOk = (v) => typeof v === "string" || typeof v === "number";
var key = (t) => String(t.account_id);
var index_default = defineExtension({
  activate(ctx) {
    const mu = ctx.mu;
    const subs = ctx.subscriptions;
    const states = /* @__PURE__ */ new Map();
    const S2 = (sid) => states.get(sid) ?? states.set(sid, { inbox: [], threads: /* @__PURE__ */ new Map(), fresh: /* @__PURE__ */ new Set(), open: null, draft: "", staff: null }).get(sid);
    subs.push(mu.sessions.each((s) => () => {
      states.get(s.id)?.staff?.();
      states.delete(s.id);
      lastBadge.delete(s.id);
    }));
    const active = () => mu.sessions.active()?.id ?? null;
    const need = (sid) => {
      const s = sid ?? active();
      if (!s) throw new Error("assist: no active session");
      return s;
    };
    const sessionOf = (sid) => mu.sessions.list().find((s) => s.id === sid) ?? null;
    mu.ui.style(CSS);
    mu.settings.define({
      title: "Assist",
      items: [
        { key: "assist.source", label: "Driven by", default: "both", kind: "select", scope: "world", group: "Assist", options: [{ value: "both", label: "gmcp + api" }, { value: "gmcp", label: "gmcp" }, { value: "api", label: "api" }] },
        { key: "assist.rich", label: "Rich text in messages", default: true, kind: "toggle", scope: "both", group: "Assist" }
      ]
    });
    const setting = (k, sid, fallback) => {
      try {
        const v = mu.settings.get(k, sid ? { sid } : void 0);
        return v === void 0 || v === null ? fallback : v;
      } catch {
        return fallback;
      }
    };
    const mode = (sid) => {
      const v = setting("assist.enabled", sid, "auto");
      return v === "off" || v === "on" ? v : "auto";
    };
    const source = (sid) => {
      const v = setting("assist.source", sid, "both");
      return v === "gmcp" || v === "api" ? v : "both";
    };
    const acceptsGmcp = (sid) => mode(sid) !== "off" && source(sid) !== "api";
    const acceptsApi = (sid) => mode(sid) !== "off" && source(sid) !== "gmcp";
    const ARGS = { account: { label: "account id" }, key: { label: "account key" } };
    const gmcpAction = (action) => (v) => [`${P}.Action`, { action, account_id: v.account, ...v.status ? { status: v.status } : {}, ...v.text ? { text: v.text } : {} }];
    mu.actions.define({ id: ACTIONS.view, label: "View", group: "Assist", via: "command", command: "@assistview #{account}", gmcp: gmcpAction("view"), args: ARGS });
    mu.actions.define({ id: ACTIONS.claim, label: "Claim", group: "Assist", via: "command", command: "@assistclaim #{account}", gmcp: gmcpAction("claim"), args: ARGS });
    mu.actions.define({ id: ACTIONS.status, label: "Status", group: "Assist", via: "command", command: "@assiststatus #{account} {status}", gmcp: gmcpAction("status"), args: { ...ARGS, status: { label: "open, pending or resolved" } } });
    mu.actions.define({ id: ACTIONS.reply, label: "Reply", group: "Assist", via: "command", command: "@assist #{account} = {text}", gmcp: gmcpAction("reply"), args: { ...ARGS, text: { label: "reply" } } });
    const shows = (a, sid) => {
      try {
        return mu.actions.visible(ACTIONS[a], sid);
      } catch {
        return true;
      }
    };
    const run = (a, sid, id, extra = {}) => {
      const t = threadOf(sid, id);
      return mu.actions.run(ACTIONS[a], { account: id, key: t.account_key || t.account_name || `#${id}`, ...extra }, { sid });
    };
    const redraws = /* @__PURE__ */ new Set();
    const lastBadge = /* @__PURE__ */ new Map();
    let registered = false;
    const badge = (sid) => {
      if (!registered) return;
      const n = states.get(sid)?.fresh.size ?? 0;
      if ((lastBadge.get(sid) ?? 0) === n && lastBadge.has(sid)) return;
      lastBadge.set(sid, n);
      try {
        mu.panels.badge(PANEL, n ? { count: n } : null, sid);
      } catch (e) {
        mu.log.warn("assist: badge failed", e);
      }
    };
    const changed = (sid) => {
      badge(sid);
      for (const f of [...redraws]) f();
    };
    const touch = (sid) => {
      if (registered) {
        try {
          mu.panels.touch(PANEL, sid);
        } catch {
        }
      }
    };
    const setStaff = (sid, on) => {
      const st = S2(sid);
      if (on && !st.staff) st.staff = mu.sessions.provideIdentity(sid, { roles: ["staff"] });
      if (!on && st.staff) {
        st.staff();
        st.staff = null;
      }
    };
    const threadOf = (sid, id) => {
      const st = S2(sid);
      return { ...st.inbox.find((x) => key(x) === id), ...st.threads.get(id), account_id: id };
    };
    const freshIds = (sid, ids) => {
      const world = sessionOf(sid)?.worldId ?? null;
      const store = mu.storage.world(world, { sync: true });
      const had = store.get(SEEN, void 0);
      const seen = new Set(had ?? []);
      const out = ids.filter((id) => !seen.has(id));
      if (out.length || !had) store.set(SEEN, [...seen, ...out].slice(-SEEN_MAX));
      return had ? out : [];
    };
    const announce = (sid, rows) => {
      if (!rows.length) return;
      if (rows.length > BURST) {
        void mu.notify.mention({ sid, title: `${rows.length} new tickets`, body: rows.slice(0, BURST).map(whoOf).join(" \xB7 "), key: `assist:${rows.map(key).sort().join(",")}` });
        return;
      }
      for (const t of rows) void mu.notify.mention({ sid, title: "New ticket", body: whoOf(t), key: `assist:${key(t)}` });
    };
    const setInbox = (sid, list, replay = false) => {
      const st = S2(sid);
      st.inbox = sortInbox(list.filter((t) => isObj(t) && idOk(t.account_id)).map((t) => ({ ...t, account_id: key(t) })));
      const ids = new Set(st.inbox.map(key));
      for (const id of [...st.fresh]) if (!ids.has(id)) st.fresh.delete(id);
      const fresh = freshIds(sid, [...ids]);
      if (!replay) {
        for (const id of fresh) if (st.open !== id) st.fresh.add(id);
        announce(sid, st.inbox.filter((t) => fresh.includes(key(t))));
      }
      setStaff(sid, true);
      touch(sid);
      changed(sid);
    };
    const setThread = (sid, t) => {
      const st = S2(sid), id = key(t);
      st.threads.set(id, { ...st.threads.get(id), ...t, account_id: id, messages: Array.isArray(t.messages) ? [...t.messages] : st.threads.get(id)?.messages ?? [] });
      const row = st.inbox.find((x) => key(x) === id);
      if (row && t.account_key) row.account_key = t.account_key;
      touch(sid);
      changed(sid);
    };
    const pushMessage = (sid, d) => {
      if (!isObj(d) || !idOk(d.account_id) || !isObj(d.message)) return;
      const st = S2(sid), id = key(d);
      const t = st.threads.get(id);
      if (t) t.messages = [...t.messages ?? [], d.message];
      const row = st.inbox.find((x) => key(x) === id);
      if (row) {
        row.count = (row.count ?? 0) + 1;
        row.preview = typeof d.message.text === "string" ? d.message.text : row.preview;
      }
      changed(sid);
    };
    subs.push(mu.gmcp.on(P, (data, meta) => {
      const { sid, pkg } = meta;
      if (!acceptsGmcp(sid)) return;
      const sub = pkg.slice(P.length + 1).toLowerCase();
      const d = data;
      if (sub === "inbox") setInbox(sid, Array.isArray(d?.threads) ? d.threads : [], !!meta.replay);
      else if (sub === "thread") {
        if (isObj(d) && idOk(d.account_id)) setThread(sid, d);
      } else if (sub === "message") {
        if (!meta.replay) pushMessage(sid, d);
      }
    }));
    function mount(el, pc) {
      el.classList.add("mx", "assist");
      el.dataset.testid = "assist";
      const css = mu.ui.css;
      const fill = (...kids) => el.replaceChildren(...kids.filter((k) => !!k));
      const draw = () => {
        const sid = pc.sid ?? active();
        const focused = el.contains(document.activeElement) ? document.activeElement.dataset.focus : void 0;
        if (!sid) {
          fill(h("p", { class: "empty" }, "No session"));
          return;
        }
        const st = S2(sid);
        const head = (...extra) => h("div", { class: "hd" }, h("span", { class: `tag ${css.glow}` }, "Assist"), h("span", { class: "sub" }, "help desk"), ...extra);
        if (!st.open) {
          fill(
            head(h("span", { class: "count", "data-testid": "assist-count" }, `${st.inbox.length} open`)),
            h(
              "div",
              { class: "list", "data-testid": "assist-list" },
              st.inbox.length ? st.inbox.map((t) => {
                const id = key(t), status = t.status || "open";
                return h(
                  "button",
                  {
                    class: `${css.row} row ticket${st.fresh.has(id) ? ` ${css.hot}` : ""}`,
                    type: "button",
                    "data-id": id,
                    "data-focus": `row-${id}`,
                    onclick: () => {
                      st.open = id;
                      st.fresh.delete(id);
                      changed(sid);
                      void run("view", sid, id);
                    }
                  },
                  h(
                    "span",
                    { class: "r1" },
                    h("span", { class: "who" }, whoOf(t)),
                    h(
                      "span",
                      { class: "meta" },
                      t.assignee ? h("span", { class: "asg", title: `claimed by ${t.assignee}` }, t.assignee) : null,
                      h("span", { class: `${plateOf(status, css)} status` }, status),
                      age(t) ? h("span", { class: "age" }, age(t)) : null,
                      t.count ? h("span", { class: "age n", title: "messages" }, `\xB7 ${t.count}`) : null
                    )
                  ),
                  t.preview ? h("span", { class: "prev" }, t.preview) : null
                );
              }) : h("p", { class: "empty", "data-testid": "assist-empty" }, "No open tickets.")
            )
          );
        } else {
          const id = st.open;
          const t = threadOf(sid, id);
          const status = t.status || "open";
          const rich = setting("assist.rich", sid, true);
          const who = whoOf(t);
          let input = null;
          const msgBody = (m) => {
            if (rich && m.html) {
              const s = h("span");
              s.append(mu.ui.sanitize(m.html, "inline"));
              return s;
            }
            return document.createTextNode(m.text ?? (m.html ? mu.ui.sanitize(m.html, "inline").textContent ?? "" : ""));
          };
          const sender = (m) => {
            if (rich && m.sender_html) {
              const s = h("span", { class: "s" });
              s.append(mu.ui.sanitize(m.sender_html, "inline"));
              return s;
            }
            return h("span", { class: "s" }, m.sender ?? "?");
          };
          let select = null;
          fill(
            head(h("button", { class: `${css.cmd} back`, type: "button", "data-testid": "assist-back", "data-focus": "back", onclick: () => {
              st.open = null;
              changed(sid);
            } }, "Inbox")),
            h(
              "div",
              { class: "convo", "data-testid": "assist-thread" },
              h(
                "div",
                { class: "who-head" },
                h("span", { class: "petitioner" }, who, t.account_name && t.account_key ? h("span", { class: "acct" }, t.account_name) : null),
                h("span", { class: plateOf(status, css), "data-testid": "assist-plate" }, status),
                h(
                  "span",
                  { class: "actions" },
                  shows("status", sid) ? select = h("select", {
                    class: `${css.field} act`,
                    "aria-label": "status",
                    "data-testid": "assist-status",
                    "data-focus": "status",
                    onchange: (e) => {
                      void run("status", sid, id, { status: e.target.value });
                    }
                  }, (STATUSES.includes(status) ? STATUSES : [...STATUSES, status]).map((s) => h("option", { value: s }, s))) : null,
                  shows("claim", sid) ? h("button", {
                    class: `${css.cmd} act`,
                    type: "button",
                    "data-action": "claim",
                    "data-focus": "claim",
                    onclick: () => void run("claim", sid, id)
                  }, t.assignee ? `Claimed \xB7 ${t.assignee}` : "Claim") : null
                )
              ),
              h(
                "div",
                { class: "msgs", "data-testid": "assist-msgs" },
                t.messages?.length ? t.messages.map((m) => h(
                  "div",
                  { class: `m${m.visibility === "internal" ? " note" : ""}` },
                  m.ts !== void 0 && clock(m.ts) ? h("span", { class: "ts" }, clock(m.ts)) : null,
                  sender(m),
                  h("span", { class: "t" }, msgBody(m))
                )) : h("p", { class: "empty" }, "No messages in this thread.")
              ),
              shows("reply", sid) ? h(
                "form",
                {
                  class: "reply",
                  onsubmit: async (e) => {
                    e.preventDefault();
                    const text = input.value.trim();
                    if (!text) return;
                    input.value = "";
                    st.draft = "";
                    await run("reply", sid, id, { text });
                  }
                },
                h("span", { class: `chev ${css.glow}`, "aria-hidden": "true" }, ">"),
                input = h("input", {
                  type: "text",
                  "aria-label": "assist reply",
                  placeholder: `Reply to ${t.account_key || "petitioner"}`,
                  autocomplete: "off",
                  "data-testid": "assist-reply",
                  "data-focus": "reply",
                  oninput: (e) => {
                    st.draft = e.target.value;
                  }
                })
              ) : null
            )
          );
          if (select) select.value = status;
          if (input) input.value = st.draft;
        }
        if (focused) el.querySelector(`[data-focus="${focused}"]`)?.focus();
      };
      redraws.add(draw);
      const off = mu.sessions.on("switch", () => draw());
      draw();
      return () => {
        redraws.delete(draw);
        off();
        el.replaceChildren();
      };
    }
    mu.panels.register({ id: PANEL, title: "Assist", singleton: true, defaultPosition: "right-bottom", show: "auto", role: "staff", mount });
    registered = true;
    for (const s of mu.sessions.list()) {
      if (states.get(s.id)?.inbox.length) touch(s.id);
      badge(s.id);
    }
    let supportsOff = null;
    const syncSupports = () => {
      const want = mode(active()) !== "off";
      if (want && !supportsOff) supportsOff = mu.gmcp.supports([`${P} 1`]);
      if (!want && supportsOff) {
        supportsOff();
        supportsOff = null;
      }
    };
    syncSupports();
    subs.push(() => {
      supportsOff?.();
      supportsOff = null;
    }, mu.sessions.on("switch", () => syncSupports()));
    try {
      subs.push(mu.settings.watch("assist.enabled", () => {
        syncSupports();
        for (const f of [...redraws]) f();
      }));
    } catch {
    }
    try {
      subs.push(mu.settings.watch("assist.rich", () => {
        for (const f of [...redraws]) f();
      }));
    } catch {
    }
    const oldSession = (s) => ({
      ...s,
      send: (c) => mu.sessions.send(c, { sid: s.sid }),
      gmcp: async (pkg, data) => await mu.gmcp.send(pkg, data, { sid: s.sid }) === true
    });
    const configure = (cfg, w) => {
      const set = (k, v) => mu.settings.set(`assist.${k}`, v, w);
      for (const a of Object.keys(cfg.actions ?? {})) if (!(a in ACTIONS)) throw new Error(`Assist: no action "${a}"`);
      if (cfg.enabled) set("enabled", cfg.enabled);
      if (cfg.source) set("source", cfg.source);
      for (const [a, c] of Object.entries(cfg.actions ?? {})) {
        if (c.via) set(`action.${a}.via`, c.via);
        if (c.cmd !== void 0) set(`action.${a}.cmd`, c.cmd);
      }
      for (const [o, v] of Object.entries(cfg.options ?? {})) set(o, v);
      syncSupports();
      for (const f of [...redraws]) f();
    };
    const api = (track) => ({
      enable: (m, w) => configure({ enabled: m }, w),
      setRole: (role, sid) => {
        const s = need(sid);
        setStaff(s, role === "staff");
        changed(s);
      },
      open: () => mu.panels.open(PANEL),
      set(what, data, sid) {
        const s = need(sid);
        if (!acceptsApi(s)) return;
        if (what === "inbox") setInbox(s, Array.isArray(data?.threads) ? data.threads : []);
        else if (isObj(data) && idOk(data.account_id)) setThread(s, data);
      },
      upsert(_w, t, sid) {
        const s = need(sid);
        if (!acceptsApi(s) || !isObj(t) || !idOk(t.account_id)) return;
        const st = S2(s), id = key(t);
        const row = st.inbox.find((x) => key(x) === id);
        if (row) Object.assign(row, t, { account_id: id });
        else st.inbox.push({ ...t, account_id: id });
        st.inbox = sortInbox(st.inbox);
        const th = st.threads.get(id);
        if (th) Object.assign(th, t, { account_id: id });
        touch(s);
        changed(s);
      },
      remove(_w, accountId, sid) {
        const s = need(sid), st = S2(s), id = String(accountId);
        st.inbox = st.inbox.filter((x) => key(x) !== id);
        st.fresh.delete(id);
        changed(s);
      },
      push: (_w, m, sid) => {
        const s = need(sid);
        if (acceptsApi(s)) pushMessage(s, m);
      },
      get: (_w, sid) => S2(need(sid)).inbox.map((t) => ({ ...t })),
      onAction: (a, fn) => {
        const id = ACTIONS[a] ?? `assist.${a}`;
        return track(mu.actions.handle(id, (args, s) => fn({ action: a, account: args.account ?? "", ...args }, oldSession(s))));
      },
      configure
    });
    ctx.exports((caller) => api((d) => caller.track(d)));
    return api((d) => d);
  }
});
export {
  index_default as default
};
