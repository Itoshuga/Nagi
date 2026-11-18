'use client';

import { useEffect, useRef, useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle, RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
  toast,
} from '@nagi/ui';
import type { EntryMedia } from '@nagi/database';
import { CatalogTextarea } from '@/features/catalog/admin-form';
import type { CatalogResult } from '@/features/catalog/mutations';
import { changeEntryImage, uploadEntryImage } from './actions';
import { EntryImage } from './image';
import { entryMediaUrl } from './model';

export type ImageEditorMode = 'alt' | 'replace' | 'remove';
export function ImageEditor({
  media,
  mode,
  cover,
  maxFileSize,
  onClose,
  returnFocus,
}: {
  media: EntryMedia;
  mode: ImageEditorMode;
  cover: boolean;
  maxFileSize: number;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const preview = useRef<string | null>(null);
  const [file, setFile] = useState<File>();
  const [fileUrl, setFileUrl] = useState<string>();
  const [alt, setAlt] = useState(media.alt_text);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  useEffect(
    () => () => {
      if (preview.current) URL.revokeObjectURL(preview.current);
    },
    [],
  );
  function choose(selected?: File) {
    setError('');
    if (!selected) return;
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) ||
      !selected.size ||
      selected.size > maxFileSize
    ) {
      setError(`Choisissez une image JPEG, PNG ou WebP de ${maxFileSize / 1048576} Mo maximum.`);
      return;
    }
    if (preview.current) URL.revokeObjectURL(preview.current);
    preview.current = URL.createObjectURL(selected);
    setFileUrl(preview.current);
    setFile(selected);
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const values = new FormData();
    values.set('alt_text', mode === 'replace' ? media.alt_text : alt);
    if (mode === 'remove') values.set('confirm', 'yes');
    if (mode === 'replace') {
      if (!file) return;
      values.set('file', file);
    }
    startTransition(async () => {
      setError('');
      try {
        const result: CatalogResult =
          mode === 'replace'
            ? await uploadEntryImage(media.entry_id, media.id, media.version, values)
            : await changeEntryImage(media.entry_id, media.id, media.version, mode, values);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        toast.success(
          mode === 'alt'
            ? 'Description de l’image enregistrée.'
            : mode === 'replace'
              ? 'Image remplacée.'
              : 'Image retirée.',
        );
        onClose();
        router.refresh();
      } catch {
        setError('La modification n’a pas abouti. Réessayez.');
      }
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        closeDisabled={pending}
        className={`entry-editor-dialog ${mode === 'remove' ? 'max-w-md' : 'max-w-3xl'}`}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
      >
        <div className="entry-dialog-heading">
          <DialogTitle>
            {mode === 'alt'
              ? 'Les détails de votre image'
              : mode === 'replace'
                ? 'Remplacer l’image'
                : 'Retirer cette image ?'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'alt'
              ? 'Une description précise rend votre fiche accessible à tous.'
              : mode === 'replace'
                ? 'Gardez sa place dans la galerie et sa description, avec une nouvelle image.'
                : 'L’image sera retirée de cette fiche. Cette action est définitive.'}
          </DialogDescription>
        </div>
        <form onSubmit={save} aria-busy={pending}>
          <fieldset disabled={pending} className="min-w-0">
            <div
              className={
                mode === 'remove'
                  ? 'entry-dialog-body space-y-4'
                  : 'entry-dialog-body grid gap-6 sm:grid-cols-[1.1fr_1fr]'
              }
            >
              <div>
                <EntryImage
                  src={fileUrl ?? entryMediaUrl(media)}
                  alt={alt}
                  fit="contain"
                  className={`${mode === 'remove' ? 'aspect-[2/1]' : 'aspect-[16/10] sm:aspect-square'} entry-file-preview rounded-2xl`}
                  sizes="(max-width: 640px) 90vw, 400px"
                />
                {cover && (
                  <p className="mt-3 text-center text-[11px] font-semibold text-primary-ink">
                    Couverture actuelle de la fiche
                  </p>
                )}
              </div>
              <div className="min-w-0 space-y-4">
                {mode === 'alt' && (
                  <>
                    <div>
                      <Label htmlFor="image-alt">Texte alternatif</Label>
                      <CatalogTextarea
                        id="image-alt"
                        name="alt_text"
                        maxLength={220}
                        rows={5}
                        value={alt}
                        onChange={(event) => setAlt(event.target.value)}
                        placeholder="Ex. Une allée bordée de cerisiers en fleurs, au printemps."
                      />
                      <p className="mt-2 flex justify-between gap-3 text-[11px] leading-5 text-muted-foreground">
                        <span>Décrivez ce que l’on voit, sans commencer par « image de ».</span>
                        <span className="shrink-0 tabular-nums">{alt.length}/220</span>
                      </p>
                    </div>
                  </>
                )}
                {mode === 'replace' && (
                  <>
                    <Label htmlFor="replacement-file">Nouveau fichier</Label>
                    <Input
                      ref={fileInput}
                      type="file"
                      id="replacement-file"
                      className="sr-only"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => {
                        choose(event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                    <div className="entry-upload-zone space-y-4 p-5">
                      <Upload className="size-5 text-primary-ink" />
                      <p className="break-all text-xs font-semibold">
                        {file?.name ?? 'Sélectionnez une nouvelle image.'}
                      </p>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => fileInput.current?.click()}
                      >
                        <RefreshCw className="size-3.5" />
                        {file ? 'Choisir un autre fichier' : 'Choisir une image'}
                      </Button>
                      <p className="text-[11px] leading-5 text-muted-foreground">
                        JPEG, PNG ou WebP · {maxFileSize / 1048576} Mo maximum
                      </p>
                    </div>
                  </>
                )}
                {mode === 'remove' && (
                  <p className="text-sm leading-7 text-muted-foreground">
                    {cover
                      ? 'Une autre image de la galerie sera utilisée en couverture, s’il en reste.'
                      : 'Les autres images de la galerie seront conservées.'}
                  </p>
                )}
                {error && <Alert className="border-destructive/30">{error}</Alert>}
              </div>
            </div>
            <div className="entry-dialog-footer">
              <Button type="button" variant="ghost" onClick={onClose}>
                Annuler
              </Button>
              <Button
                type="submit"
                variant={mode === 'remove' ? 'destructive' : 'default'}
                disabled={mode === 'replace' && !file}
              >
                {pending ? (
                  <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
                ) : mode === 'remove' ? (
                  <Trash2 className="size-4" />
                ) : (
                  <Save className="size-4" />
                )}
                {pending
                  ? 'Enregistrement…'
                  : mode === 'alt'
                    ? 'Enregistrer la description'
                    : mode === 'replace'
                      ? 'Remplacer l’image'
                      : 'Retirer l’image'}
              </Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
