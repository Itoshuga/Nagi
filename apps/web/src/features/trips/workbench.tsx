'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useId, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
} from '@dnd-kit/core';
import {
  Archive,
  ArrowLeft,
  CalendarDays,
  Compass,
  Eye,
  MapPin,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Route,
  Settings,
  Trash2,
  UsersRound,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  LoadingState,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from '@nagi/ui';
import type { EntryCardRow, TripPlan, TripPlanItem } from '@nagi/database';
import type { TripEdit, TripResult } from '@nagi/shared';
import { EntryImage } from '@/features/media/image';
import { UserIdentity } from '@/features/profiles/identity';
import { archivePlannedTrip, editTrip, removeTrip } from './actions';
import { TripItinerary } from './itinerary';
import { TripDayEditor } from './plan-dialogs';
import { TripPlaceDetails } from './step-editor';
import { TripPlacePicker } from './place-picker';
import { useTripLive } from './live';
import {
  optimisticTripItems,
  unavailableTripEntry,
  type DaySelection,
  type LanePosition,
  type PlaceAdder,
  type PlanMutation,
  type WorkspaceViewProps,
} from './planner-model';
import { tripDates, tripStatus } from './trip-list';
import './workspace.css';

const TripMap = dynamic(() => import('./map'), { ssr: false, loading: () => <LoadingState /> });
const TripCalendar = dynamic(() => import('./calendar').then((m) => m.TripCalendar), {
  loading: () => <LoadingState />,
});
const tabs = [
  { id: 'itinerary', label: 'Itinéraire', icon: Route },
  { id: 'calendar', label: 'Calendrier', icon: CalendarDays },
  { id: 'map', label: 'Carte', icon: MapPin },
] as const;
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length
    ? hits.sort(
        (a, b) =>
          Number(b.id.toString().startsWith('before:')) -
          Number(a.id.toString().startsWith('before:')),
      )
    : args.pointerCoordinates
      ? []
      : rectIntersection(args);
};
function DayNav({
  id,
  active,
  label,
  sub,
  count,
  onClick,
}: {
  id: string;
  active: boolean;
  label: string;
  sub?: string;
  count: number;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `nav:${id}`,
    data: { day: id === 'pending' ? null : id, before: null },
    disabled: id === 'all',
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      aria-current={active ? 'date' : undefined}
      className={cn('trip-day-nav-item', active && 'is-active', isOver && 'is-over')}
      onClick={onClick}
    >
      <span>
        <strong>{label}</strong>
        {sub && <small>{sub}</small>}
      </span>
      <span className="trip-day-count">{count}</span>
    </button>
  );
}
function DeleteTripDialog({
  guild,
  plan,
  onClose,
}: {
  guild: string;
  plan: TripPlan;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(removeTrip.bind(null, guild, plan.id), {
    error: '',
  });
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !pending) onClose();
      }}
    >
      <DialogContent className="trip-compact-dialog" closeDisabled={pending}>
        <DialogTitle>Supprimer ce voyage ?</DialogTitle>
        <DialogDescription>
          Les journées, étapes et notes de « {plan.title} » seront définitivement supprimées.
        </DialogDescription>
        <form action={action}>
          <input type="hidden" name="version" value={plan.version} />
          <input type="hidden" name="confirm" value="yes" />
          {state.error && <Alert role="alert">{state.error}</Alert>}
          <div className="trip-dialog-actions">
            <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? 'Suppression…' : 'Supprimer le voyage'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function TripWorkbench({
  guild,
  plan,
  categories,
  canEdit,
  canManage,
  initialEntry,
  viewerId,
  initialView = 'itinerary',
  initialDay = 'all',
  initialMode = 'organize',
  initialItem,
}: {
  guild: string;
  plan: TripPlan;
  categories: { id: string; name: string }[];
  canEdit: boolean;
  canManage: boolean;
  viewerId: string;
  initialEntry?: EntryCardRow;
  initialView?: string;
  initialDay?: string;
  initialMode?: string;
  initialItem?: string;
}) {
  const router = useRouter(),
    prefix = useId(),
    reduced = useReducedMotion();
  const [view, setView] = useState(tabs.find((t) => t.id === initialView)?.id ?? 'itinerary');
  const [day, setDay] = useState<DaySelection>(initialDay),
    [organize, setOrganize] = useState(initialMode !== 'read');
  const [sidebar, setSidebar] = useState(true),
    [panel, setPanel] = useState<'catalog' | 'detail' | null>(initialItem ? 'detail' : null);
  const [selectedId, setSelectedId] = useState(initialItem),
    [preview, setPreview] = useState<EntryCardRow>();
  const [picker, setPicker] = useState<{ day: string | null; time?: string } | null>(
    initialEntry ? { day: null } : null,
  );
  const [deleteOpen, setDeleteOpen] = useState(false),
    [error, setError] = useState(''),
    [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false),
    [dragged, setDragged] = useState<TripPlanItem>();
  const [draft, setDraft] = useState<{ base: number; version?: number; items: TripPlanItem[] }>();
  const displayed =
    draft &&
    ((draft.version ?? draft.base) > plan.version ||
      (draft.version == null && draft.base === plan.version))
      ? { ...plan, items: draft.items, version: draft.version ?? plan.version }
      : plan;
  const activeDay =
    day === 'all' || day === 'pending' || plan.days.some((d) => d.id === day) ? day : 'all';
  const editing = canEdit && organize,
    path = `/app/${guild}/trips/${plan.id}`;
  const currentItem = displayed.items.find((i) => i.id === selectedId);
  const detailEntry =
    preview ?? currentItem?.entry ?? (currentItem ? unavailableTripEntry(currentItem) : undefined);
  const inFlight = useRef(false),
    dragVersion = useRef(plan.version),
    addReceipt = useRef<{ key: string; id: string } | null>(null);
  const lastTrigger = useRef<HTMLElement | null>(null),
    panelRef = useRef<HTMLElement>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  useTripLive(guild, plan.id, plan.version);
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('vue', view);
    url.searchParams.set('jour', activeDay);
    url.searchParams.set('mode', organize ? 'organize' : 'read');
    if (selectedId) url.searchParams.set('etape', selectedId);
    else url.searchParams.delete('etape');
    window.history.replaceState(null, '', url);
  }, [view, activeDay, organize, selectedId]);
  useEffect(() => {
    if (panel) panelRef.current?.focus();
  }, [panel]);
  useEffect(() => {
    document
      .querySelector('.trip-day-nav-item.is-active')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeDay]);
  async function execute(
    change: TripEdit,
    version = displayed.version,
    entry?: EntryCardRow,
  ): Promise<TripResult> {
    if (inFlight.current) return { ok: false, error: 'Une modification est en cours.' };
    inFlight.current = true;
    setBusy(true);
    setFeedback('Enregistrement…');
    setError('');
    let items = optimisticTripItems(displayed.items, change);
    if (change.operation === 'add_item' && entry) {
      const now = new Date().toISOString();
      items = [
        ...items,
        {
          id: change.data.id,
          trip_id: plan.id,
          trip_day_id: change.data.day,
          entry_id: entry.id,
          entry,
          added_by: viewerId,
          notes: '',
          sort_order: 0,
          start_time: change.data.start_time ?? null,
          end_time: null,
          estimated_duration_minutes: change.data.duration ?? null,
          version: 0,
          created_at: now,
          updated_at: now,
        },
      ];
    }
    setDraft({ base: plan.version, items });
    try {
      const result = await editTrip(guild, plan.id, version, change);
      if (result.ok) {
        setDraft({ base: plan.version, version: result.version, items });
        setFeedback('Modifications enregistrées');
      } else {
        setDraft(undefined);
        setFeedback('');
        setError(result.error);
        if (result.reason === 'conflict') router.refresh();
      }
      return result;
    } catch {
      setDraft(undefined);
      setFeedback('');
      const result: TripResult = {
        ok: false,
        error: 'Impossible d’enregistrer la modification. Réessayez.',
      };
      setError(result.error);
      return result;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const mutate: PlanMutation = execute;
  const add: PlaceAdder = async (entry, targetDay, time, repeat = false) => {
    const key = `${entry.id}:${targetDay ?? ''}:${time ?? ''}:${repeat}`;
    const id = addReceipt.current?.key === key ? addReceipt.current.id : crypto.randomUUID();
    addReceipt.current = { key, id };
    const result = await execute(
      {
        operation: 'add_item',
        data: {
          id,
          entry: entry.id,
          day: targetDay,
          repeat,
          start_time: time ?? null,
          duration: null,
        },
      },
      displayed.version,
      entry,
    );
    if (result.ok) addReceipt.current = null;
    return { ...result, ...(result.ok ? { id } : {}) };
  };
  function openPicker(targetDay: string | null, time?: string) {
    lastTrigger.current = document.activeElement as HTMLElement;
    setPicker({ day: targetDay, time });
  }
  function details(item: TripPlanItem) {
    lastTrigger.current = document.activeElement as HTMLElement;
    setSelectedId(item.id);
    setPreview(undefined);
    setPanel('detail');
  }
  function closePanel() {
    setPanel(null);
    setPreview(undefined);
    setSelectedId(undefined);
    returnFocus();
  }
  function chooseDay(next: DaySelection) {
    setDay(next);
    if (
      currentItem &&
      next !== 'all' &&
      currentItem.trip_day_id !== (next === 'pending' ? null : next)
    ) {
      setSelectedId(undefined);
      if (panel === 'detail') {
        setPanel(null);
        setPreview(undefined);
      }
    }
  }
  function returnFocus() {
    const target = lastTrigger.current?.isConnected
      ? lastTrigger.current
      : document.querySelector<HTMLElement>('.trip-primary-add, .trip-day-nav-item.is-active');
    target?.focus();
  }
  function previewEntry(entry: EntryCardRow) {
    setPicker(null);
    setPreview(entry);
    setSelectedId(undefined);
    setPanel('detail');
  }
  const props: WorkspaceViewProps = {
    guild,
    plan: displayed,
    canEdit: editing,
    busy,
    mutate,
    selectedDay: activeDay,
    selectedItem: selectedId,
    onDay: chooseDay,
    onItinerary: () => setView('itinerary'),
    onDetails: details,
    onAdd: openPicker,
  };
  const organizers = plan.people.filter((p) => plan.organizers.some((o) => o.user_id === p.id));
  return (
    <DndContext
      id={prefix}
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={({ active }) => {
        dragVersion.current = displayed.version;
        setDragged(displayed.items.find((i) => i.id === active.id));
      }}
      onDragCancel={() => setDragged(undefined)}
      onDragEnd={({ active, over }) => {
        setDragged(undefined);
        const target = over?.data.current as LanePosition | undefined;
        if (target && target.before !== active.id)
          void mutate(
            { operation: 'move_item', data: { id: String(active.id), ...target } },
            dragVersion.current,
          );
      }}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Espace pour saisir. Utilisez les flèches ou le menu de l’étape pour déplacer et réorganiser.',
        },
        announcements: {
          onDragStart: () => 'Étape saisie.',
          onDragOver: ({ over }) => (over ? 'Destination disponible.' : 'Aucune destination.'),
          onDragEnd: ({ over }) =>
            over ? 'Enregistrement du déplacement.' : 'Déplacement annulé.',
          onDragCancel: () => 'Déplacement annulé.',
        },
      }}
    >
      <div className={cn('trip-workspace', !editing && 'is-reading', dragged && 'is-sorting')}>
        <header className="trip-workspace-header">
          <Link
            href={`/app/${guild}/trips`}
            className="trip-icon-button trip-back"
            aria-label="Tous les voyages"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <EntryImage
            src={
              plan.cover_image_url ??
              (plan.destination?.is_published ? plan.destination.cover_image_url : null)
            }
            className="trip-cover-thumb"
            sizes="72px"
            eager
          />
          <div className="trip-heading-copy">
            <div>
              <h1>{plan.title}</h1>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="trip-status"
                    aria-label={`Informations du voyage · ${tripStatus[plan.status]}`}
                  >
                    {tripStatus[plan.status]}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="trip-information" aria-label="Informations du voyage">
                  <h2 className="text-sm font-bold">À propos du voyage</h2>
                  {plan.description && (
                    <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">
                      {plan.description}
                    </p>
                  )}
                  <p className="mt-3 text-xs">{tripDates(plan)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Horaires locaux · {plan.timezone}
                  </p>
                  {organizers.length > 0 && (
                    <div className="mt-4 grid gap-2">
                      <p className="text-[10px] text-muted-foreground">Organisateurs</p>
                      {organizers.map((person) => (
                        <UserIdentity key={person.id} user={person} compact />
                      ))}
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            <p>
              {[plan.destination?.is_published ? plan.destination.name : null, tripDates(plan)]
                .filter(Boolean)
                .join(' · ')}
            </p>
            <small>
              {plan.collaboration_mode === 'all_members'
                ? 'Voyage collaboratif'
                : 'Organisation réservée aux organisateurs'}
            </small>
          </div>
          {organizers.length > 0 && (
            <div className="trip-organizer-avatars" aria-label="Organisateurs du voyage">
              {organizers.slice(0, 4).map((person) => (
                <UserIdentity
                  key={person.id}
                  user={person}
                  compact
                  className="trip-organizer-avatar"
                />
              ))}
            </div>
          )}
          {canManage && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="trip-icon-button" aria-label="Actions du voyage">
                  <MoreHorizontal className="size-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem asChild>
                  <Link href={`${path}/settings`}>
                    <Settings className="size-4" /> Modifier le voyage
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`${path}/settings#trip-cover`}>Personnaliser la couverture</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`${path}/settings#trip-organizers`}>
                    <UsersRound className="size-4" /> Gérer les permissions
                  </Link>
                </DropdownMenuItem>
                {plan.status !== 'archived' && (
                  <DropdownMenuItem
                    disabled={busy}
                    onSelect={async () => {
                      const r = await archivePlannedTrip(guild, plan.id, displayed.version);
                      if (!r.ok) setError(r.error);
                    }}
                  >
                    <Archive className="size-4" /> Archiver
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="text-destructive" onSelect={() => setDeleteOpen(true)}>
                  <Trash2 className="size-4" /> Supprimer le voyage
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>
        <div className="trip-workspace-toolbar">
          <button
            type="button"
            className="trip-icon-button trip-toggle-days"
            aria-label={sidebar ? 'Masquer les journées' : 'Afficher les journées'}
            aria-expanded={sidebar}
            onClick={() => setSidebar((v) => !v)}
          >
            {sidebar ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
          </button>
          <div role="tablist" aria-label="Vues du voyage" className="trip-view-tabs">
            {tabs.map(({ id, label, icon: Icon }, index) => (
              <button
                key={id}
                role="tab"
                id={`${prefix}-${id}`}
                type="button"
                aria-selected={view === id}
                aria-controls={`${prefix}-view`}
                tabIndex={view === id ? 0 : -1}
                onClick={() => setView(id)}
                onKeyDown={(e) => {
                  const next =
                    e.key === 'ArrowRight'
                      ? (index + 1) % 3
                      : e.key === 'ArrowLeft'
                        ? (index + 2) % 3
                        : e.key === 'Home'
                          ? 0
                          : e.key === 'End'
                            ? 2
                            : -1;
                  if (next >= 0) {
                    e.preventDefault();
                    setView(tabs[next]!.id);
                    document.getElementById(`${prefix}-${tabs[next]!.id}`)?.focus();
                  }
                }}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>
          <span role="status" aria-live="polite" className="trip-save-status">
            {feedback}
          </span>
          <div className="trip-toolbar-actions">
            {canEdit && (
              <button
                type="button"
                className="trip-mode-toggle"
                aria-label={organize ? 'Consulter' : 'Organiser'}
                aria-pressed={!organize}
                onClick={() => setOrganize((v) => !v)}
              >
                {organize ? <Eye className="size-3.5" /> : <Pencil className="size-3.5" />}
                <span>{organize ? 'Consulter' : 'Organiser'}</span>
              </button>
            )}
            <button
              type="button"
              className="trip-icon-button"
              aria-label="Explorer le catalogue"
              aria-expanded={panel === 'catalog'}
              onClick={() => {
                lastTrigger.current = document.activeElement as HTMLElement;
                setPanel(panel === 'catalog' ? null : 'catalog');
              }}
            >
              <Compass className="size-4" />
            </button>
            {editing && (
              <Button
                className="trip-primary-add"
                aria-label="Ajouter un lieu"
                size="sm"
                onClick={() =>
                  openPicker(activeDay === 'all' || activeDay === 'pending' ? null : activeDay)
                }
              >
                <Plus className="size-4" />
                <span>Ajouter un lieu</span>
              </Button>
            )}
          </div>
        </div>
        {error && (
          <div className="trip-workspace-error" role="alert">
            <span>{error}</span>
            <button type="button" aria-label="Fermer le message" onClick={() => setError('')}>
              <X className="size-4" />
            </button>
          </div>
        )}
        <div className={cn('trip-workspace-body', !sidebar && 'days-hidden', panel && 'has-panel')}>
          <nav className="trip-day-navigation" aria-label="Journées du voyage">
            <div className="trip-days-top">
              <span>Votre séjour</span>
              {editing && (
                <TripDayEditor plan={displayed} mutate={mutate}>
                  <button
                    type="button"
                    className="trip-icon-button"
                    aria-label="Ajouter une journée"
                    disabled={busy}
                  >
                    <Plus className="size-3.5" />
                  </button>
                </TripDayEditor>
              )}
            </div>
            <DayNav
              id="all"
              active={activeDay === 'all'}
              label="Tout le voyage"
              count={displayed.items.length}
              onClick={() => chooseDay('all')}
            />
            <div className="trip-day-links">
              {plan.days.map((d, i) => (
                <DayNav
                  key={d.id}
                  id={d.id}
                  active={activeDay === d.id}
                  label={`Jour ${i + 1}`}
                  sub={[
                    d.date
                      ? new Intl.DateTimeFormat('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          timeZone: 'UTC',
                        }).format(new Date(`${d.date}T12:00:00Z`))
                      : null,
                    d.title,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  count={displayed.items.filter((item) => item.trip_day_id === d.id).length}
                  onClick={() => chooseDay(d.id)}
                />
              ))}
            </div>
            <DayNav
              id="pending"
              active={activeDay === 'pending'}
              label="À organiser"
              count={displayed.items.filter((i) => !i.trip_day_id).length}
              onClick={() => chooseDay('pending')}
            />
            <p className="trip-timezone">
              Horaires locaux
              <br />
              {plan.timezone}
            </p>
          </nav>
          <motion.section
            key={view}
            id={`${prefix}-view`}
            role="tabpanel"
            aria-labelledby={`${prefix}-${view}`}
            aria-busy={busy}
            className="trip-workspace-canvas"
            initial={reduced ? false : { opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduced ? 0 : 0.14 }}
          >
            {view === 'itinerary' && <TripItinerary {...props} />}
            {view === 'calendar' && <TripCalendar {...props} />}
            {view === 'map' && <TripMap {...props} onPreview={previewEntry} add={add} />}
          </motion.section>
          <AnimatePresence initial={false}>
            {panel && (
              <motion.aside
                ref={panelRef}
                tabIndex={-1}
                className="trip-context-panel"
                aria-label={panel === 'catalog' ? 'Catalogue du voyage' : 'Détails de l’étape'}
                initial={reduced ? false : { opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: reduced ? 0 : 8 }}
                transition={{ duration: reduced ? 0 : 0.15 }}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Tab' &&
                    matchMedia('(max-width: 1023px)').matches &&
                    e.currentTarget.contains(e.target as Node)
                  ) {
                    const controls = [
                      ...e.currentTarget.querySelectorAll<HTMLElement>(
                        'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
                      ),
                    ].filter((el) => el.getClientRects().length);
                    const first = controls[0],
                      last = controls.at(-1);
                    if (e.shiftKey && (e.target === first || e.target === e.currentTarget)) {
                      e.preventDefault();
                      last?.focus();
                    } else if (!e.shiftKey && e.target === last) {
                      e.preventDefault();
                      first?.focus();
                    }
                  }
                  if (e.key === 'Escape' && !e.defaultPrevented) {
                    e.preventDefault();
                    closePanel();
                  }
                }}
              >
                {panel === 'catalog' ? (
                  <TripPlacePicker
                    key={activeDay}
                    panel
                    guild={guild}
                    plan={displayed}
                    categories={categories}
                    initialDay={activeDay === 'all' || activeDay === 'pending' ? null : activeDay}
                    add={add}
                    mutate={mutate}
                    busy={busy}
                    canAdd={editing}
                    onClose={closePanel}
                    onPreview={previewEntry}
                  />
                ) : detailEntry ? (
                  <TripPlaceDetails
                    key={currentItem?.id ?? detailEntry.id}
                    guild={guild}
                    plan={displayed}
                    entry={detailEntry}
                    item={preview ? undefined : currentItem}
                    defaultDay={activeDay === 'all' || activeDay === 'pending' ? null : activeDay}
                    canEdit={editing}
                    busy={busy}
                    mutate={mutate}
                    add={add}
                    onClose={closePanel}
                    onPreview={previewEntry}
                  />
                ) : (
                  <div className="p-5">
                    <button type="button" onClick={closePanel}>
                      Fermer
                    </button>
                    <p>Cette étape n’est plus disponible.</p>
                  </div>
                )}
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
        {picker && editing && (
          <TripPlacePicker
            guild={guild}
            plan={displayed}
            categories={categories}
            initialDay={picker.day}
            initialTime={picker.time}
            initialEntry={initialEntry}
            add={add}
            mutate={mutate}
            busy={busy}
            onClose={() => {
              setPicker(null);
              requestAnimationFrame(returnFocus);
              if (initialEntry) {
                const url = new URL(window.location.href);
                url.searchParams.delete('ajouter');
                window.history.replaceState(null, '', url);
              }
            }}
            onPreview={previewEntry}
          />
        )}
        {deleteOpen && (
          <DeleteTripDialog guild={guild} plan={displayed} onClose={() => setDeleteOpen(false)} />
        )}
      </div>
      <DragOverlay dropAnimation={reduced ? null : { duration: 150, easing: 'ease-out' }}>
        {dragged && (
          <div className="trip-drag-preview">
            <EntryImage
              src={dragged.entry?.cover_image_url}
              className="size-10 shrink-0 rounded-lg"
              sizes="40px"
            />
            <span>{dragged.entry?.title ?? 'Étape'}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
