'use client';

import { useState } from 'react';
import { Alert, Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@nagi/ui';
import type { TripPlan, TripPlanItem } from '@nagi/database';
import { activityNestingIssue, type PlanMutation } from './planner-model';

export function ActivityNestingDialog({
  item,
  items,
  days,
  busy,
  mutate,
  onClose,
}: {
  item: TripPlanItem;
  items: TripPlanItem[];
  days: TripPlan['days'];
  busy: boolean;
  mutate: PlanMutation;
  onClose: () => void;
}) {
  const [error, setError] = useState('');
  const candidates = items.filter((parent) => !activityNestingIssue(item, parent));
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="trip-nesting-dialog"
        closeDisabled={busy}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          requestAnimationFrame(() =>
            document
              .querySelector<HTMLElement>(`[data-activity-id="${item.id}"] .trip-step-main`)
              ?.focus(),
          );
        }}
      >
        <DialogTitle>Intégrer à une activité</DialogTitle>
        <DialogDescription>
          {item.entry?.title ?? 'Cette étape'} deviendra un arrêt. Ses notes et sa durée seront
          conservées ; son jour et son horaire suivront l’activité choisie et l’ordre de ses arrêts.
        </DialogDescription>
        <div className="trip-nesting-choices">
          {candidates.map((parent) => (
            <Button
              key={parent.id}
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                const result = await mutate({
                  operation: 'nest_item',
                  data: { id: item.id, parent: parent.id },
                });
                if (result.ok) onClose();
                else setError(result.error);
              }}
            >
              {parent.entry?.title ?? 'Fiche indisponible'}
              <small>
                {parent.trip_day_id
                  ? `Jour ${days.findIndex((day) => day.id === parent.trip_day_id) + 1}`
                  : 'À organiser'}{' '}
                · {parent.start_time?.slice(0, 5) ?? 'Horaire libre'}
              </small>
            </Button>
          ))}
          {!candidates.length && <p>Aucune autre activité ne peut accueillir cet arrêt.</p>}
        </div>
        {error && <Alert role="alert">{error}</Alert>}
        <div className="trip-dialog-actions">
          <Button variant="ghost" disabled={busy} onClick={onClose}>
            Annuler
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
