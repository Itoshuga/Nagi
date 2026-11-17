'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Card, Input } from '@nagi/ui';
import type { CatalogCategory, CatalogRelation, EntryCardRow, RelationType } from '@nagi/database';
import { CatalogForm, CatalogSelect, ConfirmCatalogDeletion } from '@/features/catalog/admin-form';
import { CatalogPicker } from '@/features/catalog/picker';
import { EntryImage } from '@/features/media/image';
import {
  deleteEntryRelation,
  deleteRelationType,
  findRelationEntries,
  saveEntryRelation,
  saveRelationType,
} from './actions';

export function RelationTypeAdmin({ types }: { types: RelationType[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="mt-8 max-w-4xl space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Types de relation</h2>
        <Button type="button" aria-expanded={adding} onClick={() => setAdding(!adding)}>
          {adding ? 'Fermer' : 'Ajouter un type'}
        </Button>
      </div>
      {types.map((type) => (
        <details key={type.id} className="rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer rounded-md font-semibold focus-visible:outline-2 focus-visible:outline-ring">
            {type.name}{' '}
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              · {type.is_symmetric ? 'Symétrique' : 'Orientée'}
            </span>
          </summary>
          <div className="mt-4 space-y-4">
            <TypeForm type={type} />
            <CatalogForm
              className="border-t border-border pt-4"
              run={deleteRelationType.bind(null, type.id)}
            >
              <ConfirmCatalogDeletion label="Supprimer le type" />
            </CatalogForm>
          </div>
        </details>
      ))}
      {adding && (
        <Card>
          <TypeForm key={types.length} />
        </Card>
      )}
    </div>
  );
}

function TypeForm({ type }: { type?: RelationType }) {
  const [direction, setDirection] = useState(String(type?.is_symmetric ?? false));
  return (
    <CatalogForm run={saveRelationType.bind(null, type?.id ?? null)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm">
          Nom
          <Input name="name" required maxLength={100} defaultValue={type?.name} />
        </label>
        <label className="grid gap-2 text-sm">
          Clé
          <Input
            name="slug"
            maxLength={100}
            defaultValue={type?.slug}
            placeholder="Générée si vide"
          />
        </label>
        <label className="grid gap-2 text-sm">
          Libellé direct
          <Input name="forward_label" required maxLength={120} defaultValue={type?.forward_label} />
        </label>
        <label className="grid gap-2 text-sm">
          Libellé inverse
          <Input name="inverse_label" required maxLength={120} defaultValue={type?.inverse_label} />
        </label>
        <label className="grid gap-2 text-sm">
          Direction
          <CatalogSelect
            name="is_symmetric"
            value={direction}
            onChange={(event) => setDirection(event.target.value)}
          >
            <option value="false">Orientée, avec un libellé à chaque extrémité</option>
            <option value="true">Symétrique, les deux sens sont équivalents</option>
          </CatalogSelect>
        </label>
        <label className="grid gap-2 text-sm">
          Ordre
          <Input
            name="sort_order"
            type="number"
            min={0}
            required
            defaultValue={type?.sort_order ?? 0}
          />
        </label>
        {direction === 'false' ? (
          <label className="grid gap-2 text-sm">
            Cycles
            <CatalogSelect name="is_acyclic" defaultValue={String(type?.is_acyclic ?? false)}>
              <option value="false">Autorisés</option>
              <option value="true">Empêcher les cycles</option>
            </CatalogSelect>
          </label>
        ) : (
          <input type="hidden" name="is_acyclic" value="false" />
        )}
      </div>
      <Button type="submit" size="sm">
        {type ? 'Enregistrer le type' : 'Créer le type'}
      </Button>
    </CatalogForm>
  );
}

function RelationOption({ entry }: { entry: EntryCardRow }) {
  return (
    <div className="flex items-center gap-3">
      <EntryImage
        src={entry.cover_image_url}
        className="h-10 w-12 shrink-0 rounded-md"
        sizes="48px"
      />
      <span className="min-w-0">
        <span className="block break-words font-semibold">{entry.title}</span>
        <span className="block break-words text-xs text-muted-foreground">
          {[entry.category?.name, entry.city?.name, entry.country?.name]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>
    </div>
  );
}

export function AdminEntryRelations({
  entryId,
  relations,
  types,
  categories,
}: {
  entryId: string;
  relations: CatalogRelation[];
  types: RelationType[];
  categories: CatalogCategory[];
}) {
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<EntryCardRow>();
  return (
    <Card id="relations" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">Relations</h2>
        {types.length > 0 && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-expanded={adding}
            onClick={() => {
              setAdding(!adding);
              setSelected(undefined);
            }}
          >
            {adding ? 'Fermer' : 'Ajouter une relation'}
          </Button>
        )}
      </div>
      {!types.length && (
        <p className="text-sm text-muted-foreground">
          Créez d’abord un{' '}
          <Link className="underline" href="/admin/relations">
            type de relation
          </Link>
          .
        </p>
      )}
      {relations.map((relation) => (
        <details key={relation.id} className="rounded-xl border border-border p-3">
          <summary className="cursor-pointer rounded-md font-semibold focus-visible:outline-2 focus-visible:outline-ring">
            {relation.entry.title}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {relation.isIncoming ? relation.type.inverse_label : relation.type.forward_label}
            </span>
          </summary>
          <div className="mt-3 space-y-3">
            <Link
              href={`/admin/entries/${relation.entry.id}`}
              className="block rounded-xl p-2 hover:bg-accent"
            >
              <RelationOption entry={relation.entry} />
            </Link>
            {!relation.entry.published && <Badge>Brouillon</Badge>}
            <CatalogForm run={saveEntryRelation.bind(null, entryId, relation.id)}>
              <label className="grid gap-2 text-sm">
                Type de relation
                <CatalogSelect name="type" defaultValue={relation.type.id}>
                  {types.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </CatalogSelect>
              </label>
              <Button type="submit" variant="secondary" size="sm">
                Enregistrer le type
              </Button>
            </CatalogForm>
            <CatalogForm run={deleteEntryRelation.bind(null, entryId, relation.id)}>
              <Button type="submit" variant="ghost" size="sm">
                Retirer la relation
              </Button>
            </CatalogForm>
          </div>
        </details>
      ))}
      {types.length > 0 && !relations.length && !adding && (
        <p className="text-sm text-muted-foreground">Aucune fiche associée pour le moment.</p>
      )}
      {adding && (
        <CatalogForm
          key={relations.length}
          run={saveEntryRelation.bind(null, entryId, null)}
          className="rounded-xl border border-border p-3"
        >
          <label className="grid gap-2 text-sm">
            Type de relation
            <CatalogSelect name="type" defaultValue="" required>
              <option value="" disabled>
                Sélectionner un type
              </option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </CatalogSelect>
          </label>
          <label className="grid gap-2 text-sm">
            Filtrer par catégorie
            <CatalogSelect
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
          </label>
          <CatalogPicker
            key={`${filter}-${relations.length}`}
            name="target"
            label="Fiche à associer"
            value={selected}
            onSelect={setSelected}
            selectedName={(entry) => entry.title}
            search={(query) => findRelationEntries(query, entryId, filter || undefined)}
            render={(entry) => <RelationOption entry={entry} />}
          />
          <Button type="submit" disabled={!selected} size="sm">
            Confirmer la relation
          </Button>
        </CatalogForm>
      )}
    </Card>
  );
}
