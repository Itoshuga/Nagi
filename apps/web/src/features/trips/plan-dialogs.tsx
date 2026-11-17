'use client';

import Link from 'next/link';
import { useId, useState, useTransition, type FormEvent } from 'react';
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
import type { CatalogRelation, TripPlan, TripPlanItem, TripPlannerDay } from '@nagi/database';
import { CatalogTextarea } from '@/features/catalog/admin-form';
import { entryHref } from '@/features/entries/links';
import { EntryImage } from '@/features/media/image';
import { tripRelatedPlaces } from './actions';
import { AddPlaceDialog, TripDaySelect } from './add-place-dialog';
import type { PlanMutation } from './planner-model';

export function TripDayEditor({
  plan,
  day,
  mutate,
  children,
}: {
  plan: TripPlan;
  day?: TripPlannerDay;
  mutate: PlanMutation;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const [base, setBase] = useState(plan.version);
  const titleId = useId(),
    dateId = useId(),
    removeId = useId();
  const remaining = plan.days.filter((other) => other.id !== day?.id);
  const count = day ? plan.items.filter((item) => item.trip_day_id === day.id).length : 0;
  function submit(event: FormEvent<HTMLFormElement>, remove = false) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') ?? ''),
      date = String(form.get('date') ?? '') || null;
    startTransition(async () => {
      const result = await mutate(
        remove && day
          ? {
              operation: 'delete_day',
              data: { id: day.id, day: String(form.get('day') ?? '') || null },
            }
          : day
            ? { operation: 'edit_day', data: { id: day.id, title, date } }
            : { operation: 'add_day', data: { title, date } },
        base,
      );
      if (result.ok) {
        setOpen(false);
        setError('');
      } else setError(result.error);
    });
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          if (value) setBase(plan.version);
          setOpen(value);
          setError('');
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogTitle className="pr-6 text-xl font-bold">
          {day ? 'Modifier la journée' : 'Ajouter une journée'}
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm text-muted-foreground">
          Donnez un titre ou une date à cette journée.
        </DialogDescription>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <div>
            <Label htmlFor={titleId}>Titre (facultatif)</Label>
            <Input
              id={titleId}
              name="title"
              maxLength={160}
              defaultValue={day?.title}
              placeholder="Une journée à Tokyo"
            />
          </div>
          <div>
            <Label htmlFor={dateId}>Date (facultative)</Label>
            <Input id={dateId} name="date" type="date" defaultValue={day?.date ?? ''} />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? 'Enregistrement…' : day ? 'Enregistrer' : 'Ajouter la journée'}
          </Button>
        </form>
        {day && (
          <details className="mt-5 border-t border-border pt-4">
            <summary className="cursor-pointer rounded text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
              Supprimer cette journée
            </summary>
            <form onSubmit={(event) => submit(event, true)} className="mt-3 space-y-3">
              <p className="text-sm text-muted-foreground">
                {count
                  ? `Choisissez où conserver les ${count} étape(s) de cette journée.`
                  : 'Cette journée ne contient aucune étape.'}
              </p>
              {count > 0 && (
                <div>
                  <Label htmlFor={removeId}>Déplacer les étapes vers</Label>
                  <TripDaySelect id={removeId} days={remaining} />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" required /> Confirmer le retrait de la journée
              </label>
              <Button type="submit" variant="destructive" size="sm" disabled={pending}>
                Supprimer la journée
              </Button>
            </form>
          </details>
        )}
        {error && (
          <Alert className="mt-3" role="alert">
            {error}
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RelatedSuggestions({
  guild,
  plan,
  item,
  canEdit,
}: {
  guild: string;
  plan: TripPlan;
  item: TripPlanItem;
  canEdit: boolean;
}) {
  const [related, setRelated] = useState<CatalogRelation[]>();
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!item.entry) return null;
  return (
    <details
      className="border-t border-border pt-4"
      onToggle={(event) => {
        if (!event.currentTarget.open || related || pending) return;
        startTransition(async () => {
          try {
            setRelated(await tripRelatedPlaces(guild, plan.id, item.id));
            setError(false);
          } catch {
            setError(true);
          }
        });
      }}
    >
      <summary className="cursor-pointer rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">
        Suggestions du catalogue
      </summary>
      {pending && (
        <p role="status" className="mt-2 text-sm text-muted-foreground">
          Chargement…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-muted-foreground">
          Les suggestions sont indisponibles.
        </p>
      )}
      {related?.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">Aucune fiche liée publiée.</p>
      )}
      {related && related.length > 0 && (
        <ul className="mt-2 space-y-3">
          {related.map(({ id, entry, type, isIncoming }) => (
            <li
              key={id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-2"
            >
              <Link
                href={entryHref(guild, entry)}
                className="flex min-w-0 flex-1 items-center gap-2 text-sm hover:underline"
              >
                <EntryImage
                  src={entry.cover_image_url}
                  className="size-10 shrink-0 rounded-lg"
                  sizes="40px"
                />
                <span>
                  <small className="block text-muted-foreground">
                    {isIncoming ? type.inverse_label : type.forward_label}
                  </small>
                  {entry.title}
                </span>
              </Link>
              {canEdit && (
                <AddPlaceDialog
                  guildId={guild}
                  trip={plan}
                  entry={entry}
                  initialDay={item.trip_day_id}
                >
                  <Button variant="secondary" size="sm">
                    Ajouter au voyage
                  </Button>
                </AddPlaceDialog>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export function TripStepDialog({
  guild,
  plan,
  item,
  mutate,
  canEdit,
  children,
}: {
  guild: string;
  plan: TripPlan;
  item: TripPlanItem;
  mutate: PlanMutation;
  canEdit: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [day, setDay] = useState<string | null>(null);
  const [base, setBase] = useState({ trip: plan.version, item: item.version });
  const [pending, startTransition] = useTransition();
  const prefix = useId();
  const activeDay = day ?? item.trip_day_id ?? '';
  function submit(change: Parameters<PlanMutation>[0]) {
    startTransition(async () => {
      const result = await mutate(change, base.trip);
      if (result.ok) {
        setOpen(false);
        setError('');
      } else setError(result.error);
    });
  }
  function edit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const start = String(form.get('start') ?? ''),
      end = String(form.get('end') ?? ''),
      duration = String(form.get('duration') ?? '');
    submit({
      operation: 'edit_item',
      data: {
        id: item.id,
        item_version: base.item,
        start_time: start || null,
        end_time: end || null,
        duration: duration ? Number(duration) : null,
        notes: String(form.get('notes') ?? ''),
      },
    });
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          if (value) setBase({ trip: plan.version, item: item.version });
          setOpen(value);
          setDay(null);
          setError('');
        }
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90svh] max-w-xl overflow-y-auto">
        <DialogTitle className="break-words pr-6 text-xl font-bold">
          {item.entry?.title ?? 'Fiche indisponible'}
        </DialogTitle>
        <DialogDescription className="mt-1 text-sm text-muted-foreground">
          {item.entry?.category?.name ?? 'Les notes et horaires de cette étape sont conservés.'}
        </DialogDescription>
        <div className="mt-4 space-y-4">
          {item.entry && (
            <Link
              href={entryHref(guild, item.entry)}
              className="text-sm font-semibold text-primary-ink underline underline-offset-4"
            >
              Ouvrir la fiche Nagi
            </Link>
          )}
          {canEdit ? (
            <>
              <form onSubmit={edit} className="space-y-3">
                <fieldset disabled={pending} className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <Label htmlFor={`${prefix}-start`}>Début</Label>
                      <Input
                        id={`${prefix}-start`}
                        type="time"
                        name="start"
                        defaultValue={item.start_time?.slice(0, 5)}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${prefix}-end`}>Fin</Label>
                      <Input
                        id={`${prefix}-end`}
                        type="time"
                        name="end"
                        defaultValue={item.end_time?.slice(0, 5)}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`${prefix}-duration`}>Durée (min)</Label>
                      <Input
                        id={`${prefix}-duration`}
                        type="number"
                        name="duration"
                        min={1}
                        max={1440}
                        defaultValue={item.estimated_duration_minutes ?? ''}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor={`${prefix}-notes`}>Notes du voyage</Label>
                    <CatalogTextarea
                      id={`${prefix}-notes`}
                      name="notes"
                      defaultValue={item.notes}
                      maxLength={4000}
                    />
                  </div>
                  <Button type="submit" size="sm">
                    {pending ? 'Enregistrement…' : 'Enregistrer l’étape'}
                  </Button>
                </fieldset>
              </form>
              <div className="border-t border-border pt-3">
                <Label htmlFor={`${prefix}-move`}>Déplacer vers</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-40 flex-1">
                    <TripDaySelect
                      id={`${prefix}-move`}
                      days={plan.days}
                      value={activeDay}
                      onChange={setDay}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={pending || activeDay === (item.trip_day_id ?? '')}
                    onClick={() =>
                      submit({
                        operation: 'move_item',
                        data: { id: item.id, day: activeDay || null, before: null },
                      })
                    }
                  >
                    Déplacer
                  </Button>
                </div>
              </div>
              <details className="border-t border-border pt-3">
                <summary className="cursor-pointer rounded text-sm focus-visible:outline-2 focus-visible:outline-ring">
                  Retirer l’étape du voyage
                </summary>
                <p className="mt-2 text-sm text-muted-foreground">
                  Les notes et horaires de cette étape seront retirés.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  className="mt-2"
                  disabled={pending}
                  onClick={() => submit({ operation: 'delete_item', data: { id: item.id } })}
                >
                  Confirmer le retrait
                </Button>
              </details>
            </>
          ) : (
            item.notes && <p className="whitespace-pre-wrap break-words text-sm">{item.notes}</p>
          )}
          {error && <Alert role="alert">{error}</Alert>}
          <RelatedSuggestions guild={guild} plan={plan} item={item} canEdit={canEdit} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
