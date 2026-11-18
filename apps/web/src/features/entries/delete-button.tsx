'use client';

import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@nagi/ui';
import { CatalogForm } from '@/features/catalog/admin-form';
import { deleteEntry } from './actions';

export function DeleteEntryButton({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
          Supprimer la fiche
        </Button>
      </DialogTrigger>
      <DialogContent
        className="entry-editor-dialog max-w-md"
        closeDisabled={pending}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
      >
        <div className="entry-dialog-heading">
          <DialogTitle>Supprimer la fiche&nbsp;?</DialogTitle>
          <DialogDescription>
            Cette action est définitive. Les images et les relations de la fiche seront également
            retirées.
          </DialogDescription>
        </div>
        <CatalogForm
          run={deleteEntry.bind(null, id)}
          onPendingChange={setPending}
          onSuccess={() => setOpen(false)}
        >
          <input type="hidden" name="confirm" value="yes" />
          <div className="entry-dialog-body">
            <p className="break-words text-sm leading-7">
              Voulez-vous vraiment supprimer <strong>« {title} »</strong> ?
            </p>
          </div>
          <div className="entry-dialog-footer">
            <Button ref={cancel} type="button" variant="ghost" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="submit" variant="destructive">
              <Trash2 className="size-4" />
              {pending ? 'Suppression…' : 'Supprimer la fiche'}
            </Button>
          </div>
        </CatalogForm>
      </DialogContent>
    </Dialog>
  );
}
