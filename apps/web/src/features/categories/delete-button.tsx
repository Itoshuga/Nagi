'use client';

import { useId, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Label,
} from '@nagi/ui';
import type { CatalogCategory } from '@nagi/database';
import { CatalogForm, CatalogSelect } from '@/features/catalog/admin-form';
import { removeCategory } from './actions';
import '@/features/entries/workspace.css';

export function CategoryRemoval({
  category,
  categories,
  count,
}: {
  category: CatalogCategory;
  categories: CatalogCategory[];
  count: number;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [destination, setDestination] = useState('');
  const cancel = useRef<HTMLButtonElement>(null);
  const targets = categories.filter((item) => item.id !== category.id);
  function changeOpen(next: boolean) {
    if (pending) return;
    setOpen(next);
    if (!next) setDestination('');
  }
  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
          Supprimer la catégorie
        </Button>
      </DialogTrigger>
      <DialogContent
        className="entry-editor-dialog max-w-lg"
        closeDisabled={pending}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
      >
        <div className="entry-dialog-heading">
          <DialogTitle>Supprimer la catégorie&nbsp;?</DialogTitle>
          <DialogDescription>
            Cette action est définitive.{' '}
            {count
              ? 'Les fiches doivent être réaffectées à une autre catégorie avant la suppression.'
              : 'Cette catégorie ne contient aucune fiche.'}
          </DialogDescription>
        </div>
        <CatalogForm
          run={removeCategory.bind(null, category.id)}
          onPendingChange={setPending}
          onSuccess={() => setOpen(false)}
        >
          <input type="hidden" name="confirm" value="yes" />
          <div className="entry-dialog-body space-y-5">
            <p className="break-words text-sm leading-7">
              Voulez-vous supprimer <strong>« {category.name} »</strong> ?
            </p>
            {count > 0 &&
              (targets.length ? (
                <div>
                  <Label htmlFor={`${id}-destination`}>Catégorie de destination</Label>
                  <CatalogSelect
                    id={`${id}-destination`}
                    name="destination"
                    value={destination}
                    onChange={(event) => setDestination(event.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Sélectionner une catégorie
                    </option>
                    {targets.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.is_enabled ? '' : ' (désactivée)'}
                      </option>
                    ))}
                  </CatalogSelect>
                  <p className="mt-3 text-xs leading-6 text-muted-foreground">
                    {count} fiche(s) seront conservées avec leurs images, relations et références de
                    voyage. Les champs renseignés doivent être compatibles avec la catégorie
                    choisie.
                  </p>
                </div>
              ) : (
                <Alert>
                  Créez d’abord une autre catégorie pour y réaffecter les {count} fiche(s).
                </Alert>
              ))}
          </div>
          <div className="entry-dialog-footer">
            <Button ref={cancel} type="button" variant="ghost" onClick={() => changeOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="destructive" disabled={count > 0 && !destination}>
              <Trash2 className="size-4" />
              {pending
                ? 'Suppression…'
                : count
                  ? 'Réaffecter et supprimer'
                  : 'Supprimer la catégorie'}
            </Button>
          </div>
        </CatalogForm>
      </DialogContent>
    </Dialog>
  );
}
