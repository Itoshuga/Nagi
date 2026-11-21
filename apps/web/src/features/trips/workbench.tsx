'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useActionState, useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
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
import type { EntryCardRow, TripPlan, TripPlanItem, TripPlanStop } from '@nagi/database';
import { tripSourceEntry } from '@nagi/database/trip-places';
import { tripPlaceReferenceSchema, type TripEdit } from '@nagi/shared';
import { EntryImage } from '@/features/media/image';
import { UserIdentity } from '@/features/profiles/identity';
import { archivePlannedTrip, removeTrip } from './actions';
import { TripItinerary } from './itinerary';
import { TripDragOverlay } from './drag-overlay';
import { TripDayEditor } from './plan-dialogs';
import { TripPlaceDetails } from './step-editor';
import { TripPlacePicker } from './place-picker';
import { ExternalPlacesProvider } from '@/features/integrations/google-places/components';
import { CalendarColorsProvider } from './calendar-colors';
import { useTripMutations } from './use-trip-mutations';
import { TripSaveStatus } from './save-status';
import { useDragPointer } from './drag-pointer';
import {
  unavailableTripEntry,
  type DaySelection,
  type PlaceAdder,
  type SourcePlaceAdder,
  type PlanMutation,
  type WorkspaceViewProps,
} from './planner-model';
import { tripDates, tripStatus } from './trip-list';
import './workspace.css';
import {
  isActivityDrop,
  isStopDrop,
  tripCollision,
  tripDragSource,
  tripDropChange,
} from './planner-dnd';

import {
  catalogPlacement,
  catalogVisitChange,
  sourceVisitChange,
  catalogHintKey,
  isCatalogDrag,
  isCalendarDrop,
  type CatalogEntry,
} from './catalog-drag';

const TripMap = dynamic(() => import('./map'), { ssr: false, loading: () => <LoadingState /> });
const TripCalendar = dynamic(() => import('./calendar').then((m) => m.TripCalendar), {
  loading: () => <LoadingState />,
});
const tabs = [
  { id: 'itinerary', label: 'Itinéraire', icon: Route },
  { id: 'calendar', label: 'Calendrier', icon: CalendarDays },
  { id: 'map', label: 'Carte', icon: MapPin },
] as const;
function DayNav({
  id,
  active,
  label,
  sub,
  count,
  onClick,
  editable,
}: {
  id: string;
  editable: boolean;
  active: boolean;
  label: string;
  sub?: string;
  count: number;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `nav:${id}`,
    data: { day: id === 'pending' ? null : id, before: null },
    disabled: !editable || id === 'all',
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
  plan: initialPlan,
  categories,
  canEdit: initialCanEdit,
  canManage: initialCanManage,
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
  const prefix = useId(),
    reduced = useReducedMotion();
  const [view, setView] = useState(tabs.find((t) => t.id === initialView)?.id ?? 'itinerary');
  const [day, setDay] = useState<DaySelection>(initialDay),
    [organize, setOrganize] = useState(initialMode !== 'read');
  const [sidebar, setSidebar] = useState(true),
    [panel, setPanel] = useState<'catalog' | 'detail' | null>(initialItem ? 'detail' : null);
  const [selectedId, setSelectedId] = useState(initialItem),
    [preview, setPreview] = useState<EntryCardRow>();
  const [previewParent, setPreviewParent] = useState<string>();
  const [previewGoogle, setPreviewGoogle] = useState<string>();
  const previewGooglePlace = useCallback((placeId: string) => {
    setPreview(
      tripSourceEntry({
        id: crypto.randomUUID(),
        source: 'google',
        entry_id: null,
        google_place_id: placeId,
        updated_at: '',
      })!,
    );
    setPreviewGoogle(placeId);
    setSelectedId(undefined);
    setPreviewParent(undefined);
    setPicker(null);
    setPanel('detail');
  }, []);
  const [replacement, setReplacement] = useState<string>();
  const replacePlace = useCallback((id: string) => {
    setReplacement(id);
    setPanel('catalog');
  }, []);
  const [expandedStops, setExpandedStops] = useState<Record<string, boolean>>({});
  const toggleStops = (parent: string) =>
    setExpandedStops((current) => ({ ...current, [parent]: !(current[parent] ?? true) }));
  const [picker, setPicker] = useState<{
    day: string | null;
    time?: string;
    parent?: string;
  } | null>(initialEntry ? { day: null } : null);
  const [deleteOpen, setDeleteOpen] = useState(false),
    [localError, setLocalError] = useState('');
  const [dragged, setDragged] = useState<TripPlanItem | TripPlanStop>();
  const [draggedEntry, setDraggedEntry] = useState<CatalogEntry>();
  const [draggedGoogle, setDraggedGoogle] = useState<string>();
  const dragPointer = useDragPointer(!!draggedEntry);
  const { state: sync, queue } = useTripMutations(
    guild,
    initialPlan,
    viewerId,
    initialCanEdit,
    initialCanManage,
  );
  const plan = sync.plan,
    displayed = plan,
    canEdit = sync.canEdit,
    canManage = sync.canManage,
    busy = false;
  const error = localError || sync.error;
  const setError = (value: string) => {
    setLocalError(value);
    if (!value) queue.clearError();
  };
  const activeDay =
    day === 'all' || day === 'pending' || plan.days.some((d) => d.id === day) ? day : 'all';
  const editing = canEdit && organize,
    path = `/app/${guild}/trips/${plan.id}`;
  const currentItem = displayed.items.find((i) => i.id === selectedId);
  const detailEntry =
    preview ?? currentItem?.entry ?? (currentItem ? unavailableTripEntry(currentItem) : undefined);
  const dragVersion = useRef(plan.version);
  const lastTrigger = useRef<HTMLElement | null>(null),
    panelRef = useRef<HTMLElement>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );
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
  const execute = (change: TripEdit, version?: number, entry?: EntryCardRow) =>
    queue.enqueue(change, version, entry);
  const mutate: PlanMutation = (change, version, context) =>
    queue.enqueue(change, version, undefined, context);
  const add: PlaceAdder = async (entry, targetDay, time, _repeat, parent, placement) => {
    if (replacement) {
      const result = await execute(
        {
          operation: 'replace_place',
          data: { id: replacement, place: { source: 'nagi', entry: entry.id } },
        },
        undefined,
        entry,
      );
      if (result.ok) {
        setSelectedId(
          displayed.items.find((i) => i.stops.some((s) => s.id === replacement))?.id ?? replacement,
        );
        setReplacement(undefined);
        setPanel('detail');
      }
      return result;
    }
    if (!editing) return { ok: false, error: 'Ce voyage n’est pas modifiable.' };
    if (parent && !displayed.items.some((item) => item.id === parent))
      return { ok: false, error: 'Cette activité ne fait plus partie du voyage.' };
    // One intentional gesture creates one identity. The queue retains it through retries.
    const id = crypto.randomUUID();
    const result = await execute(
      catalogVisitChange(entry, { day: targetDay, time, parent, ...placement }, id),
      displayed.version,
      entry,
    );
    return { ...result, ...(result.ok ? { id } : {}) };
  };
  const addSource: SourcePlaceAdder = async (place, placement, metadata) => {
    if (!editing) return { ok: false, error: 'Ce voyage n’est pas modifiable.' };
    const reference = tripPlaceReferenceSchema.safeParse(place);
    if (!reference.success) return { ok: false, error: 'Vérifiez les informations du lieu.' };
    place = reference.data;
    if (replacement) {
      const result = await execute({
        operation: 'replace_place',
        data: { id: replacement, place },
      });
      if (result.ok) {
        setSelectedId(
          displayed.items.find((i) => i.stops.some((s) => s.id === replacement))?.id ?? replacement,
        );
        setReplacement(undefined);
        setPanel('detail');
      }
      return result;
    }
    const id = crypto.randomUUID();
    const parsed = sourceVisitChange(place, placement, id, metadata);
    if (!parsed.success)
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? 'Vérifiez les informations de l’étape.',
      };
    const result = await execute(parsed.data);
    return { ...result, ...(result.ok ? { id } : {}) };
  };
  function openPicker(targetDay: string | null, time?: string) {
    setReplacement(undefined);
    lastTrigger.current = document.activeElement as HTMLElement;
    setPicker({ day: targetDay, time });
  }
  function details(item: TripPlanItem) {
    setPreviewGoogle(undefined);
    setReplacement(undefined);
    lastTrigger.current = document.activeElement as HTMLElement;
    setSelectedId(item.id);
    setPreview(undefined);
    setPreviewParent(undefined);
    setPanel('detail');
  }
  function closePanel() {
    setPreviewGoogle(undefined);
    setReplacement(undefined);
    setPanel(null);
    setPreview(undefined);
    setPreviewParent(undefined);
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
  function openStopPicker(parent: string) {
    if (displayed.stopsAvailable === false) return;
    const item = displayed.items.find((i) => i.id === parent);
    if (!item) return;
    lastTrigger.current = document.activeElement as HTMLElement;
    if (!lastTrigger.current?.closest('.trip-activity-stops'))
      lastTrigger.current =
        document.querySelector<HTMLElement>(`[data-activity-id="${parent}"] .trip-step-main`) ??
        lastTrigger.current;
    setPicker({ day: item.trip_day_id, parent });
  }
  function previewEntry(entry: EntryCardRow, parent?: string) {
    setPreviewGoogle(undefined);
    setPicker(null);
    setPreview(entry);
    setPreviewParent(parent);
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
    onAddStop: openStopPicker,
    expandedStops,
    onToggleStops: toggleStops,
  };
  const organizers = plan.people.filter((p) => plan.organizers.some((o) => o.user_id === p.id));
  if (sync.revoked)
    return (
      <div className="p-6">
        <Alert role="alert">{sync.error}</Alert>
        <Link href="/select-server" className="mt-4 inline-block underline">
          Revenir à mes espaces
        </Link>
      </div>
    );
  return (
    <DndContext
      id={prefix}
      sensors={sensors}
      collisionDetection={tripCollision}
      autoScroll={{ threshold: { x: 0.12, y: 0.12 }, acceleration: 5 }}
      onDragStart={({ active }) => {
        setDraggedGoogle(
          isCatalogDrag(active.data.current) && active.data.current.reference?.source === 'google'
            ? active.data.current.reference.placeId
            : undefined,
        );
        dragVersion.current = displayed.version;
        setDragged(
          active.data.current?.type === 'calendar-item'
            ? undefined
            : tripDragSource(displayed.items, active.data.current, active.id)?.card,
        );
        setDraggedEntry(isCatalogDrag(active.data.current) ? active.data.current.entry : undefined);
      }}
      onDragCancel={() => {
        setDraggedGoogle(undefined);
        setDragged(undefined);
        setDraggedEntry(undefined);
      }}
      onDragEnd={(event) => {
        setDraggedGoogle(undefined);
        const { active, over } = event;
        setDragged(undefined);
        setDraggedEntry(undefined);
        if (!editing) return;
        if (isCatalogDrag(active.data.current)) {
          const point = dragPointer.current;
          const hit = point ? document.elementFromPoint(point.x, point.y) : null;
          if (!hit?.closest('.trip-workspace-canvas,.trip-day-navigation')) return;
          if (isCalendarDrop(over?.data.current) && !hit.closest('.trip-calendar-scroll')) return;
          const placement = catalogPlacement(
            displayed,
            active.data.current,
            event,
            dragPointer.current,
          );
          if (!placement) return;
          active.data.current.onCommit?.();
          const reference = active.data.current.reference;
          const resultPromise = reference
            ? addSource(reference, placement)
            : add(
                active.data.current.entry,
                placement.day,
                placement.time,
                undefined,
                placement.parent,
                placement,
              );
          void resultPromise.then((result) => {
            if (!result.ok) setError(result.error);
            else {
              try {
                localStorage.setItem(catalogHintKey, '1');
              } catch {
                /* Storage can be disabled. */
              }
              window.dispatchEvent(new Event('nagi:catalog-dropped'));
            }
          });
          return;
        }
        if (isCalendarDrop(over?.data.current)) return;
        const target = over?.data.current as Parameters<typeof tripDropChange>[2] | undefined;
        const source = tripDragSource(displayed.items, active.data.current, active.id);
        if (!target || !source) return;
        const result = tripDropChange(displayed.items, source, target);
        if (result.error) setError(result.error);
        else if (result.change) void mutate(result.change, dragVersion.current);
      }}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            'Maintenez une carte pour la glisser. Au clavier, Espace sur la poignée pour saisir, puis les flèches et Espace pour déposer. Les menus permettent aussi de déplacer les étapes et de sortir les arrêts.',
        },
        announcements: {
          onDragStart: ({ active }) =>
            isCatalogDrag(active.data.current)
              ? 'Lieu saisi. Déposez pour créer une visite.'
              : 'Étape saisie.',
          onDragOver: ({ active, over }) =>
            isActivityDrop(over?.data.current) || isStopDrop(over?.data.current)
              ? `Déposer pour ajouter un arrêt dans ${over.data.current.title}.`
              : over
                ? active.data.current?.type === 'stop'
                  ? 'Déposer pour remettre cet arrêt en activité.'
                  : 'Destination disponible.'
                : 'Aucune destination.',
          onDragEnd: ({ over }) =>
            over ? 'Enregistrement du déplacement.' : 'Déplacement annulé.',
          onDragCancel: () => 'Déplacement annulé.',
        },
      }}
    >
      <ExternalPlacesProvider
        guild={guild}
        trip={plan.id}
        onReplace={replacePlace}
        onPreview={previewGooglePlace}
      >
        <CalendarColorsProvider
          guild={guild}
          plan={displayed}
          canEdit={editing}
          busy={busy}
          mutate={mutate}
        >
          <div
            className={cn(
              'trip-workspace',
              !editing && 'is-reading',
              (dragged || draggedEntry) && 'is-sorting',
              draggedEntry && 'is-catalog-dragging',
            )}
          >
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
                  <TripSaveStatus state={sync} onRetry={queue.retry} />
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
                    <PopoverContent
                      className="trip-information"
                      aria-label="Informations du voyage"
                    >
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
                    <button
                      type="button"
                      className="trip-icon-button"
                      aria-label="Actions du voyage"
                    >
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
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={() => setDeleteOpen(true)}
                    >
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
                {sidebar ? (
                  <PanelLeftClose className="size-4" />
                ) : (
                  <PanelLeftOpen className="size-4" />
                )}
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
                    setReplacement(undefined);
                    setPanel(panel === 'catalog' ? null : 'catalog');
                  }}
                >
                  <Compass className="size-4" />
                </button>
                {editing && (
                  <Button
                    className="trip-primary-add"
                    aria-label="Ajouter une étape"
                    size="sm"
                    onClick={() =>
                      openPicker(activeDay === 'all' || activeDay === 'pending' ? null : activeDay)
                    }
                  >
                    <Plus className="size-4" />
                    <span>Ajouter une étape</span>
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
            <div
              className={cn('trip-workspace-body', !sidebar && 'days-hidden', panel && 'has-panel')}
            >
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
                  editable={editing}
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
                      editable={editing}
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
                  editable={editing}
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
                      if (e.key === 'Escape' && !e.defaultPrevented && !dragged && !draggedEntry) {
                        e.preventDefault();
                        closePanel();
                      }
                    }}
                  >
                    {panel === 'catalog' ? (
                      <TripPlacePicker
                        addSource={addSource}
                        key={activeDay}
                        panel
                        guild={guild}
                        plan={displayed}
                        categories={categories}
                        initialDay={
                          activeDay === 'all' || activeDay === 'pending' ? null : activeDay
                        }
                        add={add}
                        mutate={mutate}
                        busy={busy}
                        canAdd={editing}
                        onClose={closePanel}
                        onPreview={previewEntry}
                      />
                    ) : detailEntry ? (
                      <TripPlaceDetails
                        externalPlaceId={preview ? previewGoogle : undefined}
                        addSource={addSource}
                        key={currentItem?.id ?? detailEntry.id}
                        guild={guild}
                        plan={displayed}
                        entry={detailEntry}
                        item={preview ? undefined : currentItem}
                        defaultDay={
                          activeDay === 'all' || activeDay === 'pending' ? null : activeDay
                        }
                        canEdit={editing}
                        busy={busy}
                        mutate={mutate}
                        add={add}
                        onClose={closePanel}
                        onPreview={(entry) =>
                          previewEntry(entry, preview ? previewParent : undefined)
                        }
                        parentId={preview ? previewParent : undefined}
                        onAddStop={openStopPicker}
                        expandedStops={expandedStops}
                        onToggleStops={toggleStops}
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
                addSource={addSource}
                guild={guild}
                plan={displayed}
                categories={categories}
                initialDay={picker.day}
                initialTime={picker.time}
                parentId={picker.parent}
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
                onPreview={(entry) => previewEntry(entry, picker.parent)}
              />
            )}
            {deleteOpen && (
              <DeleteTripDialog
                guild={guild}
                plan={displayed}
                onClose={() => setDeleteOpen(false)}
              />
            )}
          </div>
          <TripDragOverlay
            item={dragged}
            entry={draggedEntry}
            googlePlaceId={draggedGoogle}
            reduced={reduced}
          />
        </CalendarColorsProvider>
      </ExternalPlacesProvider>
    </DndContext>
  );
}
