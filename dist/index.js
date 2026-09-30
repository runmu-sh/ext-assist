// src/index.ts
import { defineExtension } from "@muclient/sdk";

// node_modules/@runmu.sh/ext-kit/dist/schema.js
var typeOf = (v) => v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v;
function validate(schema, data, root = schema, path = "$") {
  if (schema.$ref) {
    const m = /^#\/\$defs\/(.+)$/.exec(schema.$ref);
    const target = m ? root.$defs?.[m[1]] : void 0;
    if (!target)
      return `${path}: unknown $ref ${schema.$ref}`;
    return validate(target, data, root, path);
  }
  if (schema.type) {
    const want = Array.isArray(schema.type) ? schema.type : [schema.type];
    const got = typeOf(data);
    const ok = want.some((t) => t === got || t === "number" && got === "integer");
    if (!ok)
      return `${path}: expected ${want.join(" or ")}, got ${got}`;
  }
  if (schema.enum && !schema.enum.some((e) => e === data))
    return `${path}: not one of ${schema.enum.map(String).join(", ")}`;
  if (typeOf(data) === "object") {
    const o = data;
    for (const r of schema.required ?? [])
      if (!(r in o) || o[r] === void 0)
        return `${path}.${r}: required`;
    for (const [k, v] of Object.entries(o)) {
      if (v === void 0)
        continue;
      const ps = schema.properties?.[k];
      if (ps) {
        const e = validate(ps, v, root, `${path}.${k}`);
        if (e)
          return e;
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        const e = validate(schema.additionalProperties, v, root, `${path}.${k}`);
        if (e)
          return e;
      }
    }
  }
  if (typeOf(data) === "array" && schema.items) {
    const a = data;
    for (let i = 0; i < a.length; i++) {
      const e = validate(schema.items, a[i], root, `${path}[${i}]`);
      if (e)
        return e;
    }
  }
  return null;
}

// node_modules/@runmu.sh/ext-kit/dist/module.js
var VIA_OPTS = [{ value: "command", label: "command" }, { value: "gmcp", label: "gmcp" }, { value: "ext", label: "extension" }, { value: "none", label: "hidden" }];
var MODE_OPTS = [{ value: "off", label: "off" }, { value: "auto", label: "auto" }, { value: "on", label: "on" }];
var SOURCE_OPTS = [{ value: "both", label: "gmcp + api" }, { value: "gmcp", label: "gmcp" }, { value: "api", label: "api" }];
function fillTemplate(tpl, vars) {
  const sub = (s) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  return sub(tpl.replace(/\[([^\]]*)\]/g, (_, seg) => [...seg.matchAll(/\{(\w+)\}/g)].every((m) => (vars[m[1]] ?? "") !== "") ? seg : "")).trim();
}
var supportsByMu = /* @__PURE__ */ new WeakMap();
function holdSupports(mu, pkg) {
  let supportsRefs = supportsByMu.get(mu);
  if (!supportsRefs)
    supportsByMu.set(mu, supportsRefs = /* @__PURE__ */ new Map());
  let r = supportsRefs.get(pkg);
  if (!r) {
    r = { n: 0, off: mu.gmcp.supports([`${pkg} 1`]) };
    supportsRefs.set(pkg, r);
  }
  r.n++;
  let done = false;
  return () => {
    if (done)
      return;
    done = true;
    if (--r.n === 0) {
      supportsRefs.delete(pkg);
      r.off();
    }
  };
}
var WorldModule = class {
  def;
  mu;
  handlers = /* @__PURE__ */ new Map();
  requests = /* @__PURE__ */ new Map();
  /** Sessions where data has arrived (auto mode) and where the role is staff. */
  seenData = /* @__PURE__ */ new Set();
  staffIn = /* @__PURE__ */ new Set();
  listeners = /* @__PURE__ */ new Set();
  supportsOff = null;
  constructor(mu, def) {
    this.mu = mu;
    this.def = def;
  }
  /** Setting rows for this module (the extension defines all its modules' rows in one page). */
  settingItems() {
    const k = this.def.key, g = this.def.title;
    const rows = [
      { key: `${k}.enabled`, label: "Show panel", default: this.def.defaultMode ?? "auto", kind: "select", options: MODE_OPTS, group: g, hint: "auto: appears when the game first sends it", scope: "world" },
      { key: `${k}.source`, label: "Driven by", default: "both", kind: "select", options: SOURCE_OPTS, group: g, scope: "world" },
      ...(this.def.options ?? []).map((o) => ({ ...o, key: `${k}.${o.key}`, group: o.group ?? g }))
    ];
    for (const [a, d] of Object.entries(this.def.actions)) {
      rows.push({ key: `${k}.action.${a}.via`, label: `${d.label}: via`, default: d.via, kind: "select", options: VIA_OPTS, group: `${g} actions`, scope: "both" });
      rows.push({ key: `${k}.action.${a}.cmd`, label: `${d.label}: command`, default: d.cmd, kind: "text", group: `${g} actions`, scope: "both" });
    }
    return rows;
  }
  worldOf(sid) {
    if (!sid)
      return null;
    return this.mu.sessions.list().find((s) => s.id === sid)?.worldId ?? null;
  }
  get(key, worldId) {
    return this.mu.settings.get(`${this.def.key}.${key}`, worldId);
  }
  mode(worldId = this.mu.sessions.active()?.worldId ?? null) {
    return this.get("enabled", worldId);
  }
  source(worldId) {
    return this.get("source", worldId);
  }
  option(key, sid) {
    return this.get(key, sid ? this.worldOf(sid) : this.mu.sessions.active()?.worldId ?? null);
  }
  action(name, worldId) {
    const d = this.def.actions[name];
    if (!d)
      return { label: name, via: "none", cmd: "" };
    return { label: d.label, via: this.get(`action.${name}.via`, worldId) ?? d.via, cmd: this.get(`action.${name}.cmd`, worldId) ?? d.cmd };
  }
  /** A button is hidden when its action's via is `none`. */
  shows(name, sid) {
    return this.action(name, this.worldOf(sid)).via !== "none";
  }
  /** GMCP for this module on `sid` is taken (not off, not api-only). */
  acceptsGmcp(sid) {
    const w = this.worldOf(sid);
    return this.mode(w) !== "off" && this.source(w) !== "api";
  }
  acceptsApi(sid) {
    const w = this.worldOf(sid);
    return this.mode(w) !== "off" && this.source(w) !== "gmcp";
  }
  isStaff(sid) {
    return !this.def.staff || !!sid && this.staffIn.has(sid);
  }
  setStaff(sid, on) {
    if (on)
      this.staffIn.add(sid);
    else
      this.staffIn.delete(sid);
    this.changed();
  }
  /** Data arrived for `sid`: auto mode shows the panel and R-AUTO-PANELS adds it once. */
  touched(sid) {
    const first = !this.seenData.has(sid);
    this.seenData.add(sid);
    if (first)
      this.changed();
    const m = this.mode(this.worldOf(sid));
    if (m !== "off" && this.isStaff(sid))
      this.mu.panels.autoAdd(this.def.panels[0], sid);
  }
  /** Whether the main panel belongs in Views for the active session. */
  visible(sid) {
    const m = this.mode(this.worldOf(sid));
    if (m === "off" || !this.isStaff(sid))
      return false;
    return m === "on" || !!sid && this.seenData.has(sid);
  }
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  changed() {
    for (const f of [...this.listeners]) {
      try {
        f();
      } catch (e) {
        this.mu.log.error(e);
      }
    }
  }
  /** Keep Views, Core.Supports and open panels in line with the mode and role. Call once from activate. */
  bind() {
    const sync = () => {
      const sid = this.mu.sessions.active()?.id ?? null;
      const vis = this.visible(sid);
      for (const id of this.def.panels)
        this.mu.panels.update(id, { inViewsMenu: vis });
      const off = this.mode() === "off";
      if (off)
        for (const id of this.def.panels)
          this.mu.panels.close(id);
      if (!off && !this.supportsOff)
        this.supportsOff = holdSupports(this.mu, this.def.pkg);
      if (off && this.supportsOff) {
        this.supportsOff();
        this.supportsOff = null;
      }
    };
    const subs = [
      this.onChange(sync),
      this.mu.settings.watch(`${this.def.key}.enabled`, () => {
        sync();
        this.changed();
      }),
      this.mu.sessions.on("switch", () => sync()),
      () => {
        if (this.supportsOff) {
          this.supportsOff();
          this.supportsOff = null;
        }
      }
    ];
    sync();
    return subs;
  }
  /** `api.onAction(name, fn)`: runs before the configured action; returning true skips it. */
  onAction(name, fn) {
    const set = this.handlers.get(name) ?? this.handlers.set(name, /* @__PURE__ */ new Set()).get(name);
    set.add(fn);
    return () => set.delete(fn);
  }
  /** `api.onRequest(kind, fn)`: replaces the default GMCP data request for `kind`. */
  onRequest(kind, fn) {
    const set = this.requests.get(kind) ?? this.requests.set(kind, /* @__PURE__ */ new Set()).get(kind);
    set.add(fn);
    return () => set.delete(fn);
  }
  session(sid) {
    const name = this.mu.gmcp.state("Char.Name", sid)?.name ?? this.mu.gmcp.state("Char.Status", sid)?.name ?? "";
    return { sid, worldId: this.worldOf(sid) ?? "", character: String(name), send: (c) => this.mu.sessions.send(c, sid), gmcp: (p, d) => this.mu.gmcp.send(p, d, sid) };
  }
  /**
   * Press a button (06 §1 Actions): extension handlers first (true = handled), then the configured
   * `via`. A `gmcp` action falls back to the command template when the transport cannot send GMCP.
   * Returns what was done, for tests: 'ext' | 'gmcp' | 'command' | 'none'.
   */
  async run(name, vars, sid) {
    const s = this.session(sid);
    for (const fn of [...this.handlers.get(name) ?? []]) {
      try {
        if (await fn({ action: name, ...vars }, s) === true)
          return "ext";
      } catch (e) {
        this.mu.log.error(`action ${name} handler failed:`, e);
      }
    }
    const a = this.action(name, this.worldOf(sid));
    if (a.via === "none" || a.via === "ext")
      return "none";
    if (a.via === "gmcp") {
      const [pkg, data] = this.def.gmcpAction(name, vars);
      if (await this.mu.gmcp.send(pkg, data, sid))
        return "gmcp";
      if (!a.cmd)
        return "none";
    }
    const cmd = fillTemplate(a.cmd, vars);
    if (!cmd)
      return "none";
    await this.mu.sessions.send(cmd, sid);
    return "command";
  }
  /** A data request (History, bug detail, Resync…): handlers replace the default GMCP request. */
  async request(kind, pkg, data, sid) {
    const hs = [...this.requests.get(kind) ?? []];
    if (hs.length) {
      for (const fn of hs) {
        try {
          await fn(data, this.session(sid));
        } catch (e) {
          this.mu.log.error(`request ${kind} handler failed:`, e);
        }
      }
      return;
    }
    if (this.source(this.worldOf(sid)) !== "api")
      await this.mu.gmcp.send(pkg, data, sid);
  }
  /**
   * Check a payload. A malformed one is dropped with one `session.error` line in the session (shown in
   * Session info) and no crash (06 §8).
   */
  check(sid, pkg, schema, data) {
    const err = validate(schema, data);
    if (!err)
      return true;
    this.mu.sessions.echo(`session.error: ${pkg} rejected by ${this.def.title}: ${err}`, sid);
    this.mu.log.warn(`${pkg} rejected: ${err}`);
    return false;
  }
  // ─── read marks ("new" = an id not seen before on this device, per world) ──────────────────
  seenKey = () => `seen.${this.def.key}`;
  /** Ids in `ids` not seen before in the session's world; marks them seen. */
  fresh(sid, ids) {
    const store = this.mu.storage.world(this.worldOf(sid));
    const seen = new Set(store.get(this.seenKey(), []));
    const out = ids.filter((id) => !seen.has(id));
    if (out.length)
      store.set(this.seenKey(), [...seen, ...out].slice(-1e3));
    return out;
  }
  /** New-item toast (style bible §7, kind label = module). Several new at once become one toast. */
  announce(items) {
    if (!items.length)
      return;
    if (items.length > 3) {
      this.mu.ui.toast(`${items.length} new`, items.slice(0, 3).map((i) => i.title).join(" \xB7 "), { kind: this.def.key });
      return;
    }
    for (const i of items)
      this.mu.ui.toast(i.title, i.body, { kind: this.def.key });
  }
  /** `api.configure(...)`: write actions, options, source, enabled for the active world (or all worlds). */
  configure(cfg, worldId) {
    const k = this.def.key;
    const set = (key, v) => this.mu.settings.set(`${k}.${key}`, v, worldId);
    if (cfg.enabled)
      set("enabled", cfg.enabled);
    if (cfg.source)
      set("source", cfg.source);
    for (const [a, c] of Object.entries(cfg.actions ?? {})) {
      if (!this.def.actions[a])
        throw new Error(`${this.def.title}: no action "${a}"`);
      if (c.via)
        set(`action.${a}.via`, c.via);
      if (c.cmd !== void 0)
        set(`action.${a}.cmd`, c.cmd);
    }
    for (const [o, v] of Object.entries(cfg.options ?? {}))
      set(o, v);
    this.changed();
  }
};
function replay(mu, pkgs, fn) {
  for (const s of mu.sessions.list())
    for (const p of pkgs) {
      const d = mu.gmcp.state(p, s.id);
      if (d !== void 0)
        fn(p, d, s.id);
    }
}

// node_modules/@runmu.sh/ext-kit/dist/css.js
var MODULE_CSS = `
.mx { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg-elev); color: var(--fg); font-size: 1rem; }
.mx button { font-family: inherit; cursor: pointer; }
.mx button:focus-visible, .mx input:focus-visible, .mx select:focus-visible, .mx textarea:focus-visible { outline: 2px solid var(--accent-bright); outline-offset: -2px; }

/* Header: TITLE, the view toggles, a count or [ BACK ] at the right. */
.mx .hd { display: flex; align-items: center; gap: .6ch; padding: 5px 8px 5px 10px; border-bottom: 1px solid var(--accent); flex: 0 0 auto; min-height: 24px; }
.mx .tag { color: var(--accent-bright); text-transform: uppercase; letter-spacing: .2em; font-size: .74rem; margin-right: 1ch; }
.mx.assist .hd { align-items: baseline; gap: 1ch; padding: 6px 10px; }
.mx.assist .tag { letter-spacing: .22em; font-size: .8rem; margin-right: 0; }
.mx .hd .sub { color: var(--fg-dim); text-transform: uppercase; letter-spacing: .18em; font-size: .62rem; }
.mx .count { margin-left: auto; color: var(--gold); font-size: .66rem; letter-spacing: .1em; }
.mx.assist .count { font-size: .68rem; }
.mx .back { margin-left: auto; }

/* Feedback line after an action: ok, or .err. */
.mx .fb { margin: 0; padding: 4px 10px; font-size: .72rem; letter-spacing: .04em; color: var(--ok); border-bottom: 1px solid var(--border); flex: 0 0 auto; }
.mx .fb.err { color: var(--alert); }

/* Kind filters (Tickets): a wrapping row of .sh-toggle. */
.mx .filters { display: flex; flex-direction: column; align-items: stretch; gap: 4px; padding: 6px 10px; border-bottom: 1px solid var(--border); flex: 0 0 auto; }
.mx .fl { display: flex; flex-wrap: wrap; gap: 2px 6px; }

/* Lists of .sh-row. */
.mx .list { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; }
.mx .r1 { display: flex; justify-content: space-between; align-items: baseline; gap: 1ch; min-width: 0; }
.mx.mine .r1 { justify-content: flex-start; }
.mx .kind { color: var(--accent-bright); text-transform: uppercase; letter-spacing: .12em; font-size: .68rem; }
.mx .row[data-kind=bug] .kind { color: var(--alert); }
.mx .row[data-kind=puppet] .kind { color: var(--gold); }
.mx .row[data-kind=report] .kind { color: var(--fg); }
.mx .sid, .mx .id { color: var(--fg-faint); font-size: .62rem; letter-spacing: 0; }
.mx.mine .id { font-size: .64rem; }
.mx .meta { display: flex; align-items: baseline; gap: .8ch; flex: 0 0 auto; }
.mx.assist .meta { gap: .7ch; }
.mx .pri { color: var(--alert); font-size: .62rem; }
.mx .asg { color: var(--fg-dim); font-size: .6rem; letter-spacing: .1em; text-transform: uppercase; }
.mx.assist .asg { color: var(--accent-bright); font-size: .62rem; letter-spacing: .06em; }
.mx .age { color: var(--fg-faint); font-size: .64rem; }
.mx.assist .age { font-size: .68rem; }
.mx.mine .age { margin-left: auto; }
.mx .row .who { color: var(--gold); font-size: .78rem; }
.mx.assist .row .who { text-transform: uppercase; letter-spacing: .08em; }
.mx .subject { color: var(--fg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mx.mine .row.hot .subject { color: var(--gold); }
.mx .prev { color: var(--fg-dim); font-size: .74rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mx.mine .prev, .mx.assist .prev { font-size: .76rem; }

/* Empty states: uppercase tracked faint labels (delta #27). Commands in a hint keep their case. */
.mx .empty { color: var(--fg-faint); font-style: normal; padding: 12px 10px; margin: 0; font-size: .68rem; letter-spacing: .14em; text-transform: uppercase; line-height: 1.5; }
.mx.assist .empty { font-size: .66rem; }
.mx .empty .cmdref { color: var(--gold); text-transform: none; letter-spacing: .04em; }
.mx .empty.err { color: var(--alert); }
.mx .empty .sh-cmd { margin-left: 1ch; }

/* A conversation: head, context, messages, reply. */
.mx .convo { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.mx .head { display: flex; align-items: flex-start; gap: 1ch; padding: 7px 10px; border-bottom: 1px solid var(--border); flex: 0 0 auto; }
.mx .who-head { display: flex; align-items: center; gap: 1ch; padding: 5px 10px; border-bottom: 1px solid var(--border); flex: 0 0 auto; }
.mx .petitioner { color: var(--gold); letter-spacing: .04em; font-size: .86rem; }
.mx.assist .petitioner { text-transform: uppercase; letter-spacing: .1em; font-size: .78rem; }
.mx .petitioner .sub { display: flex; flex-wrap: wrap; align-items: center; gap: .8ch; margin-top: 3px; color: var(--fg-dim); font-size: .7rem; letter-spacing: 0; }
.mx .acct { color: var(--fg-faint); }
.mx.assist .petitioner .acct { margin-left: 1ch; text-transform: none; letter-spacing: 0; font-size: .72rem; }
.mx .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 2px; margin-left: auto; }
.mx .actions .grp { display: inline-flex; gap: 2px; }
.mx .ctx { padding: 6px 10px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 2px; flex: 0 0 auto; }
.mx .cx { font-size: .74rem; }
.mx .ck { color: var(--fg-faint); text-transform: uppercase; font-size: .6rem; letter-spacing: .14em; margin-right: .6ch; }
.mx .cv { color: var(--fg); }
.mx .dim { color: var(--fg-faint); }
.mx .loadbug { align-self: flex-start; margin: 3px 0 0 -.5ch; }
.mx .bug { padding: 6px 10px; border-bottom: 1px solid var(--border); display: flex; flex-direction: column; gap: 3px; }
.mx .bl { font-size: .74rem; color: var(--fg); }
.mx .tb { margin: 2px 0 4px; padding: 6px; background: var(--bg-deep); border: 0; border-left: 1px solid var(--border-bright); color: var(--fg-dim); font-size: .7rem; max-height: 180px; overflow: auto; white-space: pre-wrap; font-family: inherit; }
.mx .body { flex: 1; min-height: 0; overflow-y: auto; }

/* Messages: a left rule per message; staff messages take the accent rule, notes a dashed one. */
.mx .msgs { padding: 8px 10px; line-height: 1.5; display: flex; flex-direction: column; gap: 8px; flex: 1; min-height: 0; overflow-y: auto; }
.mx.mine .msgs { gap: 10px; }
.mx .body .msgs { overflow: visible; flex: none; }
.mx .m { padding-left: 1.5ch; border-left: 1px solid var(--border-bright); font-size: .85rem; }
.mx.mine .m { display: flex; flex-direction: column; gap: 2px; }
.mx .m.staffmsg { border-left-color: var(--accent); }
.mx .m.note { border-left-style: dashed; }
.mx .m .s { color: var(--accent-bright); margin-right: .6ch; text-decoration: none; } /* the terminal palette's global .s is strike-through */
.mx.mine .m .s { margin-right: 0; }
.mx.mine .m.me .s { color: var(--fg-dim); }
.mx .m .who { display: flex; align-items: baseline; gap: .8ch; }
.mx .m .sh-plate { margin-right: .6ch; }
.mx.mine .m .sh-plate { margin-right: 0; }
.mx .m .mts { color: var(--fg-faint); font-size: .64rem; margin-right: .6ch; }
.mx .m .t { display: block; color: var(--fg); white-space: pre-wrap; }
.mx.assist .m { padding-left: 0; border-left: 0; }
.mx.assist .m .t { display: inline; }
.mx .sys { color: var(--fg-faint); font-size: .64rem; letter-spacing: .12em; text-transform: uppercase; padding: 2px 0; }
.mx .sys::before { content: "-- " / ""; }
.mx .m.note .s::after { content: " (note)" / ""; color: var(--alert); font-size: .7em; letter-spacing: .1em; text-transform: uppercase; }

/* Reply: Tickets has the note switch and a bare textarea; My tickets a boxed .sh-field and [ REPLY ]; Assist a > line. */
.mx .reply { display: flex; align-items: center; gap: .8rem; padding: 7px 10px; border-top: 1px solid var(--accent); flex: 0 0 auto; }
.mx.mine .reply { flex-direction: column; align-items: stretch; gap: 4px; }
.mx.assist .reply { gap: .6rem; padding: 6px 10px; }
.mx .int { color: var(--fg-dim); font-size: .6rem; letter-spacing: .14em; text-transform: uppercase; display: flex; align-items: center; gap: 4px; }
.mx .reply textarea { flex: 1; min-width: 0; color: var(--fg); font-family: inherit; font-size: .85rem; caret-color: var(--accent-bright); resize: vertical; }
.mx.tickets .reply textarea { background: transparent; border: 0; outline: none; padding: 0; min-height: 0; }
.mx .rkeys { display: flex; gap: 6px; align-items: center; }
.mx .rkeys .send { margin-left: auto; }
.mx .chev { color: var(--accent-bright); }
.mx .reply input { flex: 1; min-width: 0; background: transparent; border: 0; outline: none; color: var(--fg); font: inherit; font-size: .85rem; caret-color: var(--accent-bright); min-height: 24px; }
.mx .closed-note { padding: 7px 10px; border-top: 1px solid var(--border); color: var(--fg-faint); font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; flex: 0 0 auto; }
.mx .chead { display: flex; flex-direction: column; gap: 4px; padding: 7px 10px; border-bottom: 1px solid var(--border); flex: 0 0 auto; }
.mx .ctitle { color: var(--gold); letter-spacing: .04em; font-size: .88rem; }
.mx .cmeta { display: flex; flex-wrap: wrap; align-items: center; gap: 1ch; }
.mx .ckind { color: var(--accent-bright); text-transform: uppercase; letter-spacing: .12em; font-size: .66rem; }
/* A destructive command waiting for its confirming second press. */
.mx .sh-cmd.armed, .mx .sh-cmd.armed:is(:hover, :focus-visible) { background: var(--alert); color: var(--bg-deep); }

/* Puppets: .sh-row rows laid out in a line; the terminal view has a head, feed, scene and input. */
.mx.puppets { overflow: hidden; }
.mx.puppets .row { flex-direction: row; gap: 1ch; align-items: baseline; }
.mx.puppets .row strong, .mx.puppets .term-head strong, .mx.puppets .prompt { color: var(--gold); font-weight: 400; }
.mx.puppets small { color: var(--fg-faint); font-size: .8em; }
.mx.puppets .where { margin-left: auto; color: var(--fg-dim); font-size: .8em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mx.puppets .pbadge { margin-left: 6px; min-width: 1.4em; padding: 0 .5ch; background: var(--gold); color: var(--bg-deep); font-size: .64rem; text-align: center; }
.mx.puppets .term-head { display: flex; gap: 1ch; align-items: center; padding: 5px 8px 5px 10px; border-bottom: 1px solid var(--accent); flex: 0 0 auto; }
.mx.puppets .term-head .tool { flex: none; }
.mx.puppets .term-head .where { max-width: 40%; }
.mx.puppets .term-head .name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.mx.puppets .term-feed { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
.mx.puppets .term-line { color: var(--fg); font-size: .9em; white-space: pre-wrap; word-break: break-word; }
.mx.puppets .term-line.self { color: var(--fg-dim); }
.mx.puppets .pscene { border-top: 1px solid var(--border); padding: 4px 10px; font-size: .74rem; color: var(--fg-dim); display: flex; flex-direction: column; gap: 1px; flex: 0 0 auto; }
.mx.puppets .pscene .rn { color: var(--accent-bright); text-transform: uppercase; letter-spacing: .16em; font-size: .7rem; }
.mx.puppets .pscene .lk { color: var(--fg-faint); text-transform: uppercase; letter-spacing: .12em; font-size: .6rem; margin-right: .6ch; }
.mx.puppets .term-input { display: flex; gap: .8ch; align-items: center; padding: 6px 10px; border-top: 1px solid var(--accent); flex: 0 0 auto; }
.mx.puppets .term-input input { flex: 1; min-width: 0; background: transparent; border: 0; outline: none; color: var(--fg); padding: 3px 0; font: inherit; caret-color: var(--accent-bright); min-height: 24px; }
.mx.puppets .sync, .mx.puppets .empty { color: var(--fg-faint); font-size: .64rem; letter-spacing: .14em; text-transform: uppercase; padding: 10px; }
@media (max-width: 420px) { .mx button, .mx .sh-cmd, .mx .sh-toggle { min-height: 32px; } }
`;

// node_modules/@runmu.sh/ext-kit/dist/dom.js
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === void 0 || v === null || v === false)
      continue;
    if (k === "class")
      el.className = String(v);
    else if (k === "style")
      el.style.cssText = String(v);
    else if (k.startsWith("on") && typeof v === "function")
      el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "value")
      el.value = String(v);
    else if (k === "checked")
      el.checked = !!v;
    else
      el.setAttribute(k, v === true ? "" : String(v));
  }
  append(el, kids);
  return el;
}
function append(el, kids) {
  for (const c of kids) {
    if (c === null || c === void 0 || c === false)
      continue;
    if (Array.isArray(c))
      append(el, c);
    else
      el.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
}
function age(mins) {
  if (mins === void 0 || mins === null || !Number.isFinite(+mins))
    return "";
  const m = Math.max(0, Math.round(+mins));
  if (m < 60)
    return `${m}m`;
  if (m < 60 * 24)
    return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}
function clock(ts) {
  if (ts === void 0 || ts === null || ts === "")
    return "";
  const n = typeof ts === "number" ? ts < 1e12 ? ts * 1e3 : ts : Date.parse(ts);
  if (!Number.isFinite(n))
    return "";
  const d = new Date(n);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
var ALLOWED = /* @__PURE__ */ new Set(["B", "I", "EM", "STRONG", "U", "S", "CODE", "PRE", "BR", "P", "SPAN", "A", "UL", "OL", "LI", "BLOCKQUOTE"]);
function sanitize(html) {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const walk = (n) => {
    for (const c of [...n.childNodes]) {
      if (c.nodeType === 1) {
        const e = c;
        if (!ALLOWED.has(e.tagName)) {
          if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|TEMPLATE)$/.test(e.tagName)) {
            e.remove();
            continue;
          }
          walk(e);
          e.replaceWith(...e.childNodes);
          continue;
        }
        for (const a of [...e.attributes])
          if (!(e.tagName === "A" && a.name === "href" && /^https?:/i.test(a.value)))
            e.removeAttribute(a.name);
        if (e.tagName === "A") {
          e.setAttribute("target", "_blank");
          e.setAttribute("rel", "noopener noreferrer");
        }
        walk(e);
      } else if (c.nodeType !== 3)
        c.remove();
    }
  };
  walk(tpl.content);
  return tpl.content;
}
function body(m, rich) {
  if (rich && m.html) {
    const s = h("span");
    s.appendChild(sanitize(m.html));
    return s;
  }
  return document.createTextNode(m.text ?? (m.html ? sanitize(m.html).textContent ?? "" : ""));
}
function fill(el, ...kids) {
  el.replaceChildren();
  append(el, kids);
}

// src/index.ts
var P = "Client.Assist";
var idS = { type: ["string", "integer"] };
var msgS = { type: "object", properties: { text: { type: "string" }, html: { type: "string" }, sender: { type: "string" }, ts: { type: ["number", "string"] } } };
var threadS = {
  type: "object",
  required: ["account_id"],
  properties: { account_id: idS, account_key: { type: "string" }, account_name: { type: "string" }, assignee: { type: "string" }, status: { type: "string" }, age_mins: { type: "number" }, count: { type: "integer" }, preview: { type: "string" }, messages: { type: "array", items: msgS } }
};
var SCHEMAS = {
  Inbox: { type: "object", required: ["threads"], properties: { threads: { type: "array", items: threadS } } },
  Thread: { ...threadS, required: ["account_id", "messages"] },
  Message: { type: "object", required: ["account_id", "message"], properties: { account_id: idS, message: msgS } }
};
var STATUSES = ["open", "pending", "resolved"];
var PLATE = { open: "hot", pending: "gold", resolved: "dim" };
var plate = (s) => `sh-plate ${PLATE[s] ?? ""}`.trim();
var index_default = defineExtension({
  activate(ctx) {
    const mu = ctx.mu;
    const stOf = /* @__PURE__ */ new Map();
    const S = (sid) => stOf.get(sid) ?? stOf.set(sid, { inbox: [], threads: /* @__PURE__ */ new Map(), fresh: /* @__PURE__ */ new Set() }).get(sid);
    const active = () => mu.sessions.active()?.id ?? null;
    const need = (sid) => {
      const s = sid ?? active();
      if (!s) throw new Error("no active session");
      return s;
    };
    const key = (t) => String(t.account_id);
    const mod = new WorldModule(mu, {
      key: "assist",
      title: "Assist",
      panels: ["assist"],
      pkg: P,
      staff: true,
      actions: {
        view: { label: "View", via: "command", cmd: "@assistview #{account}" },
        claim: { label: "Claim", via: "command", cmd: "@assistclaim #{account}" },
        status: { label: "Status", via: "command", cmd: "@assiststatus #{account} {status}" },
        reply: { label: "Reply", via: "command", cmd: "@assist #{account} = {text}" }
      },
      gmcpAction: (a, v) => [`${P}.Action`, { action: a, account_id: v.account, ...v.status ? { status: v.status } : {}, ...v.text ? { text: v.text } : {} }],
      options: [{ key: "rich", label: "Rich text in messages", default: false, kind: "toggle", scope: "both" }]
    });
    mu.ui.style(MODULE_CSS);
    mu.settings.define({ title: "Assist", items: mod.settingItems() });
    const redraws = /* @__PURE__ */ new Set();
    const redraw = () => redraws.forEach((f) => f());
    const setInbox = (sid, list) => {
      const st = S(sid);
      st.inbox = list.map((t) => ({ ...t, account_id: key(t) }));
      const fresh = mod.fresh(sid, st.inbox.map(key));
      for (const id of fresh) st.fresh.add(id);
      mod.announce(st.inbox.filter((t) => fresh.includes(key(t))).map((t) => ({ title: `Help request from ${t.account_key ?? t.account_name ?? "#" + key(t)}`, body: t.preview })));
      mod.setStaff(sid, true);
      mod.touched(sid);
      redraw();
    };
    const setThread = (sid, t) => {
      const st = S(sid), id = key(t);
      st.threads.set(id, { ...st.threads.get(id), ...t, account_id: id });
      const row = st.inbox.find((x) => key(x) === id);
      if (row && t.account_key) row.account_key = t.account_key;
      redraw();
    };
    const pushMessage = (sid, d) => {
      const st = S(sid), id = key(d);
      const t = st.threads.get(id);
      if (t) t.messages = [...t.messages ?? [], d.message];
      const row = st.inbox.find((x) => key(x) === id);
      if (row) {
        row.count = (row.count ?? 0) + 1;
        row.preview = d.message.text ?? row.preview;
      }
      redraw();
    };
    const handle = (pkg, data, sid) => {
      const sub = pkg.slice(P.length + 1);
      const schema = SCHEMAS[sub];
      if (!schema || !mod.acceptsGmcp(sid) || !mod.check(sid, pkg, schema, data)) return;
      const d = data;
      if (sub === "Inbox") setInbox(sid, d.threads);
      else if (sub === "Thread") {
        setThread(sid, d);
        mod.touched(sid);
      } else pushMessage(sid, d);
    };
    mu.gmcp.on(P, (data, { sid, pkg }) => handle(pkg, data, sid));
    replay(mu, [`${P}.Inbox`], handle);
    const views = /* @__PURE__ */ new Map();
    const viewOf = (sid) => views.get(sid) ?? views.set(sid, { open: null, draft: "" }).get(sid);
    function mount(el, pc) {
      el.classList.add("mx", "assist");
      el.dataset.testid = "assist";
      const draw = () => {
        const sid = pc.sid ?? active();
        const focused = el.contains(document.activeElement) ? document.activeElement.dataset.focus : void 0;
        if (!sid) {
          fill(el, h("p", { class: "empty" }, "No session"));
          return;
        }
        const st = S(sid), v = viewOf(sid);
        const head = (...extra) => h("div", { class: "hd" }, h("span", { class: "tag glow-text" }, "Assist"), h("span", { class: "sub" }, "help desk"), ...extra);
        if (!v.open) {
          fill(
            el,
            head(st.inbox.length ? h("span", { class: "count", "data-testid": "assist-count" }, String(st.inbox.length)) : null),
            h(
              "div",
              { class: "list", "data-testid": "assist-list" },
              st.inbox.length ? st.inbox.map((t) => h(
                "button",
                {
                  class: `sh-row row ticket${st.fresh.has(key(t)) ? " hot" : ""}`,
                  type: "button",
                  "data-id": key(t),
                  "data-focus": `row-${key(t)}`,
                  onclick: () => {
                    v.open = key(t);
                    st.fresh.delete(key(t));
                    draw();
                    void mod.run("view", { account: key(t) }, sid);
                  }
                },
                h(
                  "span",
                  { class: "r1" },
                  h("span", { class: "who" }, t.account_key ?? t.account_name ?? `#${key(t)}`),
                  h(
                    "span",
                    { class: "meta" },
                    t.assignee ? h("span", { class: "asg", title: `claimed by ${t.assignee}` }, t.assignee) : null,
                    t.status ? h("span", { class: `${plate(t.status)} status` }, t.status) : null,
                    h("span", { class: "age" }, age(t.age_mins)),
                    t.count ? h("span", { class: "age", title: "messages" }, `\xB7 ${t.count}`) : null
                  )
                ),
                t.preview ? h("span", { class: "prev" }, t.preview) : null
              )) : h("p", { class: "empty", "data-testid": "assist-empty" }, "No open tickets.")
            )
          );
        } else {
          const id = v.open;
          const t = { ...st.inbox.find((x) => key(x) === id), ...st.threads.get(id), account_id: id };
          const rich = mod.option("rich", sid);
          fill(
            el,
            head(h("button", { class: "sh-cmd back", type: "button", "data-testid": "assist-back", "data-focus": "back", onclick: () => {
              v.open = null;
              draw();
            } }, "Inbox")),
            h(
              "div",
              { class: "convo", "data-testid": "assist-thread" },
              h(
                "div",
                { class: "who-head" },
                h("span", { class: "petitioner" }, t.account_key ?? t.account_name ?? `#${id}`, t.account_name && t.account_key ? h("span", { class: "acct" }, t.account_name) : null),
                t.status ? h("span", { class: plate(t.status), "data-testid": "assist-plate" }, t.status) : null,
                h(
                  "span",
                  { class: "actions" },
                  mod.shows("status", sid) ? h("select", {
                    class: "sh-field act",
                    "aria-label": "status",
                    "data-testid": "assist-status",
                    "data-focus": "status",
                    onchange: (e) => {
                      const s = e.target.value;
                      void mod.run("status", { account: id, status: s }, sid);
                    }
                  }, STATUSES.map((s) => h("option", { value: s, ...s === (t.status ?? "open") ? { selected: true } : {} }, s))) : null,
                  mod.shows("claim", sid) ? h("button", { class: "sh-cmd act", type: "button", "data-action": "claim", "data-focus": "claim", onclick: () => void mod.run("claim", { account: id }, sid) }, t.assignee ? `Claimed \xB7 ${t.assignee}` : "Claim") : null
                )
              ),
              h(
                "div",
                { class: "msgs", "data-testid": "assist-msgs" },
                t.messages?.length ? t.messages.map((m) => h(
                  "div",
                  { class: `m${m.visibility === "internal" ? " note" : ""}` },
                  m.ts !== void 0 ? h("span", { class: "ts" }, clock(m.ts)) : null,
                  h("span", { class: "s" }, m.sender ?? "?"),
                  h("span", { class: "t" }, body(m, rich))
                )) : h("p", { class: "empty" }, "No messages in this thread.")
              ),
              mod.shows("reply", sid) ? h(
                "form",
                {
                  class: "reply",
                  onsubmit: async (e) => {
                    e.preventDefault();
                    const input = el.querySelector("[data-testid=assist-reply]");
                    const text = input.value.trim();
                    if (!text) return;
                    await mod.run("reply", { account: id, text }, sid);
                    input.value = "";
                    v.draft = "";
                  }
                },
                h("span", { class: "chev glow-text", "aria-hidden": "true" }, ">"),
                h("input", { type: "text", "aria-label": "assist reply", placeholder: "Reply", autocomplete: "off", value: v.draft, "data-testid": "assist-reply", "data-focus": "reply", oninput: (e) => {
                  v.draft = e.target.value;
                } })
              ) : null
            )
          );
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
    mu.panels.register({ id: "assist", title: "Assist", singleton: true, defaultPosition: "right-bottom", inViewsMenu: false, mount });
    ctx.subscriptions.push(...mod.bind(), mod.onChange(redraw));
    const api = {
      enable: (mode, w) => mod.configure({ enabled: mode }, w),
      setRole: (role, sid) => mod.setStaff(need(sid), role === "staff"),
      open: () => mu.panels.open("assist"),
      set(what, data, sid) {
        const s = need(sid);
        if (!mod.acceptsApi(s)) return;
        if (what === "inbox") setInbox(s, data.threads ?? []);
        else {
          setThread(s, data);
          mod.touched(s);
        }
      },
      upsert(_w, t, sid) {
        const s = need(sid), st = S(s), id = key(t);
        const row = st.inbox.find((x) => key(x) === id);
        if (row) Object.assign(row, t, { account_id: id });
        else st.inbox.push({ ...t, account_id: id });
        const th = st.threads.get(id);
        if (th) Object.assign(th, t, { account_id: id });
        mod.touched(s);
        redraw();
      },
      remove(_w, accountId, sid) {
        const st = S(need(sid));
        st.inbox = st.inbox.filter((x) => key(x) !== String(accountId));
        redraw();
      },
      push: (_w, m, sid) => pushMessage(need(sid), m),
      get: (_w, sid) => [...S(need(sid)).inbox],
      onAction: (a, fn) => mod.onAction(a, fn),
      configure: (cfg, w) => mod.configure(cfg, w)
    };
    return api;
  }
});
export {
  index_default as default
};
