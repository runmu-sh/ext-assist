/**
 * The public types of @runmu.sh/ext-assist. Get the API with `await ctx.api<AssistApi>('@runmu.sh/ext-assist')`
 * (or `ctx.extension('assist')`). It mirrors Tickets, keyed on `account_id`. The payloads are the GMCP contract
 * (schema/*.json).
 */
import type { Dispose } from '@muclient/sdk';

/** One message of a thread. `html` / `sender_html` are shown (sanitized) when Rich text is on. */
export interface Message { text?: string; html?: string; sender?: string; sender_html?: string; visibility?: 'public' | 'internal' | string; ts?: number | string }
export interface Thread {
  account_id: string | number; account_key?: string; account_name?: string; assignee?: string;
  status?: 'open' | 'pending' | 'resolved' | string;
  /** Minutes since the request was opened. */
  age_mins?: number;
  /** When the request was opened (epoch seconds or ms): orders the inbox oldest first and gives the age. @since 1.2.0 */
  created?: number;
  count?: number; preview?: string;
  messages?: Message[];
}
export type Mode = 'off' | 'auto' | 'on';
export type Source = 'gmcp' | 'api' | 'both';
export interface ActionSession { sid: string; worldId: string; character: string; send(cmd: string): Promise<void>; gmcp(pkg: string, data?: unknown): Promise<boolean> }
/** `account` is the account id and `key` its account key; `status` for the status action; `text` for replies. */
export interface ActionArgs { action: string; account: string; key?: string; status?: string; text?: string; [k: string]: string | undefined }
/** Return `true` to say the action was handled (nothing is sent). */
export type ActionHandler = (args: ActionArgs, s: ActionSession) => boolean | void | Promise<boolean | void>;

export interface AssistApi {
  enable(mode: Mode, worldId?: string | null): void;
  /** Assist is a staff view: it is offered only where the role is staff (Client.Assist.Inbox also marks it). */
  setRole(role: 'staff' | 'player', sid?: string): void;
  open(): void;
  /** Same shape as Client.Assist.Inbox. */
  set(what: 'inbox', data: { threads: Thread[] }, sid?: string): void;
  /** Same shape as Client.Assist.Thread. */
  set(what: 'thread', data: Thread, sid?: string): void;
  upsert(what: 'thread', t: Partial<Thread> & { account_id: string | number }, sid?: string): void;
  remove(what: 'thread', accountId: string | number, sid?: string): void;
  /** Same shape as Client.Assist.Message. */
  push(what: 'message', m: { account_id: string | number; message: Message }, sid?: string): void;
  get(what: 'inbox', sid?: string): readonly Thread[];
  onAction(action: 'view' | 'claim' | 'status' | 'reply' | string, fn: ActionHandler): Dispose;
  configure(cfg: { enabled?: Mode; source?: Source; actions?: Record<string, { via?: 'command' | 'gmcp' | 'ext' | 'none'; cmd?: string }>; options?: Record<string, unknown> }, worldId?: string | null): void;
}
