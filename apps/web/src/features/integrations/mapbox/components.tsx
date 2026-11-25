'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { CatalogPlace } from '@nagi/shared';
import type { EntryCardRow, PlaceSourceFields, TripPlan } from '@nagi/database';
import { PlaceImage } from '@/features/integrations/mapbox/place-image';
import { ImageResolverProvider } from '@/features/images/components';
import { mapboxClientRequest } from './client';
import {
  mapboxAttribution,
  mapboxAttributionUrl,
  nagiCatalogPlace,
  mapboxCategoryLabel,
} from './model';
import { mapboxSearchContext } from './search-model';

import { ExternalPlaceSession, emptyPlaceState as empty } from './session';
const Context = createContext<ExternalPlaceSession | null>(null);
export const useExternalPlaces = () => useContext(Context);
export function ExternalPlacesProvider({
  guild,
  trip,
  plan,
  onReplace,
  onPreview,
  children,
}: {
  guild: string;
  trip: string;
  plan: TripPlan;
  onReplace?: (id: string) => void;
  onPreview?: (place: CatalogPlace) => void;
  children: ReactNode;
}) {
  const session = useMemo(
    () => new ExternalPlaceSession(`/app/${guild}/trips/${trip}/external`, onReplace, onPreview),
    [guild, trip, onReplace, onPreview],
  );
  const context = JSON.stringify(mapboxSearchContext(plan, null, true));
  useEffect(() => {
    session.setContext(JSON.parse(context));
  }, [session, context]);
  useEffect(() => {
    session.start();
    return () => session.dispose();
  }, [session]);
  return (
    <Context.Provider value={session}>
      <ImageResolverProvider url={`/app/${guild}/trips/${trip}/images`} trip={trip}>
        {children}
      </ImageResolverProvider>
    </Context.Provider>
  );
}
export function externalStatus(session: ExternalPlaceSession) {
  session.status ??= mapboxClientRequest(session.url).catch((error) => {
    session.status = undefined;
    throw error;
  });
  return session.status;
}
export function useExternalPlaceVersion() {
  const session = useExternalPlaces();
  return useSyncExternalStore(
    session?.subscribeAll ?? (() => () => {}),
    session?.getVersion ?? (() => 0),
    () => 0,
  );
}
export function usePlacePresentation(
  row: (PlaceSourceFields & { id: string }) | undefined,
  entry: EntryCardRow | null | undefined,
  eager = false,
) {
  const session = useExternalPlaces(),
    id = row?.source === 'mapbox' ? (row.external_place_id ?? '') : '',
    query = row?.external_query ?? '';
  const element = useRef<HTMLElement | null>(null);
  const observe = useCallback((node: HTMLElement | null) => {
    element.current = node;
  }, []);
  const subscribe = useCallback(
    (fn: () => void) => (session && id ? session.subscribe(id, fn) : () => {}),
    [session, id],
  );
  const snapshot = useCallback(() => (session && id ? session.get(id) : empty), [session, id]);
  const record = useSyncExternalStore(subscribe, snapshot, () => empty);
  useEffect(() => {
    if (!session || !id || !query) return;
    const load = () => {
      void session.ensure(id, query).catch(() => {});
    };
    if (eager) {
      load();
      return;
    }
    const node = element.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: '100px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [session, id, query, eager]);
  const place =
    row?.source === 'mapbox' ? record.place : entry ? nagiCatalogPlace(entry) : undefined;
  return {
    observe,
    record,
    place,
    title:
      (row?.source === 'custom' ? (row.custom_title ?? 'Étape personnalisée') : undefined) ??
      place?.title ??
      (record.error
        ? 'Lieu indisponible'
        : row?.needs_place_relink
          ? 'Étape à réassocier'
          : row?.source === 'mapbox'
            ? 'Chargement du lieu…'
            : (entry?.title ?? 'Fiche indisponible')),
    imageUrl: place?.imageUrl ?? entry?.cover_image_url ?? undefined,
    category:
      row?.source === 'mapbox'
        ? mapboxCategoryLabel(place?.category)
        : (place?.category ?? entry?.category?.name),
    location:
      place?.locationLabel ??
      [entry?.neighborhood?.name, entry?.city?.name].filter(Boolean).join(' · '),
    refresh: () => session?.ensure(id, query, true).catch(() => {}),
  };
}
export function ExternalPlaceView({
  placeId,
  query,
  occurrence,
  full = false,
  appearance = 'label',
  eager = false,
  showIdentity = true,
}: {
  placeId: string;
  query: string;
  occurrence?: string;
  full?: boolean;
  appearance?: 'card' | 'label' | 'thumbnail';
  eager?: boolean;
  showIdentity?: boolean;
}) {
  const session = useExternalPlaces();
  const presentation = usePlacePresentation(
    {
      id: placeId,
      source: 'mapbox',
      entry_id: null,
      external_place_id: placeId,
      external_query: query,
    },
    null,
    full || eager,
  );
  const { place, record, title, observe } = presentation;
  useEffect(() => {
    if (full && place?.coordinates) void session?.details(placeId, query);
  }, [full, place?.coordinates, session, placeId, query]);
  if (full)
    return (
      <div ref={observe} className="trip-external-details">
        {showIdentity && (
          <>
            <PlaceImage
              photoReference={{
                source: 'mapbox',
                id: placeId,
                ...(occurrence && !occurrence.startsWith('preview:') ? { visit: occurrence } : {}),
                proof: place?.imageProof,
                located: !!place?.coordinates,
              }}
              credits="dialog"
              src={place?.imageUrl}
              source="mapbox"
              category={place?.categoryId ?? place?.category}
              className="trip-detail-photo"
              sizes="(max-width:639px) 100vw,380px"
            />
            <div>
              <p className="trip-detail-category">{place?.category}</p>
              <h3>{title}</h3>
              <p className="trip-detail-location">{place?.locationLabel}</p>
            </div>
          </>
        )}
        {record.error && (
          <p role="status" className="trip-external-error">
            {record.error}{' '}
            <button type="button" onClick={presentation.refresh}>
              Réessayer
            </button>
          </p>
        )}
        {place && (
          <dl className="trip-external-facts">
            {place.address && (
              <div>
                <dt>Adresse</dt>
                <dd>{place.address}</dd>
              </div>
            )}
            {place.openingHours && (
              <div>
                <dt>Horaires du lieu</dt>
                <dd>{place.openingHours}</dd>
              </div>
            )}
            {place.website && (
              <div>
                <dt>Site internet</dt>
                <dd>
                  <a href={place.website} target="_blank" rel="noreferrer">
                    Consulter le site officiel
                  </a>
                </dd>
              </div>
            )}
            {place.phone && (
              <div>
                <dt>Téléphone</dt>
                <dd>{place.phone}</dd>
              </div>
            )}
            {(place.permanentlyClosed || place.status === 'inactive') && (
              <div>
                <dt>Établissement</dt>
                <dd>Signalé comme fermé ou inactif</dd>
              </div>
            )}
          </dl>
        )}
        {record.detailsLoading && (
          <p role="status" className="trip-external-status">
            Chargement des informations complémentaires…
          </p>
        )}
        {place &&
          !record.detailsLoading &&
          !record.detailsError &&
          !place.address &&
          !place.openingHours &&
          !place.website &&
          !place.phone &&
          !place.permanentlyClosed &&
          place.status !== 'inactive' && (
            <p className="trip-detail-empty-copy">
              Aucune information complémentaire pour ce lieu.
            </p>
          )}
        {record.detailsError && (
          <p role="status" className="trip-external-status">
            Les informations complémentaires sont indisponibles.{' '}
            <button type="button" onClick={() => void session?.details(placeId, query, true)}>
              Réessayer
            </button>
          </p>
        )}
        {place?.imageUrl && place.imageSource && (
          <a
            className="trip-external-credit"
            href={place.imageSource}
            target="_blank"
            rel="noreferrer"
          >
            Source de la photographie
          </a>
        )}
        <a
          className="trip-external-credit"
          href={mapboxAttributionUrl}
          target="_blank"
          rel="noreferrer"
        >
          {mapboxAttribution}
        </a>
      </div>
    );
  return (
    <span
      ref={observe}
      className={`trip-external-place is-${appearance}${record.loading && !place ? ' is-loading' : ''}`}
      title={record.error}
    >
      {appearance !== 'label' && (
        <PlaceImage
          photoReference={{
            source: 'mapbox',
            id: placeId,
            ...(occurrence && !occurrence.startsWith('preview:') ? { visit: occurrence } : {}),
            proof: place?.imageProof,
            located: !!place?.coordinates,
          }}
          src={place?.imageUrl}
          source="mapbox"
          category={place?.categoryId ?? place?.category}
          className="trip-external-photo"
          sizes="52px"
        />
      )}
      <span>
        <strong>{title}</strong>
        {appearance !== 'label' && (
          <small>{[place?.category, place?.locationLabel].filter(Boolean).join(' · ')}</small>
        )}
      </span>
    </span>
  );
}
