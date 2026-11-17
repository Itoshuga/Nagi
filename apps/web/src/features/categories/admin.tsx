'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, Input, Label } from '@nagi/ui';
import {
  catalogFieldTypes,
  catalogIcons,
  toDestinationSlug,
  type CatalogIconName,
} from '@nagi/shared';
import type { CatalogCategory, CategoryField } from '@nagi/database';
import {
  CatalogForm,
  CatalogSelect,
  CatalogTextarea,
  ConfirmCatalogDeletion,
} from '@/features/catalog/admin-form';
import { SortableCatalog } from '@/features/catalog/sortable';
import { CategoryIcon } from './icon';
import {
  deleteCategoryField,
  orderCategories,
  removeCategory,
  saveCategory,
  saveCategoryField,
} from './actions';

export const fieldTypeLabels = {
  short_text: 'Texte court',
  long_text: 'Texte long',
  number: 'Nombre',
  boolean: 'Oui / non',
  url: 'Lien',
  date: 'Date',
  select: 'Choix unique',
  multi_select: 'Choix multiples',
} as const;

const colors = [
  ['#527aa3', 'Bleu ardoise'],
  ['#587b67', 'Vert sauge'],
  ['#a76047', 'Terre cuite'],
  ['#92734a', 'Ocre'],
  ['#786a9c', 'Lavande'],
  ['#a15c80', 'Rose'],
] as const;

export function AdminCategoryList({ categories }: { categories: CatalogCategory[] }) {
  return (
    <div className="mt-8 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{categories.length} catégories</p>
        <Button asChild>
          <Link href="/admin/categories/new">Ajouter une catégorie</Link>
        </Button>
      </div>
      {categories.length ? (
        <SortableCatalog
          items={categories}
          label={(category) => category.name}
          save={orderCategories}
          render={(category) => (
            <Link
              href={`/admin/categories/${category.id}`}
              className="flex items-center gap-3 rounded-xl px-1 py-1 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            >
              <CategoryIcon name={category.icon} color={category.color} />
              <div className="min-w-0 flex-1">
                <span className="block break-words font-semibold">{category.name}</span>
                {category.description && (
                  <span className="line-clamp-1 text-xs text-muted-foreground">
                    {category.description}
                  </span>
                )}
              </div>
              <Badge>{category.is_enabled ? 'Active' : 'Désactivée'}</Badge>
            </Link>
          )}
        />
      ) : (
        <EmptyState
          title="Aucune catégorie"
          description="Ajoutez une catégorie pour organiser les fiches du catalogue."
        />
      )}
    </div>
  );
}

export function CategorySettings({
  category,
  position,
}: {
  category?: CatalogCategory;
  position: number;
}) {
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? 'compass');
  const [color, setColor] = useState(category?.color ?? colors[0][0]);
  const [search, setSearch] = useState('');
  const [customSlug, setCustomSlug] = useState<string>();
  const entries = (Object.entries(catalogIcons) as [CatalogIconName, string][]).filter(
    ([, label]) => toDestinationSlug(label).includes(toDestinationSlug(search)),
  );

  return (
    <Card>
      <CatalogForm run={saveCategory.bind(null, category?.id ?? null)}>
        <div className="flex flex-wrap items-center gap-3">
          <CategoryIcon name={icon} color={color} />
          <span className="font-semibold">{name || 'Aperçu de la catégorie'}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="category-name">Nom</Label>
            <Input
              id="category-name"
              name="name"
              value={name}
              required
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="category-slug">Adresse de la catégorie</Label>
            <Input
              id="category-slug"
              name="slug"
              value={customSlug ?? category?.slug ?? toDestinationSlug(name)}
              onChange={(event) => setCustomSlug(event.target.value)}
              maxLength={100}
              required
            />
          </div>
          <div>
            <Label htmlFor="category-position">Ordre</Label>
            <Input
              id="category-position"
              name="position"
              type="number"
              min={0}
              required
              defaultValue={category?.position ?? position}
            />
          </div>
          <div>
            <Label htmlFor="category-status">Visibilité</Label>
            <CatalogSelect
              id="category-status"
              name="is_enabled"
              defaultValue={String(category?.is_enabled ?? true)}
            >
              <option value="true">Active</option>
              <option value="false">Désactivée</option>
            </CatalogSelect>
          </div>
        </div>
        <div>
          <Label htmlFor="category-description">Description</Label>
          <CatalogTextarea
            id="category-description"
            name="description"
            maxLength={1500}
            defaultValue={category?.description}
          />
        </div>
        <div>
          <Label htmlFor="category-icon-search">Icône</Label>
          <Input
            id="category-icon-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une icône"
          />
          <input type="hidden" name="icon" value={icon} />
          {entries.length ? (
            <div
              role="group"
              aria-label="Icônes disponibles"
              className="mt-2 grid max-h-48 grid-cols-3 gap-1 overflow-y-auto p-1 sm:grid-cols-5"
            >
              {entries.map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={icon === value}
                  onClick={() => setIcon(value)}
                  className="grid min-h-16 place-items-center gap-1 rounded-xl border border-transparent p-1.5 text-center text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring aria-pressed:border-primary aria-pressed:bg-accent"
                >
                  <CategoryIcon name={value} color={color} />
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Aucune icône correspondante.</p>
          )}
        </div>
        <div
          role="group"
          aria-label="Couleurs de la catégorie"
          className="flex flex-wrap items-end gap-3"
        >
          {colors.map(([value, label]) => (
            <button
              type="button"
              key={value}
              aria-label={label}
              aria-pressed={color === value}
              title={label}
              onClick={() => setColor(value)}
              style={{ backgroundColor: value }}
              className="size-8 rounded-full border border-border ring-offset-2 ring-offset-background focus-visible:outline-2 focus-visible:outline-ring aria-pressed:ring-2 aria-pressed:ring-ring"
            />
          ))}
          <div>
            <Label htmlFor="category-color" className="mb-1 text-xs">
              Personnalisée
            </Label>
            <input
              id="category-color"
              name="color"
              type="color"
              value={color}
              onChange={(event) => setColor(event.target.value)}
              className="h-8 w-12 cursor-pointer rounded-md border border-input bg-background"
            />
          </div>
        </div>
        <Button type="submit">
          {category ? 'Enregistrer la catégorie' : 'Créer la catégorie'}
        </Button>
      </CatalogForm>
    </Card>
  );
}

function FieldSettings({
  categoryId,
  field,
  position,
}: {
  categoryId: string;
  field?: CategoryField;
  position: number;
}) {
  const [type, setType] = useState<CategoryField['type']>(field?.type ?? 'short_text');
  const [label, setLabel] = useState(field?.label ?? '');
  const [key, setKey] = useState<string>();
  return (
    <div className="space-y-3">
      <CatalogForm run={saveCategoryField.bind(null, categoryId, field?.id ?? null)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm">
            Libellé
            <Input
              name="label"
              value={label}
              maxLength={100}
              required
              onChange={(event) => setLabel(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm">
            Clé
            <Input
              name="key"
              value={key ?? field?.key ?? toDestinationSlug(label).slice(0, 80)}
              maxLength={80}
              required
              onChange={(event) => setKey(event.target.value)}
            />
          </label>
          <label className="grid gap-2 text-sm">
            Type
            <CatalogSelect
              name="type"
              value={type}
              onChange={(event) => setType(event.target.value as CategoryField['type'])}
            >
              {catalogFieldTypes.map((value) => (
                <option key={value} value={value}>
                  {fieldTypeLabels[value]}
                </option>
              ))}
            </CatalogSelect>
          </label>
          <label className="grid gap-2 text-sm">
            Ordre
            <Input
              name="sort_order"
              type="number"
              min={0}
              required
              defaultValue={field?.sort_order ?? position}
            />
          </label>
          <label className="grid gap-2 text-sm">
            Obligatoire à la publication
            <CatalogSelect name="is_required" defaultValue={String(field?.is_required ?? false)}>
              <option value="false">Facultatif</option>
              <option value="true">Obligatoire</option>
            </CatalogSelect>
          </label>
        </div>
        {type === 'select' || type === 'multi_select' ? (
          <label className="grid gap-2 text-sm">
            Options, une par ligne
            <CatalogTextarea name="options" defaultValue={field?.options.join('\n')} required />
          </label>
        ) : (
          <input type="hidden" name="options" value="" />
        )}
        <Button type="submit" variant={field ? 'secondary' : 'default'} size="sm" name="save">
          {field ? 'Enregistrer le champ' : 'Ajouter le champ'}
        </Button>
      </CatalogForm>
      {field && (
        <CatalogForm
          className="border-t border-border pt-3"
          run={deleteCategoryField.bind(null, categoryId, field.id)}
        >
          <ConfirmCatalogDeletion label="Supprimer le champ" />
        </CatalogForm>
      )}
    </div>
  );
}

export function CategoryFields({
  categoryId,
  fields,
}: {
  categoryId: string;
  fields: CategoryField[];
}) {
  const [adding, setAdding] = useState(false);
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Champs personnalisés</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Les champs utilisés par des fiches protègent leurs valeurs. Ajoutez un champ comme
            facultatif avant de le rendre obligatoire sur des fiches déjà publiées.
          </p>
        </div>
      </div>
      {fields.map((field) => (
        <details key={field.id} className="rounded-xl border border-border p-3">
          <summary className="cursor-pointer rounded-md font-medium focus-visible:outline-2 focus-visible:outline-ring">
            {field.label}{' '}
            <span className="text-xs text-muted-foreground">· {fieldTypeLabels[field.type]}</span>
          </summary>
          <div className="mt-4">
            <FieldSettings categoryId={categoryId} field={field} position={field.sort_order} />
          </div>
        </details>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-expanded={adding}
        onClick={() => setAdding(!adding)}
      >
        {adding ? 'Fermer le nouveau champ' : 'Nouveau champ'}
      </Button>
      {adding && (
        <FieldSettings
          key={fields.length}
          categoryId={categoryId}
          position={(fields.at(-1)?.sort_order ?? -1) + 1}
        />
      )}
    </Card>
  );
}

export function CategoryRemoval({
  category,
  categories,
  count,
}: {
  category: CatalogCategory;
  categories: CatalogCategory[];
  count: number;
}) {
  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-bold">Supprimer la catégorie</h2>
      <p className="text-sm text-muted-foreground">
        {count
          ? `${count} fiche(s) utilisent cette catégorie. Réaffectez-les à une catégorie compatible pour conserver leurs champs, relations et références de voyage.`
          : 'Cette catégorie ne contient aucune fiche.'}
      </p>
      {(count === 0 || categories.length > 1) && (
        <CatalogForm run={removeCategory.bind(null, category.id)}>
          {count > 0 && (
            <label className="grid gap-2 text-sm">
              Catégorie de destination
              <CatalogSelect name="destination" defaultValue="" required>
                <option value="" disabled>
                  Sélectionner une catégorie
                </option>
                {categories
                  .filter((item) => item.id !== category.id)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                      {item.is_enabled ? '' : ' (désactivée)'}
                    </option>
                  ))}
              </CatalogSelect>
            </label>
          )}
          <ConfirmCatalogDeletion
            label={count ? 'Réaffecter et supprimer' : 'Supprimer la catégorie'}
          />
        </CatalogForm>
      )}
    </Card>
  );
}
