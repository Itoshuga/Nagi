'use client';
import { useId, useMemo, type Ref } from 'react';
import { Bike, Check, ChevronDown, MapPinOff, Plus } from 'lucide-react';
import { tripStepCount, tripStopCount } from '@nagi/shared';
import type { TripPlan } from '@nagi/database';
import { cn } from '@nagi/ui';
import type { DaySelection } from './planner-model';
import {
  routeDistanceLabel,
  routeDurationLabel,
  type DayRoutePlan,
  type DayRouteResult,
  type RouteVisit,
} from './map-route-model';
import { mapSidebarRows, type MapSelection, type MapSidebarRow } from './map-sidebar-model';

type RouteState = { result?: DayRouteResult; error?: string; loading: boolean };
type Props = {
  panelRef: Ref<HTMLDivElement>;
  plan: TripPlan;
  day: DaySelection;
  visits: RouteVisit[];
  missingIds: ReadonlySet<string>;
  selection?: MapSelection;
  highlightedId?: string;
  route: RouteState;
  routePlan: DayRoutePlan;
  resolving: boolean;
  canEdit: boolean;
  onOpen: (visit: RouteVisit) => void;
  onHover: (id?: string) => void;
  onFocus: (id?: string) => void;
  onSegmentHover: (id?: string) => void;
  onAdd: () => void;
};
function RouteSummary({
  route,
  routePlan,
  resolving,
}: {
  route: RouteState;
  routePlan: DayRoutePlan;
  resolving: boolean;
}) {
  const successful = route.result?.segments.some((s) => s.status === 'ok');
  const failures = route.result?.segments.filter((s) => s.status !== 'ok') ?? [];
  return (
    <section
      className="trip-route-summary"
      aria-label="Résumé du trajet"
      aria-live="polite"
      role="status"
    >
      <p className="trip-route-heading">
        {route.result?.status === 'partial' ? 'Trajet partiel' : 'Trajet du jour'}
      </p>
      {route.loading || resolving ? (
        <p className="trip-route-status">Calcul du parcours…</p>
      ) : route.error ? (
        <p className="trip-route-status">{route.error}</p>
      ) : routePlan.points.length < 2 ? (
        <p className="trip-route-status">
          {routePlan.points.length
            ? 'Un seul emplacement à rejoindre.'
            : 'Aucun déplacement calculable.'}
        </p>
      ) : successful && route.result ? (
        <p className="trip-route-metrics">
          <strong>{routeDistanceLabel(route.result.distance)}</strong>
          <span aria-hidden="true">·</span>
          <strong>{routeDurationLabel(route.result.duration)}</strong>
          <span className="trip-route-metrics-caption">
            de déplacement{route.result.status === 'partial' ? ' calculé' : ''}
          </span>
        </p>
      ) : (
        <p className="trip-route-status">Trajet indisponible à vélo pour ces lieux.</p>
      )}
      {!!failures.length && (
        <p className="trip-route-status">
          {failures.length}{' '}
          {failures.length === 1 ? 'liaison non calculée' : 'liaisons non calculées'}
          {failures.some((s) => s.status === 'quota' || s.status === 'limit')
            ? ' · Limite de calcul atteinte'
            : failures.some((s) => s.status === 'too-far')
              ? ' · Distance incompatible avec le vélo'
              : ''}
          .
        </p>
      )}
      <details className="trip-route-notes">
        <summary>
          Informations du trajet <ChevronDown aria-hidden="true" />
        </summary>
        <div>
          {routePlan.sameLocation > 0 && (
            <p>
              {routePlan.sameLocation}{' '}
              {routePlan.sameLocation === 1 ? 'accès commun' : 'accès communs'}, sans déplacement
              ajouté.
            </p>
          )}
          {!!routePlan.missing.length && (
            <p>
              {routePlan.missing.length}{' '}
              {routePlan.missing.length === 1 ? 'lieu sans position' : 'lieux sans position'} hors
              calcul.
            </p>
          )}
          <p>
            Les durées concernent les déplacements, hors visites. Métro, train et bus non calculés.
          </p>
        </div>
      </details>
    </section>
  );
}
function VisitRow({
  row,
  missing,
  selection,
  highlightedId,
  onOpen,
  onHover,
  onFocus,
  onSegmentHover,
}: { row: MapSidebarRow; missing?: boolean } & Pick<
  Props,
  'selection' | 'highlightedId' | 'onOpen' | 'onHover' | 'onFocus' | 'onSegmentHover'
>) {
  const id = useId();
  const selected = selection?.id === row.visit.id && selection.type === row.type;
  const label = `${row.type === 'stop' ? 'Arrêt' : 'Étape'} ${row.visit.number}, ${row.title}`;
  return (
    <li
      className={cn('trip-map-visit', row.type === 'stop' && 'trip-map-stop')}
      data-map-visit={row.visit.id}
      data-map-visit-type={row.type}
      data-map-position={missing ? 'missing' : 'located'}
      onMouseEnter={() => onHover(row.visit.id)}
      onMouseLeave={() => onHover(undefined)}
    >
      <button
        type="button"
        className="trip-map-visit-button"
        aria-label={label}
        aria-pressed={selected}
        aria-describedby={`${id}-meta${row.segment && !missing ? ` ${id}-leg` : ''}`}
        data-highlighted={highlightedId === row.visit.id ? 'true' : undefined}
        onFocus={() => onFocus(row.visit.id)}
        onBlur={() => onFocus(undefined)}
        onClick={() => onOpen(row.visit)}
      >
        <span className="trip-map-index" aria-hidden="true">
          {row.visit.number}
        </span>
        <span className="trip-map-visit-copy">
          <span className="trip-map-visit-title">{row.title}</span>
          <span id={`${id}-meta`} className="trip-map-visit-meta">
            {missing ? (
              <span className="trip-map-unlocated">
                <MapPinOff aria-hidden="true" />
                Position indisponible
              </span>
            ) : (
              <>
                {[row.time, row.duration, row.location].filter(Boolean).join(' · ') ||
                  'Horaire libre'}
              </>
            )}
            {row.type === 'stop' && (
              <span className="sr-only"> · Arrêt dans {row.parentTitle}</span>
            )}
          </span>
        </span>
        {selected && <Check aria-hidden="true" className="trip-map-selection-check" />}
      </button>
      {row.segment && !missing && (
        <div
          id={`${id}-leg`}
          className="trip-map-transition"
          data-route-leg={row.segment.id}
          onMouseEnter={() => onSegmentHover(row.segment!.id)}
          onMouseLeave={() => onSegmentHover(undefined)}
        >
          <span className="trip-map-transition-mark">
            <Bike aria-hidden="true" />
          </span>
          <p className="trip-route-leg">
            <span className="sr-only">Trajet à vélo : </span>
            <span>
              {row.segment.status === 'ok'
                ? `${routeDistanceLabel(row.segment.distance!)} · ${routeDurationLabel(row.segment.duration!)}`
                : 'Liaison suivante indisponible'}
            </span>
            <span className="trip-map-next" title={row.nextTitle}>
              Vers {row.nextTitle}
            </span>
          </p>
        </div>
      )}
    </li>
  );
}
export function MapSidebar({ panelRef, ...props }: Props) {
  const rows = useMemo(
    () => mapSidebarRows(props.visits, props.route.result?.segments),
    [props.visits, props.route.result?.segments],
  );
  const located = rows.filter((row) => !props.missingIds.has(row.visit.id)),
    missing = rows.filter((row) => props.missingIds.has(row.visit.id));
  const stepCount = props.visits.filter((visit) => !visit.stop).length,
    stopCount = props.visits.length - stepCount;
  const daily = props.day !== 'all' && props.day !== 'pending';
  const day = props.plan.days.find((day) => day.id === props.day);
  const date = day?.date
    ? new Intl.DateTimeFormat('fr-FR', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }).format(new Date(`${day.date}T12:00:00Z`))
    : undefined;
  return (
    <div
      ref={panelRef}
      className="trip-map-place-list"
      role="region"
      aria-label="Lieux du parcours"
    >
      <header className="trip-map-list-header">
        <h2>
          {props.day === 'all'
            ? 'Tout le voyage'
            : props.day === 'pending'
              ? 'À organiser'
              : `Jour ${props.plan.days.findIndex((d) => d.id === props.day) + 1}`}
        </h2>
        {date && (
          <p className="trip-map-day-caption">
            {date}
            {day?.title ? ` · ${day.title}` : ''}
          </p>
        )}
        <p className="trip-map-list-count">
          {tripStepCount(stepCount)}
          {stopCount ? ` · ${tripStopCount(stopCount)}` : ''}
        </p>
      </header>
      {daily && (
        <RouteSummary route={props.route} routePlan={props.routePlan} resolving={props.resolving} />
      )}
      <ol className="trip-map-route-list" aria-label="Étapes et arrêts géolocalisés">
        {located.map((row) => (
          <VisitRow key={row.visit.id} row={row} {...props} />
        ))}
      </ol>
      {!!missing.length && (
        <section className="trip-map-missing" aria-label="Sans coordonnées">
          <h3>
            <MapPinOff aria-hidden="true" />
            Sans coordonnées<span>{missing.length}</span>
          </h3>
          <ul className="trip-map-missing-list">
            {missing.map((row) => (
              <VisitRow key={row.visit.id} row={row} missing {...props} />
            ))}
          </ul>
        </section>
      )}
      {!located.length && (
        <p className="trip-map-empty">Les lieux avec des coordonnées apparaîtront ici.</p>
      )}
      {props.canEdit && (
        <footer className="trip-map-list-footer">
          <button type="button" className="trip-map-add" onClick={props.onAdd}>
            <Plus aria-hidden="true" />
            Ajouter une étape
          </button>
        </footer>
      )}
    </div>
  );
}
