'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  Image as ImageIcon,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Star,
  Trash2,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  toast,
} from '@nagi/ui';
import type { EntryMedia } from '@nagi/database';
import { SortableCatalog } from '@/features/catalog/sortable';
import { autoEntryCover, changeEntryImage, orderEntryMedia } from './actions';
import { EntryImage } from './image';
import { entryMediaUrl } from './model';
import { ImageEditor, type ImageEditorMode } from './image-editor';
import { UploadGallery } from './upload-gallery';

type EditImage = (media: EntryMedia, mode: ImageEditorMode, trigger: HTMLElement | null) => void;
function ImageActions({
  media,
  cover,
  edit,
  index,
}: {
  media: EntryMedia;
  cover: boolean;
  edit: EditImage;
  index: number;
}) {
  const router = useRouter();
  const trigger = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          ref={trigger}
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Actions de l’image ${index + 1}`}
          disabled={pending}
        >
          {pending ? (
            <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <MoreHorizontal className="size-4" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="entry-media-menu">
        <DropdownMenuItem onSelect={() => edit(media, 'alt', trigger.current)}>
          <Pencil className="size-4" />
          Modifier la description
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={media.is_cover}
          onSelect={() =>
            startTransition(async () => {
              try {
                const result = await changeEntryImage(
                  media.entry_id,
                  media.id,
                  media.version,
                  'cover',
                  new FormData(),
                );
                if (result.ok) {
                  toast.success('Couverture sélectionnée.');
                  router.refresh();
                } else toast.error(result.message);
              } catch {
                toast.error('Impossible de choisir cette couverture. Réessayez.');
              }
              requestAnimationFrame(() => trigger.current?.focus());
            })
          }
        >
          {cover ? <Check className="size-4" /> : <Star className="size-4" />}
          {media.is_cover
            ? 'Couverture actuelle'
            : cover
              ? 'Fixer cette couverture'
              : 'Choisir comme couverture'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => edit(media, 'replace', trigger.current)}>
          <RefreshCw className="size-4" />
          Remplacer le fichier
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive"
          onSelect={() => edit(media, 'remove', trigger.current)}
        >
          <Trash2 className="size-4" />
          Retirer l’image…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AdminGallery({
  entryId,
  media,
  cover,
  maxFileSize,
}: {
  entryId: string;
  media: EntryMedia[];
  cover: string | null;
  maxFileSize: number;
}) {
  const router = useRouter();
  const restore = useRef<HTMLElement | null>(null);
  const gallery = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<{ id: string; mode: ImageEditorMode }>();
  const [pending, startTransition] = useTransition();
  const selected = media.find((item) => item.id === editing?.id);
  function edit(item: EntryMedia, mode: ImageEditorMode, trigger: HTMLElement | null) {
    restore.current = trigger;
    setEditing({ id: item.id, mode });
  }
  return (
    <Card
      ref={gallery}
      id="medias"
      role="region"
      aria-label="Galerie de la fiche"
      tabIndex={-1}
      className="space-y-6 p-5 sm:p-7"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="entry-dialog-label mb-2">L’identité visuelle</p>
          <h2 className="text-2xl font-extrabold tracking-tight">Votre galerie</h2>
          <p className="mt-2 max-w-xl text-xs leading-6 text-muted-foreground">
            Cliquez sur une image pour la décrire. Déplacez les images pour raconter votre fiche
            dans le bon ordre.
          </p>
        </div>
        <Badge className="gap-2">
          <ImageIcon className="size-3.5" />
          {media.length}/20 images
        </Badge>
      </div>
      {media.length > 0 && (
        <>
          <SortableCatalog
            layout="grid"
            items={media}
            label={(item) => item.alt_text || `Image ${item.sort_order + 1}`}
            save={orderEntryMedia.bind(null, entryId)}
            actions={(item, index) => (
              <ImageActions
                media={item}
                index={index}
                cover={entryMediaUrl(item) === cover}
                edit={edit}
              />
            )}
            render={(item, index) => (
              <button
                type="button"
                className="entry-media-tile"
                aria-label={`Modifier la description de l’image ${index + 1}`}
                onClick={(event) => edit(item, 'alt', event.currentTarget)}
              >
                <EntryImage
                  src={entryMediaUrl(item)}
                  alt={item.alt_text}
                  className="aspect-[4/3]"
                  sizes="(max-width: 768px) 45vw, 320px"
                />
                {entryMediaUrl(item) === cover && (
                  <span className="absolute left-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-card/95 px-2.5 py-1.5 text-[10px] font-bold text-foreground shadow-sm">
                    <Star className="size-3 fill-primary text-primary-ink" />
                    {item.is_cover ? 'Couverture' : 'Couverture auto'}
                  </span>
                )}
                <span className="entry-media-edit" aria-hidden="true">
                  <span className="flex size-10 items-center justify-center rounded-full bg-card/95 text-foreground">
                    <Pencil className="size-4" />
                  </span>
                </span>
              </button>
            )}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 px-4 py-3">
            <p className="text-[11px] leading-5 text-muted-foreground">
              {media.some((item) => item.is_cover)
                ? 'La couverture est choisie manuellement.'
                : 'La première image est utilisée automatiquement en couverture.'}
            </p>
            {media.some((item) => item.is_cover) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      const result = await autoEntryCover(entryId, new FormData());
                      if (result.ok) {
                        toast.success('Couverture automatique activée.');
                        router.refresh();
                      } else toast.error(result.message);
                    } catch {
                      toast.error('Impossible de modifier la couverture. Réessayez.');
                    }
                  })
                }
              >
                {pending && (
                  <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />
                )}
                Passer en automatique
              </Button>
            )}
          </div>
        </>
      )}
      {media.length < 20 ? (
        <UploadGallery
          entryId={entryId}
          capacity={20 - media.length}
          maxFileSize={maxFileSize}
          compact={media.length > 0}
        />
      ) : (
        <Alert>Votre galerie est complète. Retirez une image pour en ajouter une autre.</Alert>
      )}
      {selected && editing && (
        <ImageEditor
          key={`${selected.id}-${selected.version}-${editing.mode}`}
          media={selected}
          mode={editing.mode}
          cover={entryMediaUrl(selected) === cover}
          maxFileSize={maxFileSize}
          onClose={() => setEditing(undefined)}
          returnFocus={() => {
            if (restore.current?.isConnected) restore.current.focus();
            else gallery.current?.focus();
          }}
        />
      )}
    </Card>
  );
}
