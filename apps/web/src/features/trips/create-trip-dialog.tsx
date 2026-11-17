'use client';
import { useActionState } from 'react';
import { LoaderCircle, Plus } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  Input,
  Label,
  Alert,
} from '@nagi/ui';
import { createTrip } from '@/features/spaces/actions';
export function CreateTripDialog({ guildId }: { guildId: string }) {
  const [state, action, pending] = useActionState(createTrip.bind(null, guildId), { error: '' });
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Créer un voyage
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto font-sans">
        <DialogTitle className="pr-6 text-2xl font-extrabold tracking-tight">
          Une nouvelle aventure.
        </DialogTitle>
        <DialogDescription className="mt-3 text-sm leading-6 text-muted-foreground">
          Posez la première idée. Tous les membres de votre espace pourront retrouver ce voyage.
        </DialogDescription>
        <form action={action} className="mt-7 space-y-5" aria-busy={pending}>
          <div>
            <Label htmlFor="trip-title">
              Nom du voyage <span className="text-muted-foreground">*</span>
            </Label>
            <Input
              id="trip-title"
              name="title"
              required
              maxLength={120}
              placeholder="Un week-end ensemble…"
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="trip-description">
              Description{' '}
              <span className="text-xs font-normal text-muted-foreground">facultative</span>
            </Label>
            <textarea
              id="trip-description"
              name="description"
              maxLength={4000}
              rows={3}
              placeholder="Une envie, quelques idées, un point de départ."
              className="w-full resize-y rounded-xl border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/20"
            />
          </div>
          <fieldset>
            <legend className="mb-3 text-sm font-medium">
              Dates <span className="text-xs font-normal text-muted-foreground">facultatives</span>
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="trip-start" className="text-xs">
                  Début
                </Label>
                <Input type="date" id="trip-start" name="start_date" />
              </div>
              <div>
                <Label htmlFor="trip-end" className="text-xs">
                  Fin
                </Label>
                <Input type="date" id="trip-end" name="end_date" />
              </div>
            </div>
          </fieldset>
          {state.error && <Alert>{state.error}</Alert>}
          <Button type="submit" disabled={pending} className="w-full">
            {pending && <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />}
            {pending ? 'Création en cours…' : 'Créer le voyage'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
