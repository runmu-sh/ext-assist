/**
 * The panel's look (after Underspire's Assist view). Every rule is scoped to this extension's panel, takes colours
 * from theme tokens only, and sits on top of the host's primitives (`sh-row`, `sh-cmd`, `sh-plate`, `sh-field`,
 * `glow-text`), which draw the rows, the buttons, the status plates and the select.
 */
const S = '.ext-panel[data-ext="assist"] .mx.assist';

export const CSS = `
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
${S} .asg::before { content: "◆ " / ""; }
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
