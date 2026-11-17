'use client';
import { useActionState, useEffect, useState } from 'react';
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
  toast,
} from '@nagi/ui';
import { addCategory } from './actions';
export function CategoryDialog() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addCategory, { ok: false, message: '' });
  useEffect(() => {
    if (state.ok) {
      toast.success(state.message);
    }
  }, [state]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-3.5" />
          Ajouter une catégorie
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="pr-7 font-display text-2xl">
          Une nouvelle façon d’explorer
        </DialogTitle>
        <DialogDescription className="mt-3 text-sm leading-6 text-muted-foreground">
          Cette catégorie sera partagée par le site et le bot.
        </DialogDescription>
        <form action={action} className="mt-7 space-y-5">
          <div>
            <Label htmlFor="category-name">Nom</Label>
            <Input
              id="category-name"
              name="name"
              required
              maxLength={80}
              autoComplete="off"
              placeholder="Ex. Nature"
            />
          </div>
          <div>
            <Label htmlFor="category-slug">Slug</Label>
            <Input
              id="category-slug"
              name="slug"
              required
              maxLength={100}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              autoComplete="off"
              placeholder="ex. nature"
            />
            <p className="mt-2 text-xs text-muted-foreground">Minuscules, chiffres et tirets.</p>
          </div>
          <div>
            <Label htmlFor="category-position">Position dans la liste</Label>
            <Input
              id="category-position"
              name="position"
              type="number"
              required
              min={0}
              step={1}
              defaultValue={0}
            />
          </div>
          {state.message && <Alert>{state.message}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Fermer
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Enregistrement…' : 'Créer la catégorie'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
