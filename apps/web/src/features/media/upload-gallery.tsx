'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ImagePlus, LoaderCircle, Upload, X } from 'lucide-react';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  toast,
} from '@nagi/ui';
import { uploadEntryImage } from './actions';

type QueuedImage = { id: string; file: File; url: string; error?: string };
const accepted = ['image/jpeg', 'image/png', 'image/webp'];
function fileSize(size: number) {
  if (size < 1024) return `${size} o`;
  const small = size < 1048576;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(size / (small ? 1024 : 1048576))} ${small ? 'Ko' : 'Mo'}`;
}

export function UploadGallery({
  entryId,
  capacity,
  maxFileSize,
  compact,
}: {
  entryId: string;
  capacity: number;
  maxFileSize: number;
  compact: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const urls = useRef(new Set<string>());
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [queue, setQueue] = useState<QueuedImage[]>([]);
  const [message, setMessage] = useState('');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [pending, startTransition] = useTransition();
  const limit = maxFileSize / 1048576;
  useEffect(() => {
    const created = urls.current;
    return () => {
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, []);
  function release(url: string) {
    URL.revokeObjectURL(url);
    urls.current.delete(url);
  }
  function close(next: boolean) {
    if (busy.current) return;
    setOpen(next);
    if (!next) {
      queue.forEach((item) => release(item.url));
      setQueue([]);
      setMessage('');
    }
  }
  function choose(files: FileList | null) {
    if (!files?.length || busy.current) return;
    setMessage('');
    setProgress(0);
    setOpen(true);
    const selected = Array.from(files);
    if (selected.length + queue.length > capacity) {
      setMessage(
        `Vous pouvez sélectionner encore ${Math.max(0, capacity - queue.length)} image(s).`,
      );
      return;
    }
    const errors: string[] = [];
    const valid = selected.flatMap((file) => {
      if (!accepted.includes(file.type)) {
        errors.push(`${file.name} : choisissez un fichier JPEG, PNG ou WebP.`);
        return [];
      }
      if (!file.size || file.size > maxFileSize) {
        errors.push(`${file.name} : l’image doit peser entre 1 octet et ${limit} Mo.`);
        return [];
      }
      const url = URL.createObjectURL(file);
      urls.current.add(url);
      return [{ id: crypto.randomUUID(), file, url }];
    });
    setQueue((current) => [...current, ...valid]);
    setMessage(errors.join('\n'));
  }
  function send() {
    if (!queue.length || busy.current) return;
    if (queue.length > capacity) {
      setMessage('La galerie a changé. Retirez des images de cet envoi et réessayez.');
      return;
    }
    busy.current = true;
    setTotal(queue.length);
    setProgress(0);
    startTransition(async () => {
      setMessage('');
      const failed: QueuedImage[] = [];
      let uploaded = 0;
      try {
        for (const [index, item] of queue.entries()) {
          const data = new FormData();
          data.set('file', item.file);
          try {
            const result = await uploadEntryImage(entryId, null, null, data);
            if (result.ok) {
              uploaded++;
              release(item.url);
            } else failed.push({ ...item, error: result.message });
          } catch {
            failed.push({ ...item, error: 'Envoi interrompu. Réessayez.' });
          }
          setProgress(index + 1);
        }
        setQueue(failed);
        if (uploaded)
          toast.success(
            `${uploaded} image${uploaded > 1 ? 's ajoutées' : ' ajoutée'} à la galerie.`,
          );
        if (!failed.length) setOpen(false);
        else
          setMessage(
            'Certaines images n’ont pas pu être ajoutées. Les autres sont déjà enregistrées ; vous pouvez réessayer cet envoi.',
          );
        router.refresh();
      } finally {
        busy.current = false;
      }
    });
  }
  const drop = {
    onDragOver: (event: React.DragEvent) => {
      event.preventDefault();
      if (!pending) setDragging(true);
    },
    onDragLeave: (event: React.DragEvent) => {
      if (
        !(event.relatedTarget instanceof Node) ||
        !event.currentTarget.contains(event.relatedTarget)
      )
        setDragging(false);
    },
    onDrop: (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      choose(event.dataTransfer.files);
    },
  };
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accepted.join(',')}
        multiple
        hidden
        onChange={(event) => {
          choose(event.target.files);
          event.target.value = '';
        }}
      />
      <div
        {...drop}
        data-dragging={dragging}
        className={`entry-upload-zone ${compact ? 'flex flex-wrap items-center justify-between gap-4 p-5' : 'grid min-h-64 justify-items-center gap-4 px-5 py-10 text-center'}`}
      >
        <div className={compact ? 'flex items-center gap-4' : 'grid justify-items-center gap-4'}>
          <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-primary-ink">
            <ImagePlus className="size-5" strokeWidth={1.6} />
          </span>
          <div>
            <p className="text-sm font-bold">
              {compact ? 'Une autre perspective ?' : 'Donnez vie à votre fiche.'}
            </p>
            <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
              Déposez vos images ici, ou choisissez-les sur votre appareil.
              <br />
              JPEG, PNG, WebP · {limit} Mo maximum par image
            </p>
          </div>
        </div>
        <Button
          ref={trigger}
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => input.current?.click()}
        >
          <Upload className="size-3.5" />
          {compact ? 'Ajouter des images' : 'Choisir des images'}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent
          closeDisabled={pending}
          className="entry-editor-dialog max-w-2xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
        >
          <div className="entry-dialog-heading">
            <DialogTitle>Ajouter des images</DialogTitle>
            <DialogDescription>
              Vérifiez votre sélection avant l’envoi. Vous pourrez ensuite choisir la couverture et
              organiser la galerie.
            </DialogDescription>
          </div>
          <div className="entry-dialog-body space-y-5" aria-busy={pending}>
            {message && <Alert className="whitespace-pre-line">{message}</Alert>}
            {queue.length > 0 && (
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {queue.map((item) => (
                  <li
                    key={item.id}
                    className="min-w-0 overflow-hidden rounded-2xl border border-border"
                  >
                    <div className="relative aspect-[4/3] bg-muted">
                      <Image
                        src={item.url}
                        alt={item.file.name}
                        fill
                        unoptimized
                        sizes="200px"
                        className="object-cover"
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        disabled={pending}
                        className="absolute right-2 top-2 size-7 bg-card"
                        aria-label={`Retirer ${item.file.name} de l’envoi`}
                        onClick={() => {
                          release(item.url);
                          setQueue((current) => current.filter((file) => file.id !== item.id));
                        }}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                    <div className="p-3">
                      <p title={item.file.name} className="truncate text-xs font-semibold">
                        {item.file.name}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {fileSize(item.file.size)}
                      </p>
                      {item.error && <p className="mt-2 text-xs text-destructive">{item.error}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div
              {...drop}
              className="entry-upload-zone flex flex-wrap items-center justify-between gap-3 p-4"
              data-dragging={dragging}
            >
              <p className="text-xs text-muted-foreground">
                {queue.length} image(s) sélectionnée(s) · {capacity} place(s) disponible(s)
              </p>
              <Button
                variant="ghost"
                size="sm"
                disabled={pending || queue.length >= capacity}
                onClick={() => input.current?.click()}
                type="button"
              >
                <ImagePlus className="size-3.5" />
                Compléter la sélection
              </Button>
            </div>
            {pending && (
              <div role="status" className="space-y-2">
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
                  Envoi des images · {progress} sur {total}
                </p>
                <progress
                  aria-label="Progression de l’envoi"
                  className="h-1.5 w-full accent-primary-ink"
                  max={total}
                  value={progress}
                />
              </div>
            )}
          </div>
          <div className="entry-dialog-footer">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => close(false)}>
              Annuler
            </Button>
            <Button type="button" disabled={pending || !queue.length} onClick={send}>
              {pending ? (
                <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" />
              ) : (
                <Check className="size-4" />
              )}
              {pending
                ? 'Envoi en cours…'
                : `Ajouter ${queue.length || ''} image${queue.length > 1 ? 's' : ''}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
