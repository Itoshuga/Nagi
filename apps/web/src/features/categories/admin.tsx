'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Badge, Button, Card, EmptyState, Input, Label } from '@nagi/ui';
import { catalogIcons, toDestinationSlug, type CatalogIconName } from '@nagi/shared';
import type { CatalogCategory } from '@nagi/database';
import { CatalogForm, CatalogSelect, CatalogTextarea } from '@/features/catalog/admin-form';
import { SortableCatalog } from '@/features/catalog/sortable';
import { CategoryIcon } from './icon';
import { orderCategories, saveCategory } from './actions';
export { CategoryFields } from './fields';
export { CategoryRemoval } from './delete-button';

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
