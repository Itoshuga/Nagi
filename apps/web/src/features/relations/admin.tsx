'use client';

import { useState } from 'react';
import { Button, Card, Input } from '@nagi/ui';
import type { RelationType } from '@nagi/database';
import { CatalogForm, CatalogSelect, ConfirmCatalogDeletion } from '@/features/catalog/admin-form';
import { deleteRelationType, saveRelationType } from './actions';

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

export { AdminEntryRelations } from './entry-relations';
