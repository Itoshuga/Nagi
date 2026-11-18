'use client';

import { useId, useState } from 'react';
import dynamic from 'next/dynamic';
import { ChevronsUpDown, Shapes } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  Label,
} from '@nagi/ui';
import { FieldIcon } from './field-icon';

const IconBrowser = dynamic(() => import('./browser').then((module) => module.IconBrowser), {
  ssr: false,
  loading: () => (
    <DialogContent className="entry-editor-dialog max-w-3xl">
      <div className="entry-dialog-heading">
        <DialogTitle>Bibliothèque d’icônes</DialogTitle>
        <DialogDescription>Chargement de la bibliothèque…</DialogDescription>
      </div>
      <p role="status" className="entry-dialog-body text-sm text-muted-foreground">
        Chargement…
      </p>
    </DialogContent>
  ),
});

export function IconPicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (name: string | null) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2">
      <input type="hidden" name="icon" value={value ?? ''} />
      <Label htmlFor={`${id}-trigger`} className="mb-0">
        Icône du champ
      </Label>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            id={`${id}-trigger`}
            type="button"
            variant="secondary"
            className="h-auto min-h-12 w-full justify-start rounded-xl px-3 py-2 text-left"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-primary-ink">
              {value ? (
                <FieldIcon name={value} className="size-5" />
              ) : (
                <Shapes className="size-4" />
              )}
            </span>
            <span className="min-w-0 flex-1 truncate">{value ?? 'Choisir une icône'}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </DialogTrigger>
        {open && (
          <IconBrowser
            value={value}
            onSelect={(name) => {
              onChange(name);
              setOpen(false);
            }}
            onClose={() => setOpen(false)}
          />
        )}
      </Dialog>
    </div>
  );
}
