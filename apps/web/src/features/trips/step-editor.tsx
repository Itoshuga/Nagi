'use client';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Check, Clock3, Trash2, X } from 'lucide-react';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@nagi/ui';
import type {
  CatalogEntryDetail,
  CatalogRelation,
  CategoryField,
  EntryCardRow,
  TripPlan,
  TripPlanItem,
} from '@nagi/database';
import {
  catalogButtonsValue,
  formatTripDuration,
  formatTripTime,
  safeCatalogUrl,
} from '@nagi/shared';
import { CatalogTextarea } from '@/features/catalog/admin-form';
import { EntryImage } from '@/features/media/image';
import { EntryRichText } from '@/features/entries/rich-text';
import { entryHref } from '@/features/entries/links';
import { UserIdentity } from '@/features/profiles/identity';
import { TripDaySelect } from './add-place-dialog';
import { ActivityStops } from './activity-stops';
import { CalendarColorAction } from './calendar-colors';
import {
  itemDuration,
  minuteTime,
  timeMinutes,
  type PlaceAdder,
  type PlanMutation,
  type TripDetailEntry,
} from './planner-model';

export function QuickStepEditor({
  item,
  plan,
  mutate,
  busy,
  children,
  showDuration = false,
}: {
  item: TripPlanItem;
  plan: TripPlan;
  mutate: PlanMutation;
  busy: boolean;
  children?: ReactNode;
  showDuration?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState('');
  const [base, setBase] = useState({ trip: plan.version, item: item.version });
  const [day, setDay] = useState(item.trip_day_id ?? '');
  const [duration, setDuration] = useState(String(itemDuration(item) ?? ''));
  const id = useId();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget),
      start = String(data.get('start')) || null;
    const duration = Number(data.get('duration')) || null;
    const end =
      start && duration && timeMinutes(start) + duration < 1440
        ? minuteTime(timeMinutes(start) + duration)
        : null;
    const result = await mutate(
      {
        operation: 'schedule_item',
        data: {
          id: item.id,
          item_version: base.item,
          day: String(data.get('day')) || null,
          start_time: start,
          end_time: end,
          duration,
        },
      },
      base.trip,
    );
    if (result.ok) {
      setOpen(false);
      setError('');
    } else setError(result.error);
  }
  return (
    <Popover
      modal
      open={open}
      onOpenChange={(v) => {
        if (busy) return;
        setOpen(v);
        setError('');
        if (v) {
          setBase({ trip: plan.version, item: item.version });
          setDay(item.trip_day_id ?? '');
          setDuration(String(itemDuration(item) ?? ''));
        }
      }}
    >
      <PopoverTrigger asChild>
        {children ?? (
          <button
            type="button"
            className={`trip-time-button${showDuration ? ' trip-time-stack' : ''}`}
            aria-label={`Définir l’horaire de ${item.entry?.title ?? 'l’étape'}`}
          >
            <span>
              {formatTripTime(item.start_time) ?? (
                <span className="trip-time-unset">Définir un horaire</span>
              )}
            </span>
            {showDuration && itemDuration(item) != null && (
              <small>{formatTripDuration(itemDuration(item))}</small>
            )}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="trip-quick-editor"
        aria-label="Planifier l’étape"
        onEscapeKeyDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!busy) setOpen(false);
        }}
        onInteractOutside={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <form onSubmit={submit}>
          <fieldset disabled={busy} className="space-y-3">
            <p className="text-sm font-bold">Planifier l’étape</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor={`${id}-time`}>Début</Label>
                <Input
                  id={`${id}-time`}
                  name="start"
                  type="time"
                  defaultValue={item.start_time?.slice(0, 5)}
                />
              </div>
              <div>
                <Label htmlFor={`${id}-duration`}>Durée (min)</Label>
                <Input
                  id={`${id}-duration`}
                  name="duration"
                  type="number"
                  min={1}
                  max={1440}
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                />
                {Number(duration) >= 60 && (
                  <p className="trip-duration-preview">{formatTripDuration(Number(duration))}</p>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor={`${id}-day`}>Journée</Label>
              <TripDaySelect id={`${id}-day`} days={plan.days} value={day} onChange={setDay} />
            </div>
            {error && <Alert role="alert">{error}</Alert>}
            <Button type="submit" size="sm">
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </fieldset>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export type PlaceDetailData = {
  entry: CatalogEntryDetail;
  fields: CategoryField[];
  relations: CatalogRelation[];
};
export function TripPlaceDetails({
  guild,
  plan,
  entry,
  item,
  canEdit,
  busy,
  mutate,
  add,
  onClose,
  onPreview,
  defaultDay = null,
  parentId,
  onAddStop,
  expandedStops,
  onToggleStops,
}: {
  guild: string;
  plan: TripPlan;
  entry: TripDetailEntry;
  item?: TripPlanItem;
  canEdit: boolean;
  busy: boolean;
  mutate: PlanMutation;
  add: PlaceAdder;
  onClose: () => void;
  onPreview: (entry: EntryCardRow) => void;
  defaultDay?: string | null;
  parentId?: string;
  onAddStop?: (parent: string) => void;
  expandedStops?: Readonly<Record<string, boolean>>;
  onToggleStops?: (parent: string) => void;
}) {
  const [detail, setDetail] = useState<PlaceDetailData>(),
    [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [confirm, setConfirm] = useState(false),
    [saved, setSaved] = useState(false),
    [retry, setRetry] = useState(0);
  const notes = useRef<HTMLTextAreaElement>(null),
    id = useId();
  const base = useRef({ trip: plan.version, item: item?.version });
  const dirtyNotes = useRef(false);
  const originalNotes = useRef(item?.notes ?? '');
  const latestNotes = item?.notes,
    latestVersion = item?.version;
  useEffect(() => {
    if (latestVersion === undefined) return;
    if (!dirtyNotes.current || latestNotes === originalNotes.current) {
      base.current = { trip: plan.version, item: latestVersion };
      if (!dirtyNotes.current) {
        originalNotes.current = latestNotes ?? '';
        if (notes.current) notes.current.value = latestNotes ?? '';
      }
    }
  }, [plan.version, latestNotes, latestVersion]);
  const parent = plan.items.find((activity) => activity.id === parentId);
  const targetDay = item ? item.trip_day_id : parentId ? (parent?.trip_day_id ?? null) : defaultDay;
  const fullEntry =
    entry.country && entry.city && entry.category
      ? {
          ...entry,
          country: entry.country,
          city: entry.city,
          category: entry.category,
        }
      : undefined;
  const [added, setAdded] = useState(false);
  const present = (id: string) =>
    parentId
      ? !!parent?.stops.some((stop) => stop.entry_id === id)
      : plan.items.some((i) => i.entry_id === id && i.trip_day_id === targetDay);
  async function addEntry(place: EntryCardRow) {
    const result = await add(place, targetDay, undefined, present(place.id), parentId);
    if (result.ok) {
      setError('');
      setAdded(true);
    } else setError(result.error);
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/app/${guild}/trips/${plan.id}/places?mode=detail&entry=${entry.id}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (r) => {
        if (!r.ok) throw new Error('detail');
        return r.json();
      })
      .then((data: PlaceDetailData) => {
        if (!controller.signal.aborted) {
          setDetail(data);
          setLoadError('');
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setLoadError('Les informations du lieu sont indisponibles.');
      });
    return () => controller.abort();
  }, [guild, plan.id, entry.id, retry]);
  const person = plan.people.find((p) => p.id === item?.added_by);
  const custom = detail?.entry.custom_values;
  return (
    <>
      <div className="trip-panel-heading">
        <button
          type="button"
          className="trip-icon-button"
          onClick={onClose}
          aria-label="Fermer les détails"
        >
          <X className="size-4" />
        </button>
        <h2>Détails du lieu</h2>
      </div>
      <div className="trip-detail-content">
        <EntryImage
          src={entry.cover_image_url}
          className="trip-detail-photo"
          sizes="(max-width: 639px) 100vw, 380px"
        />
        <div>
          <p className="trip-detail-category">{entry.category?.name}</p>
          <h3>{entry.title}</h3>
          <p className="trip-detail-location">
            {[entry.neighborhood?.name, entry.city?.name, entry.country?.name]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {canEdit && item && (
          <QuickStepEditor item={item} plan={plan} busy={busy} mutate={mutate}>
            <button type="button" className="trip-detail-schedule">
              <Clock3 className="size-4" />
              <span>
                {formatTripTime(item.start_time) ?? 'Définir un horaire'}
                {itemDuration(item) ? ` · ${formatTripDuration(itemDuration(item))}` : ''}
              </span>
              <ArrowLeft className="size-3 rotate-180" />
            </button>
          </QuickStepEditor>
        )}
        {!canEdit && item && (
          <p className="text-sm">
            {formatTripTime(item.start_time) ?? 'Horaire libre'}
            {itemDuration(item) ? ` · ${formatTripDuration(itemDuration(item))}` : ''}
          </p>
        )}
        {canEdit && item && <CalendarColorAction item={item} />}
        {parentId && (
          <p className="trip-stop-help">Ajout dans {parent?.entry?.title ?? 'cette activité'}.</p>
        )}
        {item && (
          <ActivityStops
            item={item}
            plan={plan}
            canEdit={canEdit}
            busy={busy}
            mutate={mutate}
            onAdd={onAddStop ? () => onAddStop(item.id) : undefined}
            always
            expanded={expandedStops?.[item.id]}
            onExpandedChange={onToggleStops ? () => onToggleStops(item.id) : undefined}
          />
        )}
        {item && (
          <section className="trip-detail-section">
            <h4>Notes du voyage</h4>
            {canEdit ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const expectedItemVersion = base.current.item!;
                  const result = await mutate(
                    {
                      operation: 'edit_item',
                      data: {
                        id: item.id,
                        item_version: base.current.item!,
                        start_time: item.start_time?.slice(0, 5) ?? null,
                        end_time: item.end_time?.slice(0, 5) ?? null,
                        duration: item.estimated_duration_minutes,
                        notes: notes.current?.value ?? '',
                      },
                    },
                    base.current.trip,
                  );
                  if (result.ok) {
                    setSaved(true);
                    setError('');
                    dirtyNotes.current = false;
                    originalNotes.current = notes.current?.value ?? '';
                    base.current = { trip: result.version, item: expectedItemVersion + 1 };
                  } else setError(result.error);
                }}
              >
                <Label htmlFor={id} className="sr-only">
                  Notes du voyage
                </Label>
                <CatalogTextarea
                  ref={notes}
                  id={id}
                  defaultValue={item.notes}
                  maxLength={4000}
                  placeholder="Billets, accès, idées à garder…"
                  onFocus={() => {
                    if (!dirtyNotes.current)
                      base.current = { trip: plan.version, item: item.version };
                  }}
                  onChange={() => {
                    setSaved(false);
                    dirtyNotes.current = true;
                  }}
                />
                <div className="mt-2 flex items-center gap-2">
                  <Button type="submit" size="sm" variant="secondary" disabled={busy}>
                    Enregistrer les notes
                  </Button>
                  {saved && (
                    <span role="status" className="text-xs text-muted-foreground">
                      <Check className="inline size-3" /> Enregistrées
                    </span>
                  )}
                </div>
              </form>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {item.notes || 'Aucune note pour cette étape.'}
              </p>
            )}
          </section>
        )}
        {entry.summary && (
          <p className="text-sm leading-relaxed text-muted-foreground">{entry.summary}</p>
        )}
        {detail?.entry.description && (
          <section className="trip-detail-section">
            <h4>À propos</h4>
            <EntryRichText text={detail.entry.description} />
          </section>
        )}
        {detail && (
          <dl className="trip-detail-facts">
            {detail.fields.map((field) => {
              const value =
                custom && typeof custom === 'object' && !Array.isArray(custom)
                  ? custom[field.id]
                  : undefined;
              if (field.type === 'buttons') {
                const parsed = catalogButtonsValue.safeParse(value);
                return parsed.success && parsed.data.length ? (
                  <div key={field.id}>
                    <dt>{field.label}</dt>
                    <dd className="flex flex-wrap gap-2">
                      {parsed.data.map((button, i) => (
                        <a
                          className="trip-full-entry"
                          key={i}
                          href={button.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {button.label}
                          <ArrowUpRight className="size-3" />
                        </a>
                      ))}
                    </dd>
                  </div>
                ) : null;
              }
              if (value == null || (typeof value === 'object' && !Array.isArray(value)))
                return null;
              const url =
                field.type === 'url' && typeof value === 'string' ? safeCatalogUrl(value) : null;
              return (
                <div key={field.id}>
                  <dt>{field.label}</dt>
                  <dd>
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer">
                        {String(value)}
                      </a>
                    ) : typeof value === 'boolean' ? (
                      value ? (
                        'Oui'
                      ) : (
                        'Non'
                      )
                    ) : Array.isArray(value) ? (
                      value.join(' · ')
                    ) : (
                      String(value)
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
        {entry.latitude != null && entry.longitude != null && (
          <p className="text-xs tabular-nums text-muted-foreground">
            {entry.latitude.toFixed(5)} · {entry.longitude.toFixed(5)}
          </p>
        )}
        {detail?.relations.length ? (
          <section className="trip-detail-section">
            <h4>À découvrir avec ce lieu</h4>
            <ul className="trip-related-list">
              {detail.relations.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => onPreview(r.entry)}>
                    <EntryImage
                      src={r.entry.cover_image_url}
                      className="size-10 shrink-0 rounded-lg"
                      sizes="40px"
                    />
                    <span>
                      <small>{r.label}</small>
                      <strong>{r.entry.title}</strong>
                    </span>
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      className="trip-small-action"
                      disabled={busy}
                      onClick={() => void addEntry(r.entry)}
                    >
                      {present(r.entry.id) ? 'Revisiter' : 'Ajouter'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {person && (
          <div className="trip-detail-author">
            <span>Ajouté par</span>
            <UserIdentity user={person} compact />
          </div>
        )}
        {entry.published && (
          <Link href={entryHref(guild, entry)} className="trip-full-entry">
            Consulter la fiche complète <ArrowUpRight className="size-3.5" />
          </Link>
        )}
        {!item && canEdit && fullEntry && (
          <Button disabled={busy} onClick={() => void addEntry(fullEntry)}>
            {present(entry.id)
              ? 'Ajouter une autre visite'
              : parentId
                ? 'Ajouter un arrêt'
                : 'Ajouter une étape'}
          </Button>
        )}
        {added && (
          <p role="status" className="text-xs text-muted-foreground">
            {parentId ? 'Arrêt ajouté à cette activité.' : 'Lieu ajouté au voyage.'}
          </p>
        )}
        {item && canEdit && (
          <button
            type="button"
            className="trip-remove-link"
            disabled={busy}
            onClick={() => setConfirm(true)}
          >
            <Trash2 className="size-3.5" /> Retirer du voyage
          </button>
        )}
        {(error || loadError) && (
          <Alert role="alert">
            {error || loadError}
            {loadError && !detail && (
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => setRetry((v) => v + 1)}
              >
                Réessayer
              </button>
            )}
          </Alert>
        )}
      </div>
      <Dialog
        open={confirm}
        onOpenChange={(v) => {
          if (!busy) setConfirm(v);
        }}
      >
        <DialogContent className="trip-compact-dialog" closeDisabled={busy}>
          <DialogTitle>Retirer cette étape ?</DialogTitle>
          <DialogDescription>
            Les notes et horaires de cette visite seront retirés du voyage.
            {!!item?.stops.length &&
              (item.stops.length === 1
                ? ' Son arrêt et ses notes seront également retirés.'
                : ` Ses ${item.stops.length} arrêts et leurs notes seront également retirés.`)}
          </DialogDescription>
          <div className="trip-dialog-actions">
            <Button variant="ghost" disabled={busy} onClick={() => setConfirm(false)}>
              Annuler
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                if (!item) return;
                const r = await mutate({ operation: 'delete_item', data: { id: item.id } });
                if (r.ok) onClose();
                else setError(r.error);
              }}
            >
              Retirer
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
