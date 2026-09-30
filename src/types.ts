/**
 * The public types of @runmu.sh/ext-assist (06-world-modules §4, §6). Get the API with
 * `await ctx.api<AssistApi>('@runmu.sh/ext-assist')`. It mirrors Tickets, keyed on `account_id`.
 */
import type { Dispose } from '@muclient/sdk';

export interface Message { text?: string; html?: string; sender?: string; visibility?: 'public' | 'internal'; ts?: number | string }
export interface Thread {
  account_id: string | number; account_key?: string; account_name?: string; assignee?: string;
  status?: 'open' | 'pending' | 'resolved' | string; age_mins?: number; count?: number; preview?: string;
  messages?: Message[];
}
export type Mode = 'off' | 'auto' | 'on';
export interface ActionSession { sid: string; worldId: string; character: string; send(cmd: string): Promise<void>; gmcp(pkg: string, data?: unknown): Promise<boolean> }
/** `account` is the account id; `status` for the status action; `text` for replies. */
export interface ActionArgs { action: string; account: string; status?: string; text?: string; [k: string]: string | undefined }
export type ActionHandler = (args: ActionArgs, s: ActionSession) => boolean | void | Promise<boolean | void>;

export interface AssistApi {
  enable(mode: Mode, worldId?: string | null): void;
  /** Assist is a staff view: it stays out of Views until the role is staff (Client.Assist.Inbox also marks it). */
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
  configure(cfg: { enabled?: Mode; source?: 'gmcp' | 'api' | 'both'; actions?: Record<string, { via?: 'command' | 'gmcp' | 'ext' | 'none'; cmd?: string }>; options?: Record<string, unknown> }, worldId?: string | null): void;
}
