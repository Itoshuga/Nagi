'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
} from '@nagi/ui';
import { tripPlaceReferenceSchema, type TripPlaceReference, type CatalogPlace } from '@nagi/shared';
import type { TripPlan, TripPlanItem, TripPlanStop } from '@nagi/database';
import { CatalogTextarea } from '@/features/catalog/admin-form';
import { externalStatus, useExternalPlaces } from '@/features/integrations/mapbox/components';
import {
  MapboxSearchController,
  type MapboxSearchState,
} from '@/features/integrations/mapbox/search-client';
import {
  mapboxSearchContext,
  type MapboxSearchFilters,
} from '@/features/integrations/mapbox/search-model';
import {
  catalogPlaceEntry,
  mapboxAttribution,
  mapboxAttributionUrl,
} from '@/features/integrations/mapbox/model';
import type { SourcePlaceAdder, PlanMutation } from './planner-model';
import { CatalogResult } from './catalog-result';
import { CatalogPlaceCard } from './catalog-place-card';
import type { CatalogEntry, CatalogPlacement } from './catalog-drag';

export function MapboxPlaceSearch({
  query,
  request,
  active,
  filters,
  plan,
  placement,
  defaultDuration,
  canAdd,
  add,
  onLoading,
  resultsId,
}: {
  query: string;
  request: { query: string; nonce: number };
  active: boolean;
  filters: MapboxSearchFilters;
  plan: TripPlan;
  placement: CatalogPlacement;
  defaultDuration: number;
  canAdd: boolean;
  add: SourcePlaceAdder;
  onLoading: (busy: boolean) => void;
  resultsId: string;
}) {
  const { day } = placement;
  const session = useExternalPlaces(),
    id = useId();
  const [state, setState] = useState<MapboxSearchState>({ phase: 'idle', places: [] }),
    [error, setError] = useState(''),
    [resolving, setResolving] = useState<string>();
  const [available, setAvailable] = useState<boolean>(),
    [minCharacters, setMinCharacters] = useState(3),
    handled = useRef(0);
  const controller = useMemo(
    () =>
      session
        ? new MapboxSearchController(
            session.url,
            (next) => {
              setState(next);
              if (next.phase === 'loading' || next.phase === 'idle') setError('');
              onLoading(next.phase === 'loading');
            },
            session.put,
          )
        : null,
    [session, onLoading],
  );
  const criteria = JSON.stringify({
    query,
    kind: 'suggest',
    category: filters.type,
    context: mapboxSearchContext(plan, day, filters.destination),
  });
  useEffect(() => {
    if (active && available === true) controller?.search(JSON.parse(criteria), minCharacters);
    return () => controller?.cancel();
  }, [controller, criteria, active, minCharacters, available]);
  useEffect(() => {
    if (active && session)
      void externalStatus(session)
        .then((status) => {
          setAvailable(status.available);
          setMinCharacters(status.minCharacters);
          if (!status.available)
            setError(
              'La recherche Mapbox est indisponible. Vous pouvez utiliser Nagi ou créer une étape personnalisée.',
            );
        })
        .catch(() => {
          setAvailable(false);
          setError(
            'La recherche Mapbox est momentanément indisponible. Le catalogue Nagi et les étapes personnalisées restent accessibles.',
          );
        });
  }, [active, session]);
  useEffect(() => {
    if (!active || !request.nonce || handled.current === request.nonce || available !== true)
      return;
    handled.current = request.nonce;
    controller?.search({ ...JSON.parse(criteria), kind: 'forward', query: request.query });
  }, [request, controller, active, criteria, available]);
  useEffect(() => () => controller?.dispose(), [controller]);
  useEffect(() => {
    if (!session || !controller) return;
    const cleanups = state.places.map((place) =>
      session.register(place.id, () => controller.resolve(place)),
    );
    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, [session, controller, state.places]);
  const reference = async (place: CatalogPlace) => {
    if (!session) throw new Error('La recherche n’est pas disponible.');
    controller?.finishSearch();
    setResolving(place.id);
    setError('');
    try {
      return await session.reference(place.id, place.query ?? query);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'La localisation du lieu est indisponible.',
      );
      throw error;
    } finally {
      setResolving(undefined);
    }
  };
  const insert = async (place: CatalogPlace, target: CatalogPlacement) => {
    try {
      const result = await add(await reference(place), {
        ...target,
        duration: target.duration ?? null,
      });
      setError(result.ok ? '' : result.error);
      return result;
    } catch {
      // The targeted resolution error is already displayed; no occurrence exists.
      return { ok: false as const, error: 'La localisation du lieu est indisponible.' };
    }
  };
  return (
    <div className="trip-mapbox-search" aria-busy={state.phase === 'loading'}>
      {state.phase === 'idle' && (
        <p className="trip-empty-inline">
          Recherchez un lieu, une activité ou un établissement. Entrée affiche plus de résultats.
        </p>
      )}
      {state.phase === 'loading' && (
        <div className="trip-external-search-loading" role="status">
          <span className="trip-external-spinner" />
          {state.places.length ? 'Mise à jour des résultats…' : 'Recherche en cours…'}
        </div>
      )}
      {(state.phase === 'error' || error) && (
        <Alert role="alert">
          {error || state.error}
          <button
            type="button"
            onClick={() => {
              setError('');
              controller?.search({ ...JSON.parse(criteria), kind: 'forward' });
            }}
          >
            Réessayer
          </button>
        </Alert>
      )}
      {state.phase === 'ready' && !state.places.length && (
        <p className="trip-empty-inline">
          Aucun lieu correspondant à votre recherche. Essayez un autre nom ou créez une étape
          personnalisée.
        </p>
      )}
      {resolving && (
        <p className="trip-external-status" role="status">
          Vérification de la localisation…
        </p>
      )}
      <ul
        role="listbox"
        aria-label="Lieux Mapbox"
        id={resultsId}
        className="trip-picker-results trip-external-result-list"
      >
        {state.places.map((place, index) => {
          const entry = catalogPlaceEntry(place) as CatalogEntry;
          return (
            <CatalogResult
              key={place.id}
              entry={entry}
              reference={{
                source: 'mapbox',
                placeId: place.id,
                query: place.query ?? query,
                proof: place.proof,
              }}
              plan={plan}
              placement={placement}
              defaultDuration={defaultDuration}
              draggable
              canAdd={canAdd}
              active={false}
              id={id + '-' + index}
              onActive={() => {}}
              onCommit={() => reference(place)}
              insert={(placement) => insert(place, placement)}
            >
              <CatalogPlaceCard
                entry={entry}
                place={place}
                onClick={() => {
                  void reference(place)
                    .then(() => {
                      const resolved = session?.get(place.id).place;
                      if (resolved) session?.preview?.(resolved);
                    })
                    .catch(() => {});
                }}
              />
            </CatalogResult>
          );
        })}
      </ul>
      {state.phase === 'ready' && query.trim().length >= minCharacters && (
        <button
          type="button"
          className="trip-external-search-more"
          onClick={() => controller?.search({ ...JSON.parse(criteria), kind: 'forward' })}
        >
          Rechercher « {query.trim()} »
        </button>
      )}
      <p className="trip-external-credit">
        <a href={mapboxAttributionUrl} target="_blank" rel="noreferrer">
          {mapboxAttribution}
        </a>{' '}
        ·{' '}
        <a href="/terms" target="_blank" rel="noreferrer">
          Conditions
        </a>{' '}
        ·{' '}
        <a href="/privacy" target="_blank" rel="noreferrer">
          Confidentialité
        </a>
      </p>
    </div>
  );
}

export function CustomStepDialog({
  open,
  onClose,
  add,
  placement,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  add: SourcePlaceAdder;
  placement: CatalogPlacement;
  initial?: Extract<TripPlaceReference, { source: 'custom' }>;
}) {
  const id = useId(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !busy) onClose();
      }}
    >
      <DialogContent className="trip-compact-dialog" closeDisabled={busy}>
        <DialogTitle>
          {initial ? 'Modifier l’étape personnalisée' : 'Créer une étape personnalisée'}
        </DialogTitle>
        <DialogDescription>
          Une étape libre, indépendante du catalogue et de Mapbox.
        </DialogDescription>
        <form
          className="grid gap-4 mt-5"
          onSubmit={async (e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            setBusy(true);
            setError('');
            const result = await add(
              {
                source: 'custom',
                title: String(form.get('title') ?? ''),
                location: String(form.get('location') ?? ''),
                latitude: initial?.latitude ?? null,
                longitude: initial?.longitude ?? null,
              },
              {
                ...placement,
                duration: form.get('duration') ? Number(form.get('duration')) : null,
              },
              {
                notes: String(form.get('notes') ?? ''),
                color: form.get('color') ? String(form.get('color')) : null,
              },
            );
            setBusy(false);
            if (result.ok) onClose();
            else setError(result.error);
          }}
        >
          <Label htmlFor={`${id}-title`}>
            Nom de l’étape
            <Input
              autoFocus
              id={`${id}-title`}
              name="title"
              required
              maxLength={160}
              defaultValue={initial?.title}
            />
          </Label>
          {!initial && (
            <Label htmlFor={`${id}-duration`}>
              Durée · minutes
              <Input
                id={`${id}-duration`}
                name="duration"
                type="number"
                min={1}
                max={1440}
                placeholder="Facultative"
              />
            </Label>
          )}
          <Label htmlFor={`${id}-location`}>
            Localisation ou adresse
            <Input
              id={`${id}-location`}
              name="location"
              maxLength={500}
              defaultValue={initial?.location}
              placeholder="Facultative"
            />
          </Label>
          {!initial && (
            <Label htmlFor={`${id}-notes`}>
              Notes
              <CatalogTextarea id={`${id}-notes`} name="notes" maxLength={4000} />
            </Label>
          )}
          {!initial && (
            <Label htmlFor={`${id}-color`}>
              Couleur facultative
              <Input
                id={`${id}-color`}
                name="color"
                pattern="#[0-9a-fA-F]{6}"
                placeholder="#739fd0"
                maxLength={7}
              />
            </Label>
          )}
          {error && <Alert role="alert">{error}</Alert>}
          <div className="trip-dialog-actions">
            <Button variant="ghost" type="button" disabled={busy} onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Enregistrement…' : initial ? 'Enregistrer' : 'Créer l’étape'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CustomPlaceEditor({
  place,
  mutate,
}: {
  place: TripPlanItem | TripPlanStop;
  mutate: PlanMutation;
}) {
  const [open, setOpen] = useState(false);
  if (place.source !== 'custom') return null;
  return (
    <>
      <button type="button" className="trip-remove-link" onClick={() => setOpen(true)}>
        Modifier le nom ou l’adresse
      </button>
      {open && (
        <CustomStepDialog
          open
          onClose={() => setOpen(false)}
          placement={{ day: null }}
          initial={{
            source: 'custom',
            title: place.custom_title ?? '',
            location: place.custom_location ?? '',
            latitude: place.custom_latitude,
            longitude: place.custom_longitude,
          }}
          add={async (value) => {
            const parsed = tripPlaceReferenceSchema.safeParse(value);
            return parsed.success
              ? mutate({ operation: 'replace_place', data: { id: place.id, place: parsed.data } })
              : { ok: false, error: 'Vérifiez le nom et la localisation.' };
          }}
        />
      )}
    </>
  );
}
