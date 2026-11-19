'use client';
import { useActionState, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
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
} from '@nagi/ui';
import type { CatalogLocation } from '@nagi/database';
import { suggestedTripZone } from '@nagi/shared';
import { CatalogPicker } from '@/features/catalog/picker';
import { createPlannedTrip, tripPlaceOptions } from './actions';
import './workspace.css';

export function CreateTripLink({
  guildId,
  entry,
  initialOpen = false,
  destination,
  dismissTo,
}: {
  guildId: string;
  entry?: string;
  initialOpen?: boolean;
  destination?: CatalogLocation;
  dismissTo?: string;
}) {
  const [open, setOpen] = useState(initialOpen),
    [country, setCountry] = useState(destination);
  const [state, action, pending] = useActionState(
    createPlannedTrip.bind(null, guildId, entry ?? null),
    { error: '' },
  );
  const id = useId(),
    router = useRouter();
  const close = () => {
    if (pending) return;
    setOpen(false);
    if (dismissTo) router.replace(dismissTo);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) close();
        else setOpen(true);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" /> Créer un voyage
        </Button>
      </DialogTrigger>
      <DialogContent
        className="trip-compact-dialog trip-create-dialog"
        closeDisabled={pending}
        onEscapeKeyDown={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        <DialogTitle>Un nouveau voyage.</DialogTitle>
        <DialogDescription>
          Une destination, quelques idées. Le reste se construit ensemble.
        </DialogDescription>
        <form action={action} className="mt-5">
          <fieldset disabled={pending} className="space-y-4">
            <div>
              <Label htmlFor={`${id}-title`}>Nom du voyage</Label>
              <Input
                id={`${id}-title`}
                name="title"
                autoFocus
                required
                maxLength={120}
                placeholder="Japon, nous voilà !"
              />
            </div>
            <CatalogPicker
              name="destination_country_id"
              label="Destination (facultative)"
              value={country}
              selectedName={(c) => c.name}
              search={(q) => tripPlaceOptions(guildId, 'countries', q)}
              onSelect={setCountry}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor={`${id}-start`}>Départ (facultatif)</Label>
                <Input id={`${id}-start`} name="start_date" type="date" />
              </div>
              <div>
                <Label htmlFor={`${id}-end`}>Retour (facultatif)</Label>
                <Input id={`${id}-end`} name="end_date" type="date" />
              </div>
            </div>
            <input type="hidden" name="timezone" value={suggestedTripZone(country?.iso_code)} />
            <input type="hidden" name="description" value="" />
            {state.error && <Alert role="alert">{state.error}</Alert>}
            <div className="trip-dialog-actions">
              <Button type="button" variant="ghost" onClick={close}>
                Annuler
              </Button>
              <Button type="submit">{pending ? 'Création…' : 'Créer le voyage'}</Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
