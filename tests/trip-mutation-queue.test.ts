import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  EntryCardRow,
  TripPlan,
  TripPlanItem,
  TripSyncPayload,
} from '../packages/database/src';
import type { TripMutationRequest, TripRealtimeEvent } from '../packages/shared/src';
import {
  TripMutationError,
  TripMutationQueue,
} from '../apps/web/src/features/trips/mutation-queue';
import { TripQueueRegistry } from '../apps/web/src/features/trips/mutation-registry';
import {
  createCalendarLayoutCache,
  layoutCalendarEvents,
} from '../apps/web/src/features/trips/planner-model';
import {
  applyTripEvent,
  optimisticTripChange,
  transportTripChange,
} from '../apps/web/src/features/trips/mutation-model';

const uuid = (n: number) => `${n.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`;
const viewer = uuid(1),
  trip = uuid(2),
  day = uuid(3);
const item = (n: number): TripPlanItem => ({
  id: uuid(n),
  trip_id: trip,
  trip_day_id: day,
  entry_id: uuid(n + 1000),
  entry: null,
  stops: [],
  added_by: viewer,
  notes: '',
  sort_order: n * 1024,
  start_time: '11:00:00',
  end_time: null,
  estimated_duration_minutes: 60,
  calendar_color: null,
  version: 0,
  created_at: '2026-11-20T00:00:00Z',
  updated_at: '2026-11-20T00:00:00Z',
});
function fixture(count = 3): TripPlan {
  return {
    id: trip,
    guild_id: '123456789012345678',
    title: 'Test',
    description: '',
    version: 0,
    created_by: viewer,
    status: 'planned',
    collaboration_mode: 'all_members',
    timezone: 'UTC',
    cover_image_url: null,
    start_date: null,
    end_date: null,
    destination_country_id: null,
    destination: null,
    days: [
      {
        id: day,
        trip_id: trip,
        day_number: 1,
        date: null,
        title: 'Jour',
        sort_order: 0,
        created_at: '2026-11-20',
        updated_at: '2026-11-20',
      },
    ],
    items: Array.from({ length: count }, (_, i) => item(i + 10)),
    people: [],
    connections: [],
    organizers: [{ user_id: viewer }],
    stopsAvailable: true,
    created_at: '2026-11-20',
    updated_at: '2026-11-20',
  };
}
const empty = () => ({ upsert: [], patch: [], remove: [] });
const color = (id: string, value: string) => ({
  operation: 'color_item' as const,
  data: { id, item_version: 0, color: value },
});
async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
const queues: TripMutationQueue[] = [];
afterEach(() => {
  for (const queue of queues) queue.dispose();
  queues.length = 0;
  vi.useRealTimers();
});
function setup(count = 3) {
  let server = fixture(count);
  const events: TripRealtimeEvent[] = [];
  const requests: {
    wire: TripMutationRequest;
    resolve: (batch: TripSyncPayload) => void;
    reject: (error: Error) => void;
  }[] = [];
  const batch = (after = 0): TripSyncPayload => ({
    version: server.version,
    events: events.filter((e) => e.version > after),
    reset: false,
    can_edit: true,
    can_manage: true,
    entries: [],
    connections: [],
  });
  const queue = new TripMutationQueue(server, {
    viewer,
    canEdit: true,
    canManage: true,
    send: (wire) => new Promise((resolve, reject) => requests.push({ wire, resolve, reject })),
    recover: async (after) => batch(after),
  });
  queues.push(queue);
  function event(request: TripMutationRequest) {
    const previous = server,
      next = optimisticTripChange(server, request.change, viewer),
      data = request.change.data as { id?: string; patch?: object };
    const changed = next.items.find((i) => i.id === data.id),
      old = previous.items.find((i) => i.id === data.id);
    const delta: TripRealtimeEvent = {
      event_id: crypto.randomUUID(),
      mutation_id: request.id,
      trip_id: trip,
      previous_version: server.version,
      version: server.version + 1,
      entry_ids: [],
      changes: { trip: {}, items: empty(), stops: empty(), days: empty() },
    };
    if (changed && old)
      delta.changes.items.patch = [{ id: changed.id, ...data.patch, version: old.version + 1 }];
    else if (changed)
      delta.changes.items.upsert = [
        Object.fromEntries(
          Object.entries(changed).filter(([key]) => !['entry', 'stops'].includes(key)),
        ) as TripRealtimeEvent['changes']['items']['upsert'][number],
      ];
    else if (old) delta.changes.items.remove = [old.id];
    server = {
      ...next,
      version: delta.version,
      items: next.items.map((i) =>
        i.id === changed?.id ? { ...i, version: (old?.version ?? -1) + 1 } : i,
      ),
    };
    events.push(delta);
    return delta;
  }
  function commit(index: number) {
    const request = requests[index]!;
    event(request.wire);
    request.resolve(batch(request.wire.base));
  }
  return {
    queue,
    requests,
    commit,
    event,
    batch,
    get server() {
      return server;
    },
  };
}

describe('Trip mutation journal and non-blocking queue', () => {
  it('adds an authorized contributor card only when a creation introduces a new author', () => {
    const s = setup();
    const event: TripRealtimeEvent = {
      event_id: crypto.randomUUID(),
      mutation_id: null,
      trip_id: trip,
      previous_version: 0,
      version: 1,
      entry_ids: [],
      changes: { trip: {}, items: empty(), stops: empty(), days: empty() },
    };
    const person = { id: uuid(999), username: 'haru', display_name: 'Haru', avatar_url: null };
    const updated = applyTripEvent(s.server, event, {
      entries: [],
      connections: [],
      people: [person],
    });
    expect(updated.people).toEqual([person]);
    expect(s.server.people).toEqual([]);
  });
  it('reuses calendar geometry for colors and notes while rendering fresh entity data', () => {
    const compute = vi.fn(layoutCalendarEvents),
      layout = createCalendarLayoutCache(compute),
      plan = fixture();
    layout(day, plan.items);
    const changed = plan.items.map((row, index) =>
      index ? row : { ...row, calendar_color: '#73A6DF', notes: 'Billets' },
    );
    const shown = layout(day, changed);
    expect(compute).toHaveBeenCalledTimes(1);
    expect(shown[0]?.item).toBe(changed[0]);
    layout(
      day,
      changed.map((row, index) => (index ? row : { ...row, start_time: '12:00:00' })),
    );
    expect(compute).toHaveBeenCalledTimes(2);
  });
  it('keeps writes alive across internal navigation and isolates workspace registries', async () => {
    vi.useFakeTimers();
    const s = setup(),
      registry = new TripQueueRegistry(),
      key = `${viewer}:${trip}`;
    registry.get(key, () => s.queue);
    registry.retain(key);
    await s.queue.enqueue(color(s.server.items[0]!.id, '#73A6DF'));
    await flush();
    registry.release(key);
    await vi.advanceTimersByTimeAsync(1);
    expect(registry.pending()).toBe(true);
    expect(
      registry.get(key, () => {
        throw new Error('Queue must survive navigation');
      }),
    ).toBe(s.queue);
    s.commit(0);
    await flush();
    expect(registry.pending()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    registry.dispose();
  });
  it('reconciles a later local intent when an earlier patch is rejected without a remote change', async () => {
    const s = setup(),
      id = s.server.items[0]!.id;
    await s.queue.enqueue(color(id, '#73A6DF'));
    await flush();
    await s.queue.enqueue(color(id, '#69AA91'));
    s.requests[0]!.reject(new TripMutationError('invalid', 'Premier refus'));
    await flush();
    expect(s.requests[1]?.wire.expected.items[id]).toEqual({ calendar_color: null });
    s.commit(1);
    await flush();
    expect(s.queue.getSnapshot().plan.items[0]?.calendar_color).toBe('#69AA91');
    expect(s.queue.getSnapshot().error).toBe('Premier refus');
  });
  it('shows ten independent edits immediately and bounds concurrent requests to three', async () => {
    const s = setup(10);
    for (const row of s.queue.getSnapshot().plan.items)
      await s.queue.enqueue(color(row.id, '#73A6DF'));
    expect(s.queue.getSnapshot().plan.items.every((i) => i.calendar_color === '#73A6DF')).toBe(
      true,
    );
    expect(s.requests).toHaveLength(3);
    expect(s.queue.getSnapshot().pending).toBe(10);
    for (let i = 0; i < 10; i++) {
      s.commit(i);
      await flush();
    }
    expect(s.server.items.every((i) => i.calendar_color === '#73A6DF')).toBe(true);
    expect(s.queue.getSnapshot().pending).toBe(0);
  });
  it('serializes an entity and coalesces only its last unsent property patches', async () => {
    const s = setup(),
      id = s.server.items[0]!.id;
    await s.queue.enqueue(color(id, '#73A6DF'));
    await flush();
    await s.queue.enqueue(color(id, '#69AA91'));
    await s.queue.enqueue(color(id, '#A28BC9'));
    await flush();
    expect(s.queue.getSnapshot().plan.items[0]?.calendar_color).toBe('#A28BC9');
    expect(s.requests).toHaveLength(1);
    s.commit(0);
    await flush();
    expect(s.requests).toHaveLength(2);
    expect(s.requests[1]?.wire.expected.items[id]).toEqual({ calendar_color: '#73A6DF' });
    s.commit(1);
    await flush();
    expect(s.queue.getSnapshot().pending).toBe(0);
    expect(s.server.items[0]?.calendar_color).toBe('#A28BC9');
  });
  it('rolls back only a rejected intent and preserves another confirmed edit', async () => {
    const s = setup(),
      [a, b] = s.server.items;
    await s.queue.enqueue(color(a!.id, '#73A6DF'));
    await s.queue.enqueue(color(b!.id, '#69AA91'));
    await flush();
    s.commit(1);
    await flush();
    s.requests[0]!.reject(new TripMutationError('invalid', 'Refus ciblé'));
    await flush();
    expect(s.queue.getSnapshot().plan.items[0]?.calendar_color).toBeNull();
    expect(s.queue.getSnapshot().plan.items[1]?.calendar_color).toBe('#69AA91');
    expect(s.queue.getSnapshot().error).toBe('Refus ciblé');
  });
  it('preserves dirty edits and the exact mutation identity across temporary failures', async () => {
    vi.useFakeTimers();
    const s = setup(),
      id = s.server.items[0]!.id;
    await s.queue.enqueue(color(id, '#73A6DF'));
    await flush();
    const wire = s.requests[0]!.wire;
    for (let i = 0; i < 3; i++) {
      s.requests[i]!.reject(new Error('timeout'));
      await flush();
      if (i < 2) await vi.advanceTimersByTimeAsync(i === 0 ? 500 : 1000);
    }
    expect(s.requests).toHaveLength(3);
    expect(s.queue.getSnapshot().pending).toBe(1);
    expect(s.queue.getSnapshot().failed).toBe(true);
    expect(s.queue.getSnapshot().plan.items[0]?.calendar_color).toBe('#73A6DF');
    s.queue.retry();
    await flush();
    expect(s.requests[3]?.wire).toBe(wire);
    s.commit(3);
    await flush();
    expect(s.queue.getSnapshot().pending).toBe(0);
  });
  it('preserves the original field guard for a form edited while a collaborator changed it', async () => {
    const s = setup(),
      original = s.server.items[0]!;
    const remote: TripMutationRequest = {
      id: crypto.randomUUID(),
      base: 0,
      change: {
        operation: 'patch_item',
        data: { id: original.id, patch: { notes: 'Autre membre' } },
      },
      expected: { items: {}, stops: {}, days: {} },
    };
    s.event(remote);
    s.queue.receive(s.batch());
    await s.queue.enqueue(
      {
        operation: 'edit_item',
        data: {
          id: original.id,
          item_version: 0,
          start_time: '11:00',
          end_time: null,
          duration: 60,
          notes: 'Mon brouillon',
        },
      },
      0,
      undefined,
      { item: original },
    );
    await flush();
    expect(s.requests[0]?.wire.expected.items[original.id]).toEqual({ notes: '' });
    s.requests[0]!.reject(new TripMutationError('conflict', 'Conflit'));
    await flush();
    expect(s.queue.getSnapshot().plan.items[0]?.notes).toBe('Autre membre');
  });
  it('reconciles an early own event without a second write or a visual rollback', async () => {
    const s = setup(),
      id = s.server.items[0]!.id;
    await s.queue.enqueue(color(id, '#73A6DF'));
    await flush();
    s.event(s.requests[0]!.wire);
    s.queue.receive(s.batch());
    expect(s.queue.getSnapshot().pending).toBe(0);
    expect(s.queue.getSnapshot().plan.items[0]?.calendar_color).toBe('#73A6DF');
    expect(s.requests).toHaveLength(1);
    s.queue.receive(s.batch());
    s.requests[0]!.resolve(s.batch());
    await flush();
    expect(s.requests).toHaveLength(1);
  });
  it('recovers missing revisions and ignores duplicate, stale and foreign events', async () => {
    const s = setup(),
      [a, b] = s.server.items;
    for (const row of [a, b])
      s.event({
        id: crypto.randomUUID(),
        base: 0,
        change: {
          operation: 'patch_item',
          data: { id: row!.id, patch: { calendar_color: '#73A6DF' } },
        },
        expected: { items: {}, stops: {}, days: {} },
      });
    const later = s.batch(1);
    s.queue.receive(later);
    await flush();
    expect(s.queue.getSnapshot().plan.version).toBe(2);
    expect(s.queue.getSnapshot().plan.items[0]?.calendar_color).toBe('#73A6DF');
    s.queue.receive(s.batch());
    s.queue.receive({
      ...s.batch(),
      events: s.batch().events.map((e) => ({ ...e, trip_id: uuid(900) })),
    });
    await flush();
    expect(s.queue.getSnapshot().plan.version).toBe(2);
    expect(s.requests).toHaveLength(0);
  });
  it('keeps creation and deletion ordered, without briefly resurrecting a saved item', async () => {
    const s = setup(),
      id = uuid(800),
      entry = { id: uuid(1800), title: 'Lieu' } as EntryCardRow;
    await s.queue.enqueue(
      { operation: 'add_item', data: { id, entry: entry.id, day, repeat: true } },
      0,
      entry,
    );
    await flush();
    await s.queue.enqueue({ operation: 'delete_item', data: { id } });
    expect(s.queue.getSnapshot().plan.items.some((i) => i.id === id)).toBe(false);
    s.commit(0);
    await flush();
    expect(s.queue.getSnapshot().plan.items.some((i) => i.id === id)).toBe(false);
    expect(s.requests).toHaveLength(2);
    s.commit(1);
    await flush();
    expect(s.server.items.some((i) => i.id === id)).toBe(false);
  });
  it('retains pending operations during a short outage and resumes when online', async () => {
    const s = setup();
    s.queue.setOnline(false);
    await s.queue.enqueue(color(s.server.items[0]!.id, '#73A6DF'));
    await flush();
    expect(s.requests).toHaveLength(0);
    expect(s.queue.getSnapshot().pending).toBe(1);
    s.queue.setOnline(true);
    await flush();
    expect(s.requests).toHaveLength(1);
    s.commit(0);
    await flush();
    expect(s.queue.getSnapshot().pending).toBe(0);
  });
  it('clears pending data on access revocation and refuses later edits', async () => {
    const s = setup();
    await s.queue.enqueue(color(s.server.items[0]!.id, '#73A6DF'));
    await flush();
    s.queue.revoke('Accès révoqué');
    expect(s.queue.getSnapshot().pending).toBe(0);
    expect(s.queue.getSnapshot().revoked).toBe(true);
    expect(s.queue.getSnapshot().plan.items).toEqual([]);
    expect(s.queue.getSnapshot().plan.days).toEqual([]);
    expect((await s.queue.enqueue(color(s.server.items[1]!.id, '#69AA91'))).ok).toBe(false);
  });
  it('sends only explicitly edited fields when a stale form has compatible remote updates', () => {
    const plan = fixture(),
      row = plan.items[0]!;
    expect(
      transportTripChange(plan, {
        operation: 'edit_item',
        data: {
          id: row.id,
          item_version: 0,
          start_time: '11:00',
          end_time: null,
          duration: 60,
          notes: 'Billets',
        },
      }),
    ).toEqual({ operation: 'patch_item', data: { id: row.id, patch: { notes: 'Billets' } } });
  });
});
