'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { UserIdentity } from '@/features/profiles/identity';
import { Alert, Button, Card, Input, Label } from '@nagi/ui';
import { suggestedTripZone } from '@nagi/shared';
import type { CatalogLocation, Trip, TripService } from '@nagi/database';
import { CatalogPicker } from '@/features/catalog/picker';
import { CatalogSelect, CatalogTextarea } from '@/features/catalog/admin-form';
import { editTrip, tripPlaceOptions, type TripFormState } from './actions';
import { tripStatus } from './trip-list';

export function TripSettingsForm({
  guild,
  trip,
  destination,
  timezones,
  run,
}: {
  guild: string;
  trip?: Trip;
  destination?: CatalogLocation;
  timezones: readonly string[];
  run: (state: TripFormState, form: FormData) => Promise<TripFormState>;
}) {
  const [state, action, pending] = useActionState(run, { error: '' });
  const [version] = useState(trip?.version ?? 0);
  const [country, setCountry] = useState(destination);
  const [timezone, setTimezone] = useState(
    trip?.timezone ?? suggestedTripZone(destination?.iso_code),
  );
  const [manualZone, setManualZone] = useState(Boolean(trip));
  const [preview, setPreview] = useState<string>();
  const zoneList = useId();
  useEffect(() => {
    if (preview) return () => URL.revokeObjectURL(preview);
  }, [preview]);
  return (
    <form action={action} className="space-y-4" aria-busy={pending}>
      <input type="hidden" name="version" value={version} />
      <Card className="space-y-5">
        <fieldset disabled={pending} className="min-w-0 space-y-5">
          <div>
            <Label htmlFor="trip-title">Nom du voyage</Label>
            <Input
              id="trip-title"
              name="title"
              maxLength={120}
              defaultValue={trip?.title}
              required
              placeholder="Japon — été 2027"
            />
          </div>
          <CatalogPicker
            name="destination_country_id"
            label="Destination principale (facultatif)"
            value={country}
            selectedName={(item) => item.name}
            search={(query) => tripPlaceOptions(guild, 'countries', query)}
            onSelect={(next) => {
              setCountry(next);
              if (!manualZone) setTimezone(suggestedTripZone(next?.iso_code));
            }}
          />
          <div>
            <Label htmlFor="trip-description">Description (facultatif)</Label>
            <CatalogTextarea
              id="trip-description"
              name="description"
              maxLength={4000}
              rows={3}
              defaultValue={trip?.description}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="trip-start">Départ</Label>
              <Input
                type="date"
                id="trip-start"
                name="start_date"
                defaultValue={trip?.start_date ?? ''}
              />
            </div>
            <div>
              <Label htmlFor="trip-end">Retour</Label>
              <Input
                type="date"
                id="trip-end"
                name="end_date"
                defaultValue={trip?.end_date ?? ''}
              />
            </div>
          </div>
          {trip && (
            <p className="text-sm text-muted-foreground">
              Les journées hors de la nouvelle période restent visibles dans l’itinéraire. Vous
              pourrez les redater ou déplacer leurs étapes.
            </p>
          )}
          <div>
            <Label htmlFor="trip-zone">Fuseau horaire du voyage</Label>
            <Input
              id="trip-zone"
              name="timezone"
              list={zoneList}
              value={timezone}
              required
              onChange={(event) => {
                setManualZone(true);
                setTimezone(event.target.value);
              }}
            />
            <datalist id={zoneList}>
              {timezones.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
          </div>
          {trip && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="trip-status">Statut</Label>
                <CatalogSelect id="trip-status" name="status" defaultValue={trip.status}>
                  {Object.entries(tripStatus).map(([status, label]) => (
                    <option key={status} value={status}>
                      {label}
                    </option>
                  ))}
                </CatalogSelect>
              </div>
              <div>
                <Label htmlFor="trip-collaboration">Qui peut modifier l’itinéraire ?</Label>
                <CatalogSelect
                  id="trip-collaboration"
                  name="collaboration_mode"
                  defaultValue={trip.collaboration_mode}
                >
                  <option value="all_members">Tous les membres du serveur</option>
                  <option value="organizers_only">Les organisateurs</option>
                </CatalogSelect>
              </div>
            </div>
          )}
          <div>
            <Label htmlFor="trip-cover">Couverture personnalisée (facultatif)</Label>
            <Input
              id="trip-cover"
              name="cover"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="h-auto py-2"
              onChange={(event) => {
                const file = event.target.files?.[0];
                setPreview(file ? URL.createObjectURL(file) : undefined);
              }}
            />
            {preview && (
              <div className="relative mt-3 aspect-[16/7] max-w-lg overflow-hidden rounded-xl">
                <Image
                  alt="Aperçu de la couverture"
                  src={preview}
                  fill
                  unoptimized
                  className="object-cover"
                />
              </div>
            )}
            {trip?.cover_image_url && (
              <label className="mt-3 flex items-center gap-2 text-sm">
                <input type="checkbox" name="remove_cover" value="yes" /> Retirer la couverture
                actuelle
              </label>
            )}
          </div>
        </fieldset>
      </Card>
      {state.error && <Alert role="alert">{state.error}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? 'Enregistrement…' : trip ? 'Enregistrer le voyage' : 'Créer le voyage'}
      </Button>
    </form>
  );
}

type Organizers = Awaited<ReturnType<TripService['organizerCards']>>;
export function TripOrganizers({
  guild,
  trip,
  organizers,
}: {
  guild: string;
  trip: Trip;
  organizers: Organizers;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(
    async (_state: TripFormState, form: FormData) => {
      const id = String(form.get('remove') ?? '');
      const response = await editTrip(
        guild,
        trip.id,
        trip.version,
        id
          ? { operation: 'organizer_remove', data: { id } }
          : {
              operation: 'organizer_add',
              data: { discord_id: String(form.get('discord_id') ?? '') },
            },
      );
      if (response.ok || response.reason === 'conflict') router.refresh();
      return { error: response.ok ? '' : response.error };
    },
    { error: '' },
  );
  return (
    <Card className="space-y-4">
      <h2 className="text-lg font-bold">Organisateurs</h2>
      {organizers.length === 0 && (
        <p className="text-sm leading-6 text-muted-foreground">
          Ce voyage n’a plus d’organisateur. Vous pouvez en ajouter un en tant qu’administrateur
          Discord de cet espace.
        </p>
      )}
      <ul className="space-y-2">
        {organizers.map((person) => (
          <li
            key={person.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-2.5"
          >
            <UserIdentity
              user={{
                id: person.id,
                username: person.username,
                display_name: person.name,
                avatar_url: person.avatar,
              }}
            />
            {person.id === trip.created_by ? (
              <span className="text-xs text-muted-foreground">Créateur du voyage</span>
            ) : (
              <form action={action}>
                <button
                  value={person.id}
                  name="remove"
                  disabled={pending}
                  className="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Retirer
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
      <form action={action} className="space-y-2">
        <Label htmlFor="organizer-discord">Identifiant Discord d’un membre</Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id="organizer-discord"
            name="discord_id"
            inputMode="numeric"
            pattern="[0-9]{17,20}"
            className="sm:max-w-72"
            required
          />
          <Button size="sm" variant="secondary" disabled={pending}>
            Ajouter un organisateur
          </Button>
        </div>
      </form>
      {state.error && <Alert role="alert">{state.error}</Alert>}
    </Card>
  );
}

export function TripDeleteForm({
  version,
  run,
}: {
  version: number;
  run: (state: TripFormState, form: FormData) => Promise<TripFormState>;
}) {
  const [state, action, pending] = useActionState(run, { error: '' });
  return (
    <details className="rounded-2xl border border-border p-5">
      <summary className="cursor-pointer rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">
        Supprimer le voyage
      </summary>
      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="version" value={version} />
        <p className="text-sm text-muted-foreground">
          La suppression retire les journées et les notes de cet itinéraire.
        </p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="confirm" value="yes" required /> Confirmer la suppression
        </label>
        {state.error && <Alert role="alert">{state.error}</Alert>}
        <Button variant="destructive" size="sm" disabled={pending}>
          Supprimer le voyage
        </Button>
      </form>
    </details>
  );
}
