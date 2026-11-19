'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { ArrowUpRight, Link2, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Card,
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
import type { CatalogCategory, CatalogRelation, EntryCardRow, RelationType } from '@nagi/database';
import { groupCatalogRelations, relationOptions, type RelationDirection } from '@nagi/shared';
import { CatalogForm } from '@/features/catalog/admin-form';
import { FieldIcon } from '@/features/icons/field-icon';
import { deleteEntryRelation, saveEntryRelation } from './actions';
import {
  RelatedEntry,
  RelationEntryPicker,
  RelationEntrySummary,
  type RelationEntry,
} from './entry-search';
import { InverseRelationPreview } from './preview';
import { RelationTypePicker } from './type-picker';
import './relations.css';

const dialogClasses =
  'entry-editor-dialog relation-dialog translate-x-0 translate-y-0 sm:-translate-x-1/2 sm:-translate-y-1/2';
function RelationDialog({
  current,
  types,
  categories,
  relations,
  relation,
  onClose,
  returnFocus,
}: {
  current: RelationEntry;
  types: RelationType[];
  categories: CatalogCategory[];
  relations: CatalogRelation[];
  relation?: CatalogRelation;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const [selected, setSelected] = useState<EntryCardRow | undefined>(relation?.entry);
  const [choice, setChoice] = useState(relation ? `${relation.type.id}:${relation.direction}` : '');
  const [pending, setPending] = useState(false);
  const [selector, setSelector] = useState<'type' | 'entry'>();
  const typeTrigger = useRef<HTMLButtonElement>(null);
  const entryEscape = useRef<(() => void) | null>(null);
  function closeSelector() {
    if (selector === 'entry' && entryEscape.current) entryEscape.current();
    else setSelector(undefined);
  }
  const available = types.filter((t) => t.is_enabled || t.id === relation?.type.id);
  const options = relationOptions(available);
  const option = options.find((o) => o.value === choice);
  const direction: RelationDirection = option?.direction ?? 'forward';
  const type = option?.type;
  const duplicate =
    selected &&
    type &&
    relations.some(
      (r) =>
        r.id !== relation?.id &&
        r.entry.id === selected.id &&
        r.type.id === type.id &&
        (type.is_symmetric || r.direction === direction),
    );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) {
          if (selector) closeSelector();
          else onClose();
        }
      }}
    >
      <DialogContent
        closeDisabled={pending}
        className={`${dialogClasses} relation-builder-dialog max-w-[520px]`}
        aria-busy={pending}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          typeTrigger.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus();
        }}
        onEscapeKeyDown={(e) => {
          if (pending || selector) e.preventDefault();
          if (selector && !pending) closeSelector();
        }}
        onPointerDownOutside={(e) => {
          if (pending || selector) e.preventDefault();
        }}
      >
        <div className="entry-dialog-heading">
          <DialogTitle>{relation ? 'Modifier la relation' : 'Ajouter une relation'}</DialogTitle>
          <DialogDescription>Connectez deux fiches du catalogue.</DialogDescription>
        </div>
        <CatalogForm
          run={saveEntryRelation.bind(null, current.id, relation?.id ?? null)}
          onPendingChange={setPending}
          onSuccess={() => {
            toast.success(
              relation
                ? 'Relation mise à jour sur les deux fiches.'
                : 'Les deux fiches sont maintenant reliées.',
            );
            onClose();
          }}
        >
          <input type="hidden" name="updated_at" value={relation?.updated_at ?? ''} />
          <input type="hidden" name="type" value={type?.id ?? ''} />
          <input type="hidden" name="direction" value={direction} />
          <div className="entry-dialog-body relation-builder-body">
            <RelationEntrySummary entry={current} />
            <span className="relation-sentence-connector" aria-hidden="true" />
            <RelationTypePicker
              types={available}
              value={choice}
              onChange={setChoice}
              open={selector === 'type'}
              onOpenChange={(open) => setSelector(open ? 'type' : undefined)}
              disabled={pending}
              triggerRef={typeTrigger}
            />
            {type && !type.is_enabled && (
              <p role="status" className="relation-inactive-note">
                Ce type est inactif. Choisissez un type actif pour modifier la relation.
              </p>
            )}
            <span className="relation-sentence-connector" aria-hidden="true" />
            <RelationEntryPicker
              current={current}
              categories={categories}
              value={selected}
              onSelect={setSelected}
              disabled={pending}
              open={selector === 'entry'}
              onOpenChange={(open) => setSelector(open ? 'entry' : undefined)}
              escapeRef={entryEscape}
            />
            <InverseRelationPreview
              current={current.title}
              target={selected?.title}
              type={type}
              direction={direction}
            />
            {duplicate && (
              <Alert role="alert">
                Cette association existe déjà. Elle est visible depuis les deux fiches.
              </Alert>
            )}
          </div>
          <div className="entry-dialog-footer relation-builder-footer">
            <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={!selected || !type?.is_enabled || Boolean(duplicate)}>
              {pending ? 'Enregistrement…' : relation ? 'Enregistrer' : 'Créer la relation'}
            </Button>
          </div>
        </CatalogForm>
      </DialogContent>
    </Dialog>
  );
}
function RemoveRelation({
  current,
  relation,
  onClose,
  returnFocus,
}: {
  current: RelationEntry;
  relation: CatalogRelation;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const [pending, setPending] = useState(false);
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        closeDisabled={pending}
        className={`${dialogClasses} max-w-md`}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          cancel.current?.focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus();
        }}
        onEscapeKeyDown={(e) => {
          if (pending) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        <div className="entry-dialog-heading">
          <DialogTitle>Supprimer cette relation ?</DialogTitle>
          <DialogDescription>
            Le lien sera supprimé des deux fiches. Les fiches elles-mêmes seront conservées.
          </DialogDescription>
        </div>
        <CatalogForm
          run={deleteEntryRelation.bind(null, current.id, relation.id)}
          onPendingChange={setPending}
          onSuccess={() => {
            toast.success('Relation supprimée des deux fiches.');
            onClose();
          }}
        >
          <input type="hidden" name="confirm" value="yes" />
          <input type="hidden" name="updated_at" value={relation.updated_at} />
          <div className="entry-dialog-body">
            <p className="mb-4 break-words text-sm leading-6">
              Supprimer le lien entre <strong>{current.title}</strong> et{' '}
              <strong>{relation.entry.title}</strong> ?
            </p>
            <RelatedEntry entry={relation.entry} />
          </div>
          <div className="entry-dialog-footer">
            <Button ref={cancel} type="button" variant="ghost" disabled={pending} onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant="destructive">
              <Trash2 className="size-4" />
              {pending ? 'Suppression…' : 'Supprimer la relation'}
            </Button>
          </div>
        </CatalogForm>
      </DialogContent>
    </Dialog>
  );
}
export function AdminEntryRelations({
  current,
  relations,
  types,
  categories,
}: {
  current: RelationEntry;
  relations: CatalogRelation[];
  types: RelationType[];
  categories: CatalogCategory[];
}) {
  const add = useRef<HTMLButtonElement>(null),
    restore = useRef<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<{ mode: 'create' | 'edit' | 'remove'; id?: string }>();
  const selected = relations.find((r) => r.id === dialog?.id);
  function returnFocus() {
    if (restore.current?.isConnected) restore.current.focus();
    else add.current?.focus();
  }
  const active = types.some((t) => t.is_enabled);
  return (
    <Card id="relations" className="space-y-6 p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="entry-dialog-label mb-2">Les bonnes connexions</p>
          <h2 className="text-2xl font-extrabold tracking-tight">Les fiches associées</h2>
          <p className="mt-2 max-w-xl text-xs leading-6 text-muted-foreground">
            Un lieu qui en abrite un autre, une spécialité à déguster, une découverte à proximité.
          </p>
        </div>
        {active && (
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
      {!active && (
        <Alert>
          Activez ou créez un{' '}
          <Link className="font-semibold text-primary-ink underline" href="/admin/relations">
            type de relation
          </Link>{' '}
          pour associer de nouvelles fiches.
        </Alert>
      )}
      {!relations.length ? (
        <div className="grid min-h-48 content-center justify-items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/25 p-6 text-center">
          <Link2 className="size-6 text-primary-ink" />
          <h3 className="text-sm font-bold">Chaque fiche a ses bonnes connexions.</h3>
          <p className="max-w-sm text-xs leading-6 text-muted-foreground">
            Ajoutez une relation : elle apparaîtra automatiquement sur les deux fiches.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupCatalogRelations(relations).map(([key, group]) => (
            <section key={key} className="space-y-3">
              <h3 className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                <FieldIcon name={group.relations[0]?.type.icon} />
                {group.label}
                <span className="text-[10px] font-normal">{group.relations.length}</span>
              </h3>
              {group.relations.map((relation) => (
                <div key={relation.id} className="entry-relation-row">
                  <div className="min-w-0 flex-1">
                    <Link
                      prefetch={false}
                      href={`/admin/entries/${relation.entry.id}`}
                      className="block rounded-xl hover:text-primary-ink"
                    >
                      <RelatedEntry entry={relation.entry} />
                    </Link>
                    <div className="mt-2 flex gap-2">
                      {!relation.entry.published && <Badge>Brouillon</Badge>}
                      {!relation.type.is_enabled && <Badge>Type inactif</Badge>}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9"
                        aria-label={`Options de la relation avec ${relation.entry.title}`}
                        onClick={(e) => {
                          restore.current = e.currentTarget;
                        }}
                      >
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="entry-media-menu">
                      <DropdownMenuItem asChild>
                        <Link prefetch={false} href={`/admin/entries/${relation.entry.id}`}>
                          <ArrowUpRight className="size-4" />
                          Consulter la fiche
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setDialog({ mode: 'edit', id: relation.id })}
                      >
                        <Pencil className="size-4" />
                        Modifier la relation
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-destructive"
                        onSelect={() => setDialog({ mode: 'remove', id: relation.id })}
                      >
                        <Trash2 className="size-4" />
                        Supprimer la relation
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}
      {dialog?.mode === 'create' && (
        <RelationDialog
          current={current}
          types={types}
          categories={categories}
          relations={relations}
          onClose={() => setDialog(undefined)}
          returnFocus={returnFocus}
        />
      )}
      {dialog?.mode === 'edit' && selected && (
        <RelationDialog
          current={current}
          types={types}
          categories={categories}
          relations={relations}
          relation={selected}
          onClose={() => setDialog(undefined)}
          returnFocus={returnFocus}
        />
      )}
      {dialog?.mode === 'remove' && selected && (
        <RemoveRelation
          current={current}
          relation={selected}
          onClose={() => setDialog(undefined)}
          returnFocus={returnFocus}
        />
      )}
    </Card>
  );
}
