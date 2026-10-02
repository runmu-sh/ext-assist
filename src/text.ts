/** Pure helpers of the Assist panel (no host): ages, clock times, plates, ordering. */
import type { Thread } from './types';

/** `now` under a minute, then `12m`, `3h`, `2d`. From `created` (epoch s or ms) when the game sends it, else `age_mins`. */
export function age(t: Pick<Thread, 'created' | 'age_mins'>, now = Date.now()): string {
  let mins: number;
  if (typeof t.created === 'number' && Number.isFinite(t.created)) mins = (now - (t.created < 1e12 ? t.created * 1000 : t.created)) / 60000;
  else if (typeof t.age_mins === 'number' && Number.isFinite(t.age_mins)) mins = t.age_mins;
  else return '';
  const m = Math.max(0, Math.floor(mins));
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

/** `12:04` (local) from an epoch (s or ms) or ISO string; '' when absent or unreadable. */
export function clock(ts?: number | string): string {
  if (ts === undefined || ts === null || ts === '') return '';
  const n = typeof ts === 'number' ? (ts < 1e12 ? ts * 1000 : ts) : Date.parse(ts);
  if (!Number.isFinite(n)) return '';
  const d = new Date(n);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Status plates: open waits on staff (hot), pending on the player (gold), resolved / closed are dim. */
const PLATE: Record<string, 'hot' | 'gold' | 'dim'> = { open: 'hot', pending: 'gold', resolved: 'dim', closed: 'dim' };
export function plateOf(status: string, css: { plate: string; hot: string; gold: string; dim: string }): string {
  const p = PLATE[status];
  return p ? `${css.plate} ${css[p]}` : css.plate;
}

/** The name a request is shown under: its account key, else name, else `#id`. */
export const whoOf = (t: Pick<Thread, 'account_id' | 'account_key' | 'account_name'>) => t.account_key || t.account_name || `#${t.account_id}`;

/** Oldest first by `created` when the game sends it (rows without it keep their place after); else the game's order. */
export function sortInbox<T extends Pick<Thread, 'created'>>(list: T[]): T[] {
  const when = (t: T) => (typeof t.created === 'number' && Number.isFinite(t.created) ? (t.created < 1e12 ? t.created * 1000 : t.created) : undefined);
  if (!list.some((t) => when(t) !== undefined)) return [...list];
  return list.map((t, i) => ({ t, i, w: when(t) })).sort((a, b) => {
    if (a.w === undefined || b.w === undefined) return a.w === undefined && b.w === undefined ? a.i - b.i : a.w === undefined ? 1 : -1;
    return a.w - b.w || a.i - b.i;
  }).map((x) => x.t);
}
