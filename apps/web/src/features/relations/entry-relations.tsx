'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUpRight, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Label,
  toast,
} from '@nagi/ui';
import type { CatalogCategory, CatalogRelation, EntryCardRow, RelationType } from '@nagi/database';
import { CatalogForm, CatalogSelect } from '@/features/catalog/admin-form';
import { CatalogPicker } from '@/features/catalog/picker';
import { EntryImage } from '@/features/media/image';
import { deleteEntryRelation, findRelationEntries, saveEntryRelation } from './actions';

function RelatedEntry({ entry, compact = false }: { entry: EntryCardRow; compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <EntryImage
        src={entry.cover_image_url}
        className={`${compact ? 'h-10 w-12' : 'h-14 w-16'} shrink-0 rounded-xl`}
        sizes="64px"
      />
      <div className="min-w-0">
        <span className="block break-words text-sm font-bold leading-6">{entry.title}</span>
        <span className="block break-words text-[11px] leading-5 text-muted-foreground">
          {[entry.category?.name, entry.city?.name, entry.country?.name]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
    </div>
  );
}
function RelationshipPreview({
  title,
  target,
  type,
  incoming = false,
}: {
  title: string;
  target?: EntryCardRow;
  type?: RelationType;
  incoming?: boolean;
}) {
  return (
    <div className="entry-relation-preview" aria-live="polite">
      <p className="entry-dialog-label">Aperçu du lien</p>
      <p className="break-words text-sm font-bold">{title}</p>
      <div className="flex items-center gap-2 text-xs font-semibold leading-6 text-primary-ink">
        {type?.is_symmetric ? (
          <ArrowLeftRight className="size-4 shrink-0" />
        ) : (
          <ArrowDown className="size-4 shrink-0" />
        )}
        <span>
          {type
            ? incoming
              ? type.inverse_label
              : type.forward_label
            : 'Choisissez un type de relation'}
        </span>
      </div>
      {target ? (
        <RelatedEntry entry={target} compact />
      ) : (
        <p className="text-xs leading-6 text-muted-foreground">
          Sélectionnez une fiche pour visualiser la relation.
        </p>
      )}
    </div>
  );
}

function RelationDialog({
  entryId,
  title,
  types,
  categories,
  relations,
  relation,
  onClose,
  returnFocus,
}: {
  entryId: string;
  title: string;
  types: RelationType[];
  categories: CatalogCategory[];
  relations: CatalogRelation[];
  relation?: CatalogRelation;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<EntryCardRow | undefined>(relation?.entry);
  const [typeId, setTypeId] = useState(relation?.type.id ?? '');
  const [pending, setPending] = useState(false);
  const type = types.find((item) => item.id === typeId);
  const duplicate =
    selected &&
    type &&
    relations.some(
      (item) =>
        item.id !== relation?.id &&
        item.entry.id === selected.id &&
        item.type.id === type.id &&
        (type.is_symmetric || item.isIncoming === (relation?.isIncoming ?? false)),
    );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        closeDisabled={pending}
        className={`entry-editor-dialog ${relation ? 'max-w-xl' : 'max-w-4xl'}`}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
      >
        <div className="entry-dialog-heading">
          <DialogTitle>{relation ? 'Modifier cette relation' : 'Relier une fiche'}</DialogTitle>
          <DialogDescription>
            {relation
              ? 'Ajustez le lien tout en conservant les deux fiches.'
              : 'Associez un lieu, une expérience ou une adresse du catalogue à votre fiche.'}
          </DialogDescription>
        </div>
        <CatalogForm
          run={saveEntryRelation.bind(null, entryId, relation?.id ?? null)}
          onPendingChange={setPending}
          onSuccess={() => {
            toast.success(
              relation ? 'Relation mise à jour.' : 'Les fiches sont maintenant reliées.',
            );
            onClose();
          }}
          className="[&>div[role=status]]:mx-5 [&>div[role=status]]:mb-5"
        >
          <div
            className={`entry-dialog-body grid gap-7 ${!relation ? 'md:grid-cols-[1.1fr_1fr]' : ''}`}
          >
            {!relation && (
              <section className="min-w-0 space-y-4" aria-label="Choisir la fiche associée">
                <p className="entry-dialog-label">01 · Choisir une fiche</p>
                <div>
                  <Label htmlFor="relation-category" className="text-xs">
                    Catégorie
                  </Label>
                  <CatalogSelect
                    id="relation-category"
                    value={filter}
                    onChange={(event) => {
                      setFilter(event.target.value);
                      setSelected(undefined);
                    }}
                  >
                    <option value="">Toutes les catégories</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </CatalogSelect>
                </div>
                <CatalogPicker
                  key={filter}
                  inline
                  disabled={pending}
                  name="target"
                  label="Fiche à associer"
                  placeholder="Rechercher un lieu ou une expérience…"
                  value={selected}
                  selectedName={(entry) => entry.title}
                  onSelect={setSelected}
                  search={(query) => findRelationEntries(query, entryId, filter || undefined)}
                  render={(entry) => <RelatedEntry entry={entry} compact />}
                />
                {selected && (
                  <div className="rounded-2xl border border-border p-4">
                    <RelatedEntry entry={selected} />
                    {!selected.published && <Badge className="mt-3">Brouillon</Badge>}
                  </div>
                )}
              </section>
            )}
            <section className="min-w-0 space-y-5" aria-label="Définir le lien">
              <p className="entry-dialog-label">
                {relation ? 'La relation entre les fiches' : '02 · Définir le lien'}
              </p>
              <div>
                <Label htmlFor="relation-type">Type de relation</Label>
                <CatalogSelect
                  id="relation-type"
                  name="type"
                  value={typeId}
                  onChange={(event) => setTypeId(event.target.value)}
                  required
                >
                  <option value="" disabled>
                    Quel lien entre ces fiches ?
                  </option>
                  {types.map((item) => (
                    <option key={item.id} value={item.id}>
                      {relation?.isIncoming ? item.inverse_label : item.forward_label}
                    </option>
                  ))}
                </CatalogSelect>
                {type && (
                  <p className="mt-2 text-[11px] leading-6 text-muted-foreground">
                    {type.is_symmetric
                      ? 'Ce lien est partagé dans les deux sens.'
                      : 'Le libellé inverse sera affiché sur la fiche associée.'}
                  </p>
                )}
              </div>
              <RelationshipPreview
                title={title}
                target={selected}
                type={type}
                incoming={relation?.isIncoming}
              />
              {duplicate && <Alert>Cette relation existe déjà entre ces fiches.</Alert>}
            </section>
          </div>
          <div className="entry-dialog-footer">
            <Button type="button" variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={!selected || !type || Boolean(duplicate)}>
              <Link2 className="size-4" />
              {pending
                ? 'Enregistrement…'
                : relation
                  ? 'Enregistrer la relation'
                  : 'Créer la relation'}
            </Button>
          </div>
        </CatalogForm>
      </DialogContent>
    </Dialog>
  );
}
function RemoveRelation({
  entryId,
  relation,
  onClose,
  returnFocus,
}: {
  entryId: string;
  relation: CatalogRelation;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        closeDisabled={pending}
        className="entry-editor-dialog max-w-md"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
      >
        <div className="entry-dialog-heading">
          <DialogTitle>Retirer cette relation ?</DialogTitle>
          <DialogDescription>
            Les deux fiches seront conservées dans le catalogue. Seul leur lien sera supprimé.
          </DialogDescription>
        </div>
        <CatalogForm
          run={deleteEntryRelation.bind(null, entryId, relation.id)}
          onPendingChange={setPending}
          onSuccess={() => {
            toast.success('Relation retirée.');
            onClose();
          }}
          className="[&>div[role=status]]:mx-5 [&>div[role=status]]:mb-5"
        >
          <div className="entry-dialog-body">
            <RelatedEntry entry={relation.entry} />
          </div>
          <div className="entry-dialog-footer">
            <Button type="button" variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant="destructive">
              <Trash2 className="size-4" />
              {pending ? 'Retrait…' : 'Retirer la relation'}
            </Button>
          </div>
        </CatalogForm>
      </DialogContent>
    </Dialog>
  );
}

export function AdminEntryRelations({
  entryId,
  title,
  relations,
  types,
  categories,
}: {
  entryId: string;
  title: string;
  relations: CatalogRelation[];
  types: RelationType[];
  categories: CatalogCategory[];
}) {
  const add = useRef<HTMLButtonElement>(null);
  const restore = useRef<HTMLElement | null>(null);
  function returnFocus() {
    if (restore.current?.isConnected) restore.current.focus();
    else add.current?.focus();
  }
  const [dialog, setDialog] = useState<{ mode: 'create' | 'edit' | 'remove'; id?: string }>();
  const selected = relations.find((item) => item.id === dialog?.id);
  const groups = new Map<string, CatalogRelation[]>();
  for (const relation of relations)
    groups.set(relation.type.name, [...(groups.get(relation.type.name) ?? []), relation]);
  return (
    <Card id="relations" className="space-y-6 p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="entry-dialog-label mb-2">Enrichir la découverte</p>
          <h2 className="text-2xl font-extrabold tracking-tight">Les fiches associées</h2>
          <p className="mt-2 max-w-xl text-xs leading-6 text-muted-foreground">
            Reliez les idées qui vont ensemble : un plat et son restaurant, un lieu et les
            expériences à proximité.
          </p>
        </div>
        {types.length > 0 && (
          <Button
            ref={add}
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              restore.current = add.current;
              setDialog({ mode: 'create' });
            }}
          >
            <Plus className="size-3.5" />
            Ajouter une relation
          </Button>
        )}
      </div>
      {!types.length ? (
        <Alert>
          Créez d’abord un{' '}
          <Link className="font-semibold text-primary-ink underline" href="/admin/relations">
            type de relation
          </Link>{' '}
          pour associer vos fiches.
        </Alert>
      ) : !relations.length ? (
        <div className="grid min-h-60 justify-items-center content-center gap-4 rounded-2xl border border-dashed border-border bg-muted/25 p-7 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl border border-border bg-card text-primary-ink">
            <Link2 className="size-5" strokeWidth={1.6} />
          </span>
          <div>
            <h3 className="text-sm font-bold">Chaque fiche a ses bonnes connexions.</h3>
            <p className="mt-2 max-w-sm text-xs leading-6 text-muted-foreground">
              Associez une autre fiche du catalogue pour guider vos lecteurs vers de nouvelles
              découvertes.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {[...groups].map(([name, items]) => (
            <section key={name} className="space-y-3">
              <h3 className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                {name}
                <span className="text-[10px] font-normal">{items.length}</span>
              </h3>
              {items.map((relation) => (
                <div key={relation.id} className="entry-relation-row">
                  <div className="min-w-0 flex-1">
                    <p className="mb-2 text-[10px] font-bold text-primary-ink">
                      {relation.isIncoming
                        ? relation.type.inverse_label
                        : relation.type.forward_label}
                    </p>
                    <Link
                      href={`/admin/entries/${relation.entry.id}`}
                      className="block rounded-xl hover:text-primary-ink"
                    >
                      <RelatedEntry entry={relation.entry} />
                    </Link>
                    {!relation.entry.published && <Badge className="mt-2">Brouillon</Badge>}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Modifier la relation avec ${relation.entry.title}`}
                      onClick={(event) => {
                        restore.current = event.currentTarget;
                        setDialog({ mode: 'edit', id: relation.id });
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      aria-label={`Retirer la relation avec ${relation.entry.title}`}
                      onClick={(event) => {
                        restore.current = event.currentTarget;
                        setDialog({ mode: 'remove', id: relation.id });
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="hidden size-8 sm:inline-flex"
                    >
                      <Link
                        href={`/admin/entries/${relation.entry.id}`}
                        aria-label={`Ouvrir ${relation.entry.title}`}
                      >
                        <ArrowUpRight className="size-3.5" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
      {dialog?.mode === 'create' && (
        <RelationDialog
          entryId={entryId}
          title={title}
          types={types}
          categories={categories}
          relations={relations}
          onClose={() => setDialog(undefined)}
          returnFocus={returnFocus}
        />
      )}
      {selected && dialog?.mode === 'edit' && (
        <RelationDialog
          key={selected.id}
          entryId={entryId}
          title={title}
          types={types}
          categories={categories}
          relations={relations}
          relation={selected}
          onClose={() => setDialog(undefined)}
          returnFocus={returnFocus}
        />
      )}
      {selected && dialog?.mode === 'remove' && (
        <RemoveRelation
          entryId={entryId}
          relation={selected}
          onClose={() => setDialog(undefined)}
          returnFocus={returnFocus}
        />
      )}
    </Card>
  );
}
