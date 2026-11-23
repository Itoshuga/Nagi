'use client';

import { useState } from 'react';
import { Alert, Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@nagi/ui';
import type { TripPlanItem } from '@nagi/database';
import type { PlanMutation } from './planner-model';

export function RemoveTripStepDialog({
  item,
  version,
  busy,
  mutate,
  onClose,
  onRemoved,
  returnFocus,
}: {
  item: TripPlanItem;
  version: number;
  busy: boolean;
  mutate: PlanMutation;
  onClose: () => void;
  onRemoved?: () => void;
  returnFocus?: () => void;
}) {
  // Keep the confirmed visit, including its stops, as the deletion guard. A
  // collaborator's changes while this dialog is open must not be discarded.
  const [base] = useState(() => ({ item, version }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const disabled = busy || pending;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !disabled) onClose();
      }}
    >
      <DialogContent
        className="trip-compact-dialog"
        closeDisabled={disabled}
        onCloseAutoFocus={
          returnFocus
            ? (event) => {
                event.preventDefault();
                returnFocus();
              }
            : undefined
        }
      >
        <DialogTitle>Retirer cette étape ?</DialogTitle>
        <DialogDescription>
          Les notes et horaires de cette visite seront retirés du voyage.
          {!!base.item.stops.length &&
            (base.item.stops.length === 1
              ? ' Son arrêt et ses notes seront également retirés.'
              : ` Ses ${base.item.stops.length} arrêts et leurs notes seront également retirés.`)}
        </DialogDescription>
        {error && (
          <Alert role="alert" className="mt-4">
            {error}
          </Alert>
        )}
        <div className="trip-dialog-actions">
          <Button type="button" variant="ghost" disabled={disabled} onClick={onClose}>
            Annuler
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={disabled}
            onClick={async () => {
              if (disabled) return;
              setPending(true);
              setError('');
              try {
                const result = await mutate(
                  { operation: 'delete_item', data: { id: base.item.id } },
                  base.version,
                  { item: base.item },
                );
                if (result.ok) {
                  onRemoved?.();
                  onClose();
                } else setError(result.error);
              } catch {
                setError('Impossible de retirer cette étape. Réessayez.');
              } finally {
                setPending(false);
              }
            }}
          >
            {pending ? 'Suppression…' : 'Retirer'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
