'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus } from 'lucide-react';
import { Alert, Badge, Button, Card, Input } from '@nagi/ui';
import type { EntryMedia } from '@nagi/database';
import { CatalogForm, ConfirmCatalogDeletion } from '@/features/catalog/admin-form';
import { SortableCatalog } from '@/features/catalog/sortable';
import { autoEntryCover, changeEntryImage, orderEntryMedia, uploadEntryImage } from './actions';
import { EntryImage } from './image';
import { entryMediaUrl } from './model';

const imageAccept = 'image/jpeg,image/png,image/webp';

function UploadGallery({ entryId, capacity }: { entryId: string; capacity: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string>();
  const [pending, startTransition] = useTransition();
  function upload(files: FileList | null) {
    if (!files?.length || pending) return;
    const selected = Array.from(files);
    if (selected.length > capacity) {
      setStatus(`Vous pouvez encore ajouter ${capacity} image(s).`);
      return;
    }
    startTransition(async () => {
      const errors: string[] = [];
      let uploaded = 0;
      for (const file of selected) {
        setStatus(`Envoi de l’image ${uploaded + errors.length + 1} sur ${selected.length}…`);
        const data = new FormData();
        data.append('file', file);
        try {
          const result = await uploadEntryImage(entryId, null, null, data);
          if (result.ok) uploaded++;
          else errors.push(`${file.name} · ${result.message}`);
        } catch {
          errors.push(`${file.name} · Envoi interrompu.`);
        }
      }
      if (input.current) input.current.value = '';
      setStatus([`${uploaded} image(s) ajoutée(s).`, ...errors].join('\n'));
      router.refresh();
    });
  }
  return (
    <div>
      <div
        className="grid justify-items-center gap-3 rounded-2xl border-2 border-dashed border-border p-5 text-center"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          upload(event.dataTransfer.files);
        }}
      >
        <ImagePlus aria-hidden="true" className="size-7 text-primary-ink" />
        <p className="text-sm text-muted-foreground">
          JPEG, PNG ou WebP. Déposez jusqu’à {capacity} image(s) ici.
        </p>
        <input
          ref={input}
          type="file"
          accept={imageAccept}
          multiple
          hidden
          onChange={(event) => {
            upload(event.target.files);
            event.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={() => input.current?.click()}
        >
          {pending ? 'Envoi en cours…' : 'Choisir des images'}
        </Button>
      </div>
      {status && <Alert className="mt-3 whitespace-pre-line">{status}</Alert>}
    </div>
  );
}

function ImageSettings({ media, effectiveCover }: { media: EntryMedia; effectiveCover: boolean }) {
  const change = changeEntryImage.bind(null, media.entry_id, media.id, media.version);
  return (
    <details className="min-w-0 flex-1">
      <summary className="cursor-pointer rounded-md text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">
        Options de l’image
      </summary>
      <div className="mt-3 space-y-4">
        <CatalogForm run={change.bind(null, 'alt')}>
          <label className="grid gap-2 text-sm">
            Texte alternatif
            <Input
              name="alt_text"
              maxLength={220}
              defaultValue={media.alt_text}
              placeholder="Décrire ce que montre l’image"
            />
          </label>
          <Button type="submit" variant="secondary" size="sm">
            Enregistrer le texte
          </Button>
        </CatalogForm>
        {!media.is_cover && (
          <CatalogForm run={change.bind(null, 'cover')}>
            <Button type="submit" variant="secondary" size="sm">
              {effectiveCover ? 'Fixer comme couverture' : 'Choisir comme couverture'}
            </Button>
          </CatalogForm>
        )}
        <CatalogForm
          run={uploadEntryImage.bind(null, media.entry_id, media.id, media.version)}
          reset
        >
          <input type="hidden" name="alt_text" value={media.alt_text} />
          <label className="grid gap-2 text-sm">
            Remplacer le fichier
            <Input type="file" name="file" accept={imageAccept} required className="h-auto py-2" />
          </label>
          <Button type="submit" variant="secondary" size="sm">
            Remplacer l’image
          </Button>
        </CatalogForm>
        <CatalogForm run={change.bind(null, 'remove')}>
          <ConfirmCatalogDeletion label="Retirer l’image" />
        </CatalogForm>
      </div>
    </details>
  );
}

export function AdminGallery({
  entryId,
  media,
  cover,
}: {
  entryId: string;
  media: EntryMedia[];
  cover: string | null;
}) {
  return (
    <Card id="medias" className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Médias</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          La première image sert de couverture tant qu’aucune autre image n’est sélectionnée.
        </p>
      </div>
      {media.length > 0 && (
        <SortableCatalog
          items={media}
          label={(item) => item.alt_text || `Image ${item.sort_order + 1}`}
          save={orderEntryMedia.bind(null, entryId)}
          render={(item) => {
            const url = entryMediaUrl(item);
            return (
              <div className="flex min-w-0 flex-wrap items-start gap-3">
                <div className="w-24 shrink-0">
                  <EntryImage
                    src={url}
                    alt={item.alt_text}
                    className="aspect-[4/3] rounded-lg"
                    sizes="96px"
                  />
                  {url === cover && (
                    <Badge className="mt-1 px-2">{item.is_cover ? 'Couverture' : 'Auto'}</Badge>
                  )}
                </div>
                <ImageSettings key={item.version} media={item} effectiveCover={url === cover} />
              </div>
            );
          }}
        />
      )}
      {media.some((item) => item.is_cover) && (
        <CatalogForm run={autoEntryCover.bind(null, entryId)}>
          <Button type="submit" variant="secondary" size="sm">
            Revenir à la couverture automatique
          </Button>
        </CatalogForm>
      )}
      {media.length < 20 ? (
        <UploadGallery entryId={entryId} capacity={20 - media.length} />
      ) : (
        <p className="text-sm text-muted-foreground">La galerie contient 20 images.</p>
      )}
    </Card>
  );
}
