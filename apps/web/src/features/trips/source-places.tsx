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
import { tripPlaceReferenceSchema, type TripPlaceReference } from '@nagi/shared';
import type { TripPlan, TripPlanItem, TripPlanStop } from '@nagi/database';
import { tripSourceEntry } from '@nagi/database/trip-places';
import { CatalogTextarea } from '@/features/catalog/admin-form';
import {
  externalStatus,
  useExternalPlaces,
} from '@/features/integrations/google-places/components';
import { loadGooglePlaces } from '@/features/integrations/google-places/client';
import {
  GoogleSearchController,
  type GoogleSearchState,
} from '@/features/integrations/google-places/search-client';
import {
  googleSearchContext,
  type GoogleSearchFilters,
} from '@/features/integrations/google-places/search-model';
import type { SourcePlaceAdder, PlanMutation } from './planner-model';
import { CatalogResult } from './catalog-result';
import { CatalogPlaceCard } from './catalog-place-card';
import type { CatalogEntry, CatalogPlacement } from './catalog-drag';

export function GooglePlaceSearch({
  query,
  request,
  active,
  filters,
  plan,
  day,
  parent,
  time,
  defaultDuration,
  canAdd,
  panel,
  add,
  onLoading,
  resultsId,
}: {
  query: string;
  request: { query: string; nonce: number };
  active: boolean;
  filters: GoogleSearchFilters;
  plan: TripPlan;
  day: string | null;
  parent?: string;
  time?: string;
  defaultDuration: number;
  canAdd: boolean;
  panel: boolean;
  add: SourcePlaceAdder;
  onLoading: (busy: boolean) => void;
  resultsId: string;
}) {
  const session = useExternalPlaces(),
    id = useId(),
    [state, setState] = useState<GoogleSearchState>({ phase: 'idle', ids: [] }),
    [error, setError] = useState('');
  const handled = useRef(0);
  const [minCharacters, setMinCharacters] = useState(3);
  const controller = useMemo(
    () =>
      session
        ? new GoogleSearchController(session.url, (next) => {
            setState(next);
            onLoading(next.phase === 'loading');
          })
        : null,
    [session, onLoading],
  );
  const context = googleSearchContext(plan, day, filters.destination);
  const criteria = JSON.stringify({ query, kind: 'autocomplete', type: filters.type, context });
  useEffect(() => {
    if (active) controller?.search(JSON.parse(criteria), minCharacters);
    return () => controller?.cancel();
  }, [controller, criteria, active, minCharacters]);
  useEffect(() => {
    if (active && session)
      void externalStatus(session)
        .then((status) => {
          setMinCharacters(status.minCharacters);
          if (status.available) return loadGooglePlaces();
        })
        .catch(() => {});
  }, [active, session]);
  useEffect(() => {
    if (!active || !request.nonce || handled.current === request.nonce) return;
    handled.current = request.nonce;
    controller?.search({ ...JSON.parse(criteria), kind: 'text_search', query: request.query });
  }, [request, controller, active, criteria]);
  useEffect(() => () => controller?.dispose(), [controller]);
  const insert = async (placeId: string, placement: CatalogPlacement) => {
    const result = await add(
      { source: 'google', placeId },
      {
        ...placement,
        parent: placement.parent ?? parent,
        time: placement.time ?? time,
        duration: placement.duration ?? (placement.time || time ? defaultDuration : null),
      },
    );
    if (!result.ok) setError(result.error);
    else setError('');
  };
  return (
    <div className="trip-google-search" aria-busy={state.phase === 'loading'}>
      {state.phase === 'idle' && (
        <p className="trip-empty-inline">
          Recherchez un lieu, une activité ou un établissement. Entrée affiche plus de résultats.
        </p>
      )}
      {state.phase === 'loading' && (
        <div className="trip-google-search-loading" role="status">
          <span className="trip-google-skeleton" />
          {state.ids.length ? 'Mise à jour des résultats…' : 'Recherche en cours…'}
        </div>
      )}
      {(state.phase === 'error' || error) && (
        <Alert role="alert">
          {error || state.error}
          <button
            type="button"
            onClick={() => controller?.search({ ...JSON.parse(criteria), kind: 'text_search' })}
          >
            Réessayer
          </button>
        </Alert>
      )}
      {state.phase === 'ready' && !state.ids.length && (
        <p className="trip-empty-inline">Aucun lieu correspondant à votre recherche.</p>
      )}
      <ul
        role="listbox"
        aria-label="Lieux Google Maps"
        id={resultsId}
        className="trip-google-result-list"
      >
        {state.ids.map((placeId, index) => {
          const entry = tripSourceEntry({
            id: placeId,
            source: 'google',
            entry_id: null,
            google_place_id: placeId,
            updated_at: '',
          }) as CatalogEntry;
          return (
            <CatalogResult
              key={placeId}
              entry={entry}
              reference={{ source: 'google', placeId }}
              plan={plan}
              initialDay={day}
              defaultDuration={defaultDuration}
              draggable={panel}
              canAdd={canAdd}
              active={false}
              id={id + '-' + index}
              onActive={() => {}}
              onCommit={() => controller?.complete(placeId)}
              insert={(placement) => insert(placeId, placement)}
            >
              <CatalogPlaceCard
                entry={entry}
                placeId={placeId}
                onClick={() => {
                  if (panel) session?.preview?.(placeId);
                  else if (canAdd) {
                    controller?.complete(placeId);
                    void insert(placeId, {
                      day,
                      parent,
                      time,
                      duration: time ? defaultDuration : null,
                    });
                  }
                }}
              />
            </CatalogResult>
          );
        })}
      </ul>
      <p className="trip-google-legal">
        <a href="/terms" target="_blank" rel="noreferrer">
          Conditions d’utilisation
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
          Une étape libre, indépendante du catalogue et de Google Maps.
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
