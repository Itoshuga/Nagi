'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { Plus, Search } from 'lucide-react';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  cn,
  toast,
} from '@nagi/ui';
import {
  destinationPageSize,
  type CatalogLocation,
  type EditableTrip,
  type EntryCardRow,
  type TripPlannerDay,
} from '@nagi/database';
import { tripDateLabel } from '@nagi/shared';
import { CatalogSelect } from '@/features/catalog/admin-form';
import { CatalogPicker } from '@/features/catalog/picker';
import { EntryImage } from '@/features/media/image';
import { editTrip, editableTripOptions, tripCatalogSearch, tripPlaceOptions } from './actions';

export type PlaceCard = Pick<
  EntryCardRow,
  'id' | 'title' | 'cover_image_url' | 'summary' | 'category' | 'country' | 'city' | 'neighborhood'
>;
type CategoryOption = { id: string; name: string };
type TripTarget = { id: string; title: string; days: TripPlannerDay[] };

export function dayLabel(day: TripPlannerDay, days: TripPlannerDay[]) {
  const number = `Jour ${days.findIndex((candidate) => candidate.id === day.id) + 1}`;
  return [number, day.date ? tripDateLabel(day.date, { dateStyle: 'medium' }) : null, day.title]
    .filter(Boolean)
    .join(' · ');
}

export function TripDaySelect({
  days,
  value,
  onChange,
  id,
  name = 'day',
  empty = 'À organiser',
}: {
  days: TripPlannerDay[];
  value?: string;
  onChange?: (value: string) => void;
  id?: string;
  name?: string;
  empty?: string;
}) {
  return (
    <CatalogSelect
      id={id}
      name={name}
      value={value}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
    >
      <option value="">{empty}</option>
      {days.map((day) => (
        <option key={day.id} value={day.id}>
          {dayLabel(day, days)}
        </option>
      ))}
    </CatalogSelect>
  );
}

function PlacePreview({ entry }: { entry: PlaceCard }) {
  return (
    <div className="flex min-w-0 gap-3 text-left">
      <EntryImage
        src={entry.cover_image_url}
        className="aspect-square w-14 shrink-0 rounded-xl sm:w-16"
        sizes="64px"
      />
      <div className="min-w-0">
        <p className="break-words text-sm font-bold">{entry.title}</p>
        <p className="mt-0.5 break-words text-xs text-muted-foreground">
          {[entry.category?.name, entry.neighborhood?.name, entry.city?.name, entry.country?.name]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {entry.summary && (
          <p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-muted-foreground">
            {entry.summary}
          </p>
        )}
      </div>
    </div>
  );
}

function PlaceSearch({
  guild,
  categories,
  onSelect,
}: {
  guild: string;
  categories: CategoryOption[];
  onSelect: (entry: PlaceCard) => void;
}) {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [country, setCountry] = useState<CatalogLocation>();
  const [city, setCity] = useState<CatalogLocation>();
  const [area, setArea] = useState<CatalogLocation>();
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{
    key: string;
    rows: EntryCardRow[];
    count: number;
    error?: boolean;
  }>();
  const key = [query, category, country?.id, city?.id, area?.id, page].join('|');
  useEffect(() => {
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const data = await tripCatalogSearch(guild, {
          search: query,
          page,
          countryId: country?.id,
          cityId: city?.id,
          neighborhoodId: area?.id,
          categoryId: category || undefined,
        });
        if (current) setResult({ key, ...data });
      } catch {
        if (current) setResult({ key, rows: [], count: 0, error: true });
      }
    }, 180);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [area?.id, category, city?.id, country?.id, guild, key, page, query]);
  const visible = result?.key === key ? result : undefined;
  return (
    <div className="space-y-3">
      <div className="relative">
        <Label htmlFor={searchId}>Rechercher une fiche</Label>
        <Search
          aria-hidden="true"
          className="absolute bottom-3 left-3 size-4 text-muted-foreground"
        />
        <Input
          id={searchId}
          className="pl-9"
          maxLength={100}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
          placeholder="Nom du lieu ou de l’activité"
        />
      </div>
      <details className="rounded-xl border border-border p-2.5">
        <summary className="cursor-pointer rounded px-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
          Filtres{country || category ? ' · actifs' : ''}
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <CatalogPicker
            name="country"
            label="Pays"
            value={country}
            selectedName={(item) => item.name}
            search={(text) => tripPlaceOptions(guild, 'countries', text)}
            onSelect={(choice) => {
              setCountry(choice);
              setCity(undefined);
              setArea(undefined);
              setPage(1);
            }}
          />
          <CatalogPicker
            key={country?.id ?? 'no-country'}
            name="city"
            label="Ville"
            value={city}
            disabled={!country}
            selectedName={(item) => item.name}
            search={(text) => tripPlaceOptions(guild, 'cities', text, country?.id)}
            onSelect={(choice) => {
              setCity(choice);
              setArea(undefined);
              setPage(1);
            }}
          />
          {city?.has_neighborhoods && (
            <CatalogPicker
              key={city.id}
              name="neighborhood"
              label="Quartier"
              value={area}
              selectedName={(item) => item.name}
              search={(text) => tripPlaceOptions(guild, 'neighborhoods', text, city.id)}
              onSelect={(choice) => {
                setArea(choice);
                setPage(1);
              }}
            />
          )}
          <label className="grid content-start gap-2 text-sm font-medium">
            Catégorie
            <CatalogSelect
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Toutes les catégories</option>
              {categories.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </CatalogSelect>
          </label>
        </div>
      </details>
      {!visible ? (
        <p role="status" className="py-4 text-sm text-muted-foreground">
          Recherche en cours…
        </p>
      ) : visible.error ? (
        <Alert role="alert">La recherche est momentanément indisponible.</Alert>
      ) : visible.rows.length ? (
        <ul className="space-y-1.5">
          {visible.rows.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="w-full rounded-xl border border-border p-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => onSelect(entry)}
              >
                <PlacePreview entry={entry} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p role="status" className="py-4 text-sm text-muted-foreground">
          Aucune fiche publiée ne correspond à ces critères.
        </p>
      )}
      {visible && (page > 1 || visible.count > destinationPageSize) && (
        <div className="flex justify-between gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Précédente
          </Button>
          <p className="self-center text-xs text-muted-foreground">Page {page}</p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={page * destinationPageSize >= visible.count}
            onClick={() => setPage(page + 1)}
          >
            Suivante
          </Button>
        </div>
      )}
    </div>
  );
}

export function AddPlaceDialog({
  guildId,
  trip,
  entry,
  categories = [],
  initialDay = null,
  initialOpen = false,
  onDismiss,
  children,
}: {
  guildId: string;
  trip?: TripTarget;
  entry?: PlaceCard;
  categories?: CategoryOption[];
  initialDay?: string | null;
  initialOpen?: boolean;
  onDismiss?: () => void;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const dayInput = useId();
  const [open, setOpen] = useState(initialOpen);
  const [selected, setSelected] = useState(entry);
  const [tripId, setTripId] = useState(trip?.id ?? '');
  const [day, setDay] = useState(initialDay ?? '');
  const [remote, setRemote] = useState<{
    trips: EditableTrip[];
    canCreate: boolean;
    error?: string;
  }>();
  const [error, setError] = useState('');
  const [duplicate, setDuplicate] = useState(false);
  const [pending, startTransition] = useTransition();
  const receipt = useRef<{ key: string; id: string }>(null);
  const inFlight = useRef(false);
  useEffect(() => {
    if (!open || trip) return;
    let current = true;
    editableTripOptions(guildId).then(
      (value) => {
        if (current) setRemote(value);
      },
      () => {
        if (current)
          setRemote({
            trips: [],
            canCreate: false,
            error: 'Impossible de charger les voyages du serveur.',
          });
      },
    );
    return () => {
      current = false;
    };
  }, [guildId, open, trip]);
  const target = trip ?? remote?.trips.find((item) => item.id === tripId);
  const chosenDay = target?.days.some((item) => item.id === day) ? day : '';

  function reset(openNext: boolean) {
    if (inFlight.current) return;
    setOpen(openNext);
    setError('');
    setDuplicate(false);
    if (!openNext) {
      setSelected(entry);
      setDay(initialDay ?? '');
      setTripId(trip?.id ?? '');
      setRemote(undefined);
      receipt.current = null;
      onDismiss?.();
    }
  }

  function submit(repeat: boolean) {
    if (!selected || !target || inFlight.current) return;
    const key = [target.id, selected.id, chosenDay].join('|');
    const id = receipt.current?.key === key ? receipt.current.id : crypto.randomUUID();
    receipt.current = { key, id };
    inFlight.current = true;
    const entryId = selected.id;
    const selectedTrip = target.id;
    startTransition(async () => {
      try {
        const result = await editTrip(guildId, selectedTrip, 0, {
          operation: 'add_item',
          data: { id, entry: entryId, day: chosenDay || null, repeat },
        });
        if (result.ok) {
          inFlight.current = false;
          reset(false);
          toast.success('Lieu ajouté au voyage.');
          router.refresh();
        } else {
          setDuplicate(result.reason === 'duplicate');
          setError(result.error);
        }
      } catch {
        setError('Impossible d’ajouter ce lieu. Réessayez.');
      } finally {
        inFlight.current = false;
      }
    });
  }
  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        {children ?? (
          <Button variant={trip ? 'secondary' : 'default'} size={trip ? 'sm' : 'default'}>
            <Plus className="size-4" />
            {trip ? 'Ajouter une étape' : 'Ajouter à mon voyage'}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] max-w-xl overflow-y-auto">
        <DialogTitle className="pr-6 font-display text-xl font-extrabold">
          {trip ? 'Ajouter une étape' : 'Ajouter à mon voyage'}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          {trip
            ? 'Choisissez une fiche du catalogue pour cet itinéraire.'
            : 'Choisissez le voyage et la journée où placer cette fiche.'}
        </DialogDescription>
        <div className="mt-4 space-y-4">
          {!selected ? (
            <PlaceSearch guild={guildId} categories={categories} onSelect={setSelected} />
          ) : (
            <>
              <div className="rounded-xl border border-border p-2.5">
                <PlacePreview entry={selected} />
              </div>
              {!entry && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setSelected(undefined);
                    setError('');
                    setDuplicate(false);
                  }}
                >
                  Choisir un autre lieu
                </Button>
              )}
              {!trip &&
                (!remote ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    Chargement des voyages…
                  </p>
                ) : remote.error ? (
                  <Alert role="alert">{remote.error}</Alert>
                ) : (
                  <>
                    {remote.trips.length ? (
                      <label className="grid gap-2 text-sm font-medium">
                        Voyage
                        <CatalogSelect
                          value={tripId}
                          disabled={pending}
                          onChange={(event) => {
                            setTripId(event.target.value);
                            setDay('');
                            setError('');
                            setDuplicate(false);
                          }}
                        >
                          <option value="">Choisir un voyage</option>
                          {remote.trips.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.title}
                            </option>
                          ))}
                        </CatalogSelect>
                      </label>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Aucun voyage modifiable sur ce serveur.
                      </p>
                    )}
                    {remote.canCreate && (
                      <Link
                        className="text-sm font-semibold text-primary-ink underline underline-offset-4"
                        href={`/app/${guildId}/trips/new?ajouter=${selected.id}`}
                      >
                        Créer un voyage
                      </Link>
                    )}
                  </>
                ))}
              {target && (
                <div>
                  <Label htmlFor={dayInput}>Journée</Label>
                  <TripDaySelect
                    days={target.days}
                    id={dayInput}
                    value={chosenDay}
                    onChange={(value) => {
                      if (pending) return;
                      setDay(value);
                      setError('');
                      setDuplicate(false);
                    }}
                  />
                </div>
              )}
              {error && <Alert role="alert">{error}</Alert>}
              {target && (
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => submit(duplicate)}
                  className={cn('w-full', duplicate && 'sm:w-auto')}
                >
                  {pending
                    ? 'Ajout en cours…'
                    : duplicate
                      ? 'Ajouter une autre fois'
                      : 'Ajouter au voyage'}
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
