'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Eye, EyeOff, LoaderCircle, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  toast,
} from '@nagi/ui';
import type { DestinationKind } from '@nagi/shared';
import { manageDestination } from './actions';

export function DestinationMenu({
  kind,
  id,
  name,
  version,
  published,
  dependencies,
  backHref,
  detail = false,
}: {
  kind: DestinationKind;
  id: string;
  name: string;
  version: string;
  published: boolean;
  dependencies: string[];
  backHref?: string;
  detail?: boolean;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function mutate(operation: 'publish' | 'unpublish' | 'delete') {
    startTransition(async () => {
      setError('');
      const state = await manageDestination(kind, id, version, operation);
      if (state.error) {
        if (operation === 'delete') setError(state.error);
        else toast.error(state.error);
        return;
      }
      toast.success(state.success);
      setConfirm(false);
      if (operation === 'delete' && backHref) router.replace(backHref);
      else router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Actions pour ${name}`}
            variant={detail ? 'secondary' : 'ghost'}
            size={detail ? 'sm' : 'icon'}
            disabled={pending}
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <MoreHorizontal className="size-5" />
            )}
            {detail && 'Actions'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {!detail && (
            <DropdownMenuItem asChild>
              <Link href={`/admin/${kind}/${id}`}>
                <Pencil className="size-4" /> Consulter et modifier
              </Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => mutate(published ? 'unpublish' : 'publish')}>
            {published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            {published ? 'Dépublier' : 'Publier'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onSelect={() => {
              setError('');
              setConfirm(true);
            }}
          >
            <Trash2 className="size-4" /> Supprimer…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={confirm}
        onOpenChange={(open) => {
          if (!pending) setConfirm(open);
        }}
      >
        <DialogContent>
          <DialogTitle className="pr-6 text-lg font-semibold">Supprimer {name} ?</DialogTitle>
          <DialogDescription className="mt-3 text-sm leading-6 text-muted-foreground">
            {dependencies.length
              ? 'Cette destination a des dépendances. Réaffectez-les ou supprimez-les avant de poursuivre.'
              : 'Cette action supprime définitivement la destination et sa couverture.'}
          </DialogDescription>
          {dependencies.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {dependencies.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          )}
          {error && <Alert className="mt-4 text-destructive">{error}</Alert>}
          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setConfirm(false)}
              disabled={pending}
            >
              {dependencies.length ? 'Fermer' : 'Annuler'}
            </Button>
            {!dependencies.length && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={() => mutate('delete')}
                disabled={pending}
              >
                {pending ? 'Suppression…' : 'Supprimer'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
