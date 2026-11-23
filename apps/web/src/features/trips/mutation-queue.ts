import type { EntryCardRow, TripPlan, TripSyncPayload } from '@nagi/database';
import type { TripEdit, TripMutationRequest, TripResult, TripTransportChange } from '@nagi/shared';
import {
  applyTripEvent,
  optimisticTripChange,
  transportTripChange,
  tripMutationGuards,
  tripMutationKeys,
} from './mutation-model';
import type { TripMutationContext, TripEntitySaveState } from './planner-model';

export class TripMutationError extends Error {
  constructor(
    public reason: 'temporary' | 'conflict' | 'forbidden' | 'invalid',
    message: string,
  ) {
    super(message);
  }
}
type Task = {
  id: string;
  change: TripTransportChange;
  expected: TripMutationRequest['expected'];
  keys: string[];
  entry?: EntryCardRow;
  state: 'queued' | 'sending' | 'retry' | 'paused';
  attempts: number;
  wire?: TripMutationRequest;
  timer?: ReturnType<typeof setTimeout>;
};
export type TripQueueState = {
  plan: TripPlan;
  pending: number;
  failed: boolean;
  entityStates: Readonly<Record<string, TripEntitySaveState>>;
  error: string;
  online: boolean;
  connected: boolean;
  revoked: boolean;
  canEdit: boolean;
  canManage: boolean;
};
type Options = {
  viewer: string;
  canEdit: boolean;
  canManage: boolean;
  send: (request: TripMutationRequest, signal: AbortSignal) => Promise<TripSyncPayload>;
  recover: (
    version: number,
    signal: AbortSignal,
  ) => Promise<TripSyncPayload | { snapshot: TripPlan; can_edit: boolean; can_manage: boolean }>;
};
/** A journal of local intent over one confirmed plan. A failed write removes only
 * that intent; it never restores a snapshot over other collaborators' work. */
export class TripMutationQueue {
  private confirmed: TripPlan;
  private tasks: Task[] = [];
  private listeners = new Set<() => void>();
  private active = new Map<string, Task>();
  private abort = new AbortController();
  private disposed = false;
  private recovering: Promise<void> | undefined;
  private permanentError = '';
  private failedEntities = new Set<string>();
  private suspendedKeys = new Set<string>();
  private recoveryAgain = false;
  private snapshot: TripQueueState;
  private buffer = new Map<
    number,
    {
      event: TripSyncPayload['events'][number];
      extra: Pick<TripSyncPayload, 'entries' | 'connections' | 'people'>;
    }
  >();
  constructor(
    plan: TripPlan,
    private options: Options,
  ) {
    this.confirmed = plan;
    this.snapshot = {
      plan,
      pending: 0,
      failed: false,
      entityStates: {},
      error: '',
      online: true,
      connected: false,
      revoked: false,
      canEdit: options.canEdit,
      canManage: options.canManage,
    };
  }
  getSnapshot = () => this.snapshot;
  getVersion = () => this.confirmed.version;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private publish(patch: Partial<TripQueueState> = {}) {
    if (this.disposed) return;
    let plan = this.confirmed;
    for (const task of this.tasks)
      plan = optimisticTripChange(plan, task.change, this.options.viewer, task.entry);
    const entityStates: Record<string, TripEntitySaveState> = {};
    for (const id of this.failedEntities) entityStates[id] = 'error';
    for (const task of this.tasks)
      for (const key of task.keys)
        if (key.startsWith('entity:')) {
          const id = key.slice(7);
          if (task.state === 'retry' || task.state === 'paused') entityStates[id] = 'error';
          else entityStates[id] ??= 'saving';
        }
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      plan,
      pending: this.tasks.length,
      failed: this.tasks.some((t) => t.state === 'paused'),
      entityStates,
    };
    for (const listener of this.listeners) listener();
  }
  enqueue = (
    change: TripEdit,
    _version?: number,
    entry?: EntryCardRow,
    context?: TripMutationContext,
  ): Promise<TripResult> => {
    if (this.disposed || this.snapshot.revoked || !this.snapshot.canEdit)
      return Promise.resolve({ ok: false, error: 'Ce voyage n’est plus modifiable.' });
    const plan = this.snapshot.plan;
    try {
      const intent = context
        ? {
            ...plan,
            items: plan.items.map((item) =>
              context.item?.id === item.id
                ? context.item
                : context.stop && item.stops.some((stop) => stop.id === context.stop!.id)
                  ? {
                      ...item,
                      stops: item.stops.map((stop) =>
                        stop.id === context.stop!.id ? context.stop! : stop,
                      ),
                    }
                  : item,
            ),
            days: plan.days.map((day) => (context.day?.id === day.id ? context.day : day)),
          }
        : plan;
      const normalized = transportTripChange(intent, change);
      if (!normalized) return Promise.resolve({ ok: true, version: plan.version });
      const expected = tripMutationGuards(intent, normalized),
        keys = tripMutationKeys(plan, normalized);
      for (const key of keys)
        if (key.startsWith('entity:')) this.failedEntities.delete(key.slice(7));
      // Only adjacent, unsent property patches coalesce; structural operations
      // and requests with an ambiguous network outcome retain their identity.
      const last = this.tasks.at(-1);
      if (
        last?.state === 'queued' &&
        !last.wire &&
        normalized.operation.startsWith('patch_') &&
        last.change.operation === normalized.operation &&
        'id' in normalized.data &&
        'id' in last.change.data &&
        last.change.data.id === normalized.data.id &&
        'patch' in last.change.data &&
        'patch' in normalized.data
      ) {
        last.change = {
          ...normalized,
          data: {
            id: normalized.data.id,
            patch: { ...last.change.data.patch, ...normalized.data.patch },
          },
        } as TripTransportChange;
        for (const kind of ['items', 'stops', 'days'] as const)
          for (const [id, guard] of Object.entries(expected[kind]))
            last.expected[kind][id] = { ...guard, ...last.expected[kind][id] };
        last.keys = [...new Set([...last.keys, ...keys])];
      } else
        this.tasks.push({
          id: crypto.randomUUID(),
          change: normalized,
          expected,
          keys,
          entry,
          state: 'queued',
          attempts: 0,
        });
      this.publish({ error: this.permanentError });
      queueMicrotask(() => this.pump());
      return Promise.resolve({ ok: true, version: plan.version });
    } catch (error) {
      return Promise.resolve({
        ok: false,
        error: error instanceof Error ? error.message : 'Cette modification n’est plus possible.',
      });
    }
  };
  private pump() {
    if (this.disposed || !this.snapshot.online || this.snapshot.revoked) return;
    const blocked = new Set<string>(this.suspendedKeys);
    for (const task of this.tasks) {
      const waiting = task.keys.some((key) => blocked.has(key));
      for (const key of task.keys) blocked.add(key);
      if (task.state !== 'queued' || waiting || this.active.size >= 3) continue;
      task.state = 'sending';
      this.active.set(task.id, task);
      task.wire ??= {
        id: task.id,
        base: this.confirmed.version,
        change: task.change,
        expected: task.expected,
      };
      void this.send(task);
    }
  }
  private async send(task: Task) {
    try {
      const batch = await this.options.send(task.wire!, this.abort.signal);
      if (this.disposed || this.snapshot.revoked) return;
      // A successful response is authoritative even for an idempotent no-op.
      this.receive(batch);
      if (batch.reset || batch.version > this.confirmed.version) await this.recover();
      if (batch.version > this.confirmed.version) {
        task.state = 'paused';
        this.publish({ error: 'La confirmation attend une resynchronisation. Réessayez.' });
        return;
      }
      this.tasks = this.tasks.filter((t) => t.id !== task.id);
      for (const key of task.keys)
        if (key.startsWith('entity:')) this.failedEntities.delete(key.slice(7));
      this.publish({
        error:
          this.permanentError ||
          (this.tasks.some((t) => t.state === 'paused') ? this.snapshot.error : ''),
      });
    } catch (error) {
      if (this.disposed || !this.tasks.includes(task)) return;
      const problem =
        error instanceof TripMutationError
          ? error
          : new TripMutationError(
              'temporary',
              'La sauvegarde est interrompue. Vos modifications restent en attente.',
            );
      if (problem.reason === 'forbidden') {
        this.revoke(problem.message);
        return;
      }
      if (problem.reason === 'temporary') {
        task.attempts++;
        task.state = task.attempts >= 3 ? 'paused' : 'retry';
        if (task.state === 'retry')
          task.timer = setTimeout(
            () => {
              task.state = 'queued';
              this.pump();
            },
            Math.min(4000, 500 * 2 ** (task.attempts - 1)),
          );
        this.publish({ error: problem.message });
      } else {
        this.permanentError = problem.message;
        for (const key of task.keys)
          if (key.startsWith('entity:')) this.failedEntities.add(key.slice(7));
        for (const key of task.keys) this.suspendedKeys.add(key);
        this.tasks = this.tasks.filter((t) => t !== task);
        await this.recover();
        this.rebaseRejectedPatch(task);
        for (const key of task.keys) this.suspendedKeys.delete(key);
        this.publish({ error: problem.message });
      }
    } finally {
      this.active.delete(task.id);
      if (!this.disposed) this.pump();
    }
  }
  receive = (batch: TripSyncPayload) => {
    if (this.disposed || this.snapshot.revoked) return;
    const ownIds = new Set(this.tasks.map((t) => t.id));
    for (const event of batch.events)
      if (event.trip_id === this.confirmed.id && event.version > this.confirmed.version)
        this.buffer.set(event.version, { event, extra: batch });
    for (;;) {
      const next = [...this.buffer.values()].find(
        ({ event }) => event.previous_version === this.confirmed.version,
      );
      if (!next) break;
      const previous = this.confirmed;
      this.confirmed = applyTripEvent(this.confirmed, next.event, next.extra);
      this.buffer.delete(next.event.version);
      if (next.event.mutation_id && ownIds.has(next.event.mutation_id))
        this.rebaseOwnGuards(previous, this.confirmed);
    }
    // Acknowledgement must not remove optimistic intent before a missing delta
    // has been recovered (e.g. responses arriving in reverse order).
    this.tasks = this.tasks.filter(
      (task) =>
        !batch.events.some(
          (e) =>
            e.trip_id === this.confirmed.id &&
            e.version <= this.confirmed.version &&
            e.mutation_id === task.id,
        ),
    );
    const newer = batch.version >= this.confirmed.version;
    if (newer && !batch.can_edit && this.tasks.length) {
      for (const task of this.tasks) clearTimeout(task.timer);
      this.tasks = [];
      this.permanentError = 'Ce voyage est désormais en lecture seule.';
    }
    this.publish(
      newer
        ? {
            canEdit: batch.can_edit,
            canManage: batch.can_manage,
            error: this.permanentError || this.snapshot.error,
          }
        : {},
    );
    if (batch.reset || batch.version > this.confirmed.version) void this.recover();
    this.pump();
  };
  private rebaseRejectedPatch(task: Task) {
    if (!('patch' in task.change.data) || !('id' in task.change.data)) return;
    const kind =
      task.change.operation === 'patch_item'
        ? 'items'
        : task.change.operation === 'patch_stop'
          ? 'stops'
          : 'days';
    const id = task.change.data.id;
    const rows =
      kind === 'items'
        ? this.confirmed.items
        : kind === 'stops'
          ? this.confirmed.items.flatMap((item) => item.stops)
          : this.confirmed.days;
    const row = rows.find((row) => row.id === id) as unknown as Record<string, unknown> | undefined;
    if (!row) return;
    for (const later of this.tasks.filter((task) => !task.wire))
      for (const [key, intended] of Object.entries(task.change.data.patch)) {
        const original = task.expected[kind][id]?.[key];
        if (row[key] === original && later.expected[kind][id]?.[key] === intended)
          later.expected[kind][id]![key] = original!;
      }
  }
  private rebaseOwnGuards(before: TripPlan, after: TripPlan) {
    for (const kind of ['items', 'stops', 'days'] as const) {
      const oldRows =
        kind === 'items'
          ? before.items
          : kind === 'stops'
            ? before.items.flatMap((i) => i.stops)
            : before.days;
      const rows =
        kind === 'items'
          ? after.items
          : kind === 'stops'
            ? after.items.flatMap((i) => i.stops)
            : after.days;
      for (const task of this.tasks.filter((t) => !t.wire))
        for (const [id, guard] of Object.entries(task.expected[kind])) {
          const old = oldRows.find((r) => r.id === id) as unknown as
            Record<string, unknown> | undefined;
          const row = rows.find((r) => r.id === id) as unknown as
            Record<string, unknown> | undefined;
          if (row)
            for (const key of Object.keys(guard))
              if (!old || old[key] !== row[key])
                guard[key] = row[key] as string | number | boolean | null;
        }
    }
  }
  recover = async () => {
    if (this.disposed || this.snapshot.revoked) return;
    if (this.recovering) {
      this.recoveryAgain = true;
      return this.recovering;
    }
    this.recovering = (async () => {
      try {
        const response = await this.options.recover(this.confirmed.version, this.abort.signal);
        if ('snapshot' in response)
          this.replace(response.snapshot, response.can_edit, response.can_manage);
        else this.receive(response);
      } catch (error) {
        if (error instanceof TripMutationError && error.reason === 'forbidden')
          this.revoke(error.message);
      }
    })().finally(() => {
      this.recovering = undefined;
      if (this.recoveryAgain) {
        this.recoveryAgain = false;
        void this.recover();
      }
    });
    return this.recovering;
  };
  replace = (
    plan: TripPlan,
    canEdit = this.snapshot.canEdit,
    canManage = this.snapshot.canManage,
  ) => {
    if (
      this.disposed ||
      this.snapshot.revoked ||
      plan.id !== this.confirmed.id ||
      plan.version < this.confirmed.version
    )
      return;
    this.confirmed = plan;
    for (const version of this.buffer.keys())
      if (version <= plan.version) this.buffer.delete(version);
    this.publish({ canEdit, canManage });
  };
  setOnline = (online: boolean) => {
    if (this.snapshot.online === online) return;
    this.publish({ online });
    if (online) this.retry();
  };
  setConnected = (connected: boolean) => {
    if (this.snapshot.connected !== connected) this.publish({ connected });
  };
  clearError = () => {
    this.permanentError = '';
    this.failedEntities.clear();
    this.publish({ error: '' });
  };
  start = () => {
    if (this.disposed) {
      this.disposed = false;
      this.abort = new AbortController();
    }
  };
  retry = () => {
    for (const task of this.tasks)
      if (task.state === 'paused' || task.state === 'retry') {
        clearTimeout(task.timer);
        task.attempts = 0;
        task.state = 'queued';
      }
    this.publish({ error: '' });
    void this.recover();
    this.pump();
  };
  revoke = (error: string) => {
    for (const task of this.tasks) clearTimeout(task.timer);
    this.tasks = [];
    this.failedEntities.clear();
    this.active.clear();
    this.buffer.clear();
    this.abort.abort();
    this.forgetPlan();
    this.publish({ revoked: true, canEdit: false, canManage: false, error, connected: false });
  };
  private forgetPlan() {
    this.confirmed = {
      ...this.confirmed,
      title: 'Voyage indisponible',
      description: '',
      cover_image_url: null,
      created_by: null,
      destination_country_id: null,
      destination: null,
      start_date: null,
      end_date: null,
      timezone: 'UTC',
      items: [],
      days: [],
      people: [],
      connections: [],
      organizers: [],
    };
  }
  dispose = () => {
    this.disposed = true;
    this.abort.abort();
    for (const task of this.tasks) clearTimeout(task.timer);
    this.tasks = [];
    this.active.clear();
    this.buffer.clear();
    this.forgetPlan();
    this.failedEntities.clear();
    this.snapshot = { ...this.snapshot, plan: this.confirmed, pending: 0, entityStates: {} };
    this.listeners.clear();
  };
}
