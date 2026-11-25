'use client';

import {
  ExternalPlaceView,
  useExternalPlaces,
  usePlacePresentation,
} from '@/features/integrations/mapbox/components';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Clock3, Trash2, X } from 'lucide-react';
import { Alert, Button, Input, Label, Popover, PopoverContent, PopoverTrigger } from '@nagi/ui';
import type {
  CatalogEntryDetail,
  CatalogRelation,
  CategoryField,
  EntryCardRow,
  TripPlan,
  TripPlanItem,
  TripPlanStop,
} from '@nagi/database';
import {
  catalogButtonsValue,
  formatTripDuration,
  formatTripTime,
  safeCatalogUrl,
} from '@nagi/shared';
import { CatalogTextarea } from '@/features/catalog/admin-form';
import { EntryImage } from '@/features/media/image';
import { PlaceImage } from '@/features/integrations/mapbox/place-image';
import { ImagePicker } from '@/features/images/components';
import { EntryRichText } from '@/features/entries/rich-text';
import { entryHref } from '@/features/entries/links';
import { UserIdentity } from '@/features/profiles/identity';
import { TripDaySelect } from './add-place-dialog';
import { ActivityStops, StopTiming } from './activity-stops';
import { RemoveTripStepDialog } from './remove-step-dialog';
import { CalendarColorAction } from './calendar-colors';
import { CustomPlaceEditor } from './source-places';
import {
  itemDuration,
  activityStops,
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
  const [base, setBase] = useState({ trip: plan.version, item: item.version, snapshot: item });
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
      { item: base.snapshot },
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
          setBase({ trip: plan.version, item: item.version, snapshot: item });
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

function ReplaceExternalPlace({ id }: { id: string }) {
  const external = useExternalPlaces();
  return external?.replace ? (
    <button type="button" className="trip-remove-link" onClick={() => external.replace?.(id)}>
      Remplacer le lieu associé
    </button>
  ) : null;
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
  stop,
  canEdit,
  busy,
  mutate,
  add,
  onClose,
  onPreview,
  defaultDay = null,
  parentId,
  onAddStop,
  onStopDetails,
  selectedStop,
  expandedStops,
  onToggleStops,
  externalPlaceId,
  externalQuery,
  addSource,
}: {
  guild: string;
  plan: TripPlan;
  entry: TripDetailEntry;
  item?: TripPlanItem;
  stop?: TripPlanStop;
  canEdit: boolean;
  busy: boolean;
  mutate: PlanMutation;
  add: PlaceAdder;
  onClose: () => void;
  onPreview: (entry: EntryCardRow) => void;
  defaultDay?: string | null;
  parentId?: string;
  onAddStop?: (parent: string) => void;
  onStopDetails?: (stop: TripPlanStop) => void;
  selectedStop?: string;
  expandedStops?: Readonly<Record<string, boolean>>;
  onToggleStops?: (parent: string) => void;
  externalPlaceId?: string;
  externalQuery?: string;
  addSource?: import('./planner-model').SourcePlaceAdder;
}) {
  const occurrence = stop ?? item;
  const mapboxId =
    externalPlaceId ?? (occurrence?.source === 'mapbox' ? occurrence.external_place_id : null);
  const query = externalQuery ?? occurrence?.external_query ?? '';
  const external = useExternalPlaces();
  const imagePresentation = usePlacePresentation(occurrence, occurrence?.entry, true);
  const [detail, setDetail] = useState<PlaceDetailData>(),
    [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [confirm, setConfirm] = useState(false),
    [retry, setRetry] = useState(0);
  const notes = useRef<HTMLTextAreaElement>(null),
    id = useId();
  const base = useRef({ trip: plan.version, item: occurrence?.version });
  const dirtyNotes = useRef(false);
  const notesBase = useRef(occurrence);
  const originalNotes = useRef(occurrence?.notes ?? '');
  const latestNotes = occurrence?.notes,
    latestVersion = occurrence?.version;
  useEffect(() => {
    if (latestVersion === undefined) return;
    if (!dirtyNotes.current || latestNotes === originalNotes.current) {
      base.current = { trip: plan.version, item: latestVersion };
      if (!dirtyNotes.current) {
        originalNotes.current = latestNotes ?? '';
        notesBase.current = occurrence;
        if (notes.current) notes.current.value = latestNotes ?? '';
      }
    }
  }, [plan.version, latestNotes, latestVersion, occurrence]);
  const parent = plan.items.find((activity) => activity.id === parentId);
  const stopTime =
    stop && parent
      ? (activityStops(parent).find(({ stop: child }) => child.id === stop.id)?.time ?? null)
      : null;
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
    if (externalPlaceId || (occurrence?.source && occurrence.source !== 'nagi'))
      return () => controller.abort();
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
  }, [guild, plan.id, entry.id, retry, occurrence?.source, externalPlaceId]);
  const person = plan.people.find((p) => p.id === occurrence?.added_by);
  const custom = detail?.entry.custom_values;
  const photoReference = occurrence
    ? {
        source: occurrence.source ?? ('nagi' as const),
        id:
          occurrence.source === 'mapbox'
            ? occurrence.external_place_id!
            : occurrence.source === 'custom'
              ? occurrence.id
              : occurrence.entry_id!,
        visit: occurrence.id,
        proof: imagePresentation.place?.imageProof,
        located: !!imagePresentation.place?.coordinates,
      }
    : undefined;
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
        {mapboxId ? (
          <ExternalPlaceView
            occurrence={occurrence?.id ?? `preview:${mapboxId}`}
            placeId={mapboxId}
            query={query}
            full
          />
        ) : (
          <PlaceImage
            category={entry.category?.name}
            photoReference={photoReference ?? { source: 'nagi', id: entry.id }}
            credits="dialog"
            src={entry.cover_image_url}
            className="trip-detail-photo"
            sizes="(max-width: 639px) 100vw, 380px"
          />
        )}
        {canEdit && photoReference && <ImagePicker reference={photoReference} />}
        {!mapboxId && (
          <div>
            <p className="trip-detail-category">{entry.category?.name}</p>
            <h3>{entry.title}</h3>
            <p className="trip-detail-location">
              {[entry.neighborhood?.name, entry.city?.name, entry.country?.name]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        )}
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
        {canEdit && stop && (
          <StopTiming
            stop={stop}
            time={stopTime}
            plan={plan}
            canEdit={canEdit}
            busy={busy}
            mutate={mutate}
          >
            <button
              type="button"
              className="trip-detail-schedule"
              disabled={busy}
              aria-label={`Modifier la durée de l’arrêt ${stop.entry?.title ?? 'indisponible'}`}
            >
              <Clock3 className="size-4" aria-hidden="true" />
              <span>
                {stopTime ? `≈ ${stopTime}` : 'Horaire libre'} ·{' '}
                {formatTripDuration(stop.duration_minutes) ?? 'Durée libre'}
              </span>
              <ArrowLeft className="size-3 rotate-180" aria-hidden="true" />
            </button>
          </StopTiming>
        )}
        {!canEdit && stop && (
          <p className="text-sm">
            {stopTime ? `≈ ${stopTime}` : 'Horaire libre'} ·{' '}
            {formatTripDuration(stop.duration_minutes) ?? 'Durée libre'}
          </p>
        )}
        {!canEdit && item && (
          <p className="text-sm">
            {formatTripTime(item.start_time) ?? 'Horaire libre'}
            {itemDuration(item) ? ` · ${formatTripDuration(itemDuration(item))}` : ''}
          </p>
        )}
        {canEdit && item && <CalendarColorAction item={item} />}
        {occurrence?.source === 'custom' && occurrence.custom_location && (
          <p className="trip-detail-location">{occurrence.custom_location}</p>
        )}
        {occurrence?.needs_place_relink && (
          <Alert>
            Associez un nouveau lieu à cette étape. Vos horaires, notes, couleurs et arrêts ont été
            conservés.
          </Alert>
        )}
        {canEdit && occurrence && (occurrence.source ?? 'nagi') !== 'nagi' && (
          <ReplaceExternalPlace id={occurrence.id} />
        )}
        {canEdit && occurrence?.source === 'custom' && (
          <CustomPlaceEditor place={occurrence} mutate={mutate} />
        )}
        {parentId && (
          <p className="trip-stop-help">
            {stop ? 'Arrêt de' : 'Ajout dans'} {parent?.entry?.title ?? 'cette activité'}.
          </p>
        )}
        {item && (
          <ActivityStops
            item={item}
            plan={plan}
            canEdit={canEdit}
            busy={busy}
            mutate={mutate}
            onAdd={onAddStop ? () => onAddStop(item.id) : undefined}
            onDetails={onStopDetails}
            selectedStop={selectedStop}
            always
            expanded={expandedStops?.[item.id]}
            onExpandedChange={onToggleStops ? () => onToggleStops(item.id) : undefined}
          />
        )}
        {occurrence && (
          <section className="trip-detail-section">
            <h4>{stop ? 'Notes de l’arrêt' : 'Notes du voyage'}</h4>
            {canEdit ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const expectedItemVersion = base.current.item!;
                  const original = notesBase.current ?? occurrence;
                  const result = await mutate(
                    'trip_item_id' in original
                      ? {
                          operation: 'edit_stop',
                          data: {
                            id: original.id,
                            stop_version: base.current.item!,
                            duration: original.duration_minutes,
                            notes: notes.current?.value ?? '',
                          },
                        }
                      : {
                          operation: 'edit_item',
                          data: {
                            id: original.id,
                            item_version: base.current.item!,
                            start_time: original.start_time?.slice(0, 5) ?? null,
                            end_time: original.end_time?.slice(0, 5) ?? null,
                            duration: original.estimated_duration_minutes,
                            notes: notes.current?.value ?? '',
                          },
                        },
                    base.current.trip,
                    'trip_item_id' in original ? { stop: original } : { item: original },
                  );
                  if (result.ok) {
                    setError('');
                    dirtyNotes.current = false;
                    originalNotes.current = notes.current?.value ?? '';
                    notesBase.current = { ...original, notes: originalNotes.current };
                    base.current = { trip: result.version, item: expectedItemVersion + 1 };
                  } else setError(result.error);
                }}
              >
                <Label htmlFor={id} className="sr-only">
                  {stop ? 'Notes de l’arrêt' : 'Notes du voyage'}
                </Label>
                <CatalogTextarea
                  ref={notes}
                  id={id}
                  defaultValue={occurrence.notes}
                  maxLength={4000}
                  placeholder="Billets, accès, idées à garder…"
                  onFocus={() => {
                    if (!dirtyNotes.current) {
                      base.current = { trip: plan.version, item: occurrence.version };
                      notesBase.current = occurrence;
                    }
                  }}
                  onChange={() => {
                    dirtyNotes.current = true;
                  }}
                />
                <div className="mt-2 flex items-center gap-2">
                  <Button type="submit" size="sm" variant="secondary" disabled={busy}>
                    Enregistrer les notes
                  </Button>
                </div>
              </form>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {occurrence.notes ||
                  (stop ? 'Aucune note pour cet arrêt.' : 'Aucune note pour cette étape.')}
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
        {!occurrence && canEdit && fullEntry && (
          <Button disabled={busy} onClick={() => void addEntry(fullEntry)}>
            {present(entry.id)
              ? 'Ajouter une autre visite'
              : parentId
                ? 'Ajouter un arrêt'
                : 'Ajouter une étape'}
          </Button>
        )}
        {!occurrence && canEdit && externalPlaceId && addSource && (
          <Button
            onClick={async () => {
              const result = await addSource(await external!.reference(externalPlaceId, query), {
                day: targetDay,
                parent: parentId,
              });
              if (result.ok) {
                setAdded(true);
                setError('');
              } else setError(result.error);
            }}
          >
            {added ? 'Ajouter une autre visite' : 'Ajouter une étape'}
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
      {confirm && item && canEdit && (
        <RemoveTripStepDialog
          item={item}
          version={plan.version}
          busy={busy}
          mutate={mutate}
          onClose={() => setConfirm(false)}
          onRemoved={onClose}
        />
      )}
    </>
  );
}
