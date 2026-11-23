'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { Button, Card, Input, Label } from '@nagi/ui';
import type { CatalogCategory, CatalogEntryDetail, CategoryField, Json } from '@nagi/database';
import { CatalogForm, CatalogSelect, CatalogTextarea } from '@/features/catalog/admin-form';
import { EntryEditor } from './editor';
import { findEntryFields, saveEntry } from './actions';
import { EntryLocationFields } from './location';
import { DeleteEntryButton } from './delete-button';
import { EntryWorkspace } from './workspace';
import { EntryButtonLinks } from './button-links';
import { FieldIcon } from '@/features/icons/field-icon';
import { ImagePicker } from '@/features/images/components';
import { PlaceImage } from '@/features/integrations/mapbox/place-image';

function EntryPublication({
  formId,
  entry,
  disabled,
  pending,
  feedback,
  onChange,
}: {
  formId: string;
  entry?: CatalogEntryDetail;
  disabled: boolean;
  pending: boolean;
  feedback: ReactNode;
  onChange: () => void;
}) {
  return (
    <Card className="space-y-4" onChange={onChange}>
      <h2 className="text-lg font-bold">Publication</h2>
      <fieldset disabled={pending} className="min-w-0 space-y-4" aria-busy={pending}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="entry-status">Statut</Label>
            <CatalogSelect
              id="entry-status"
              form={formId}
              name="published"
              defaultValue={String(entry?.published ?? false)}
            >
              <option value="false">Brouillon</option>
              <option value="true">Publiée</option>
            </CatalogSelect>
          </div>
          <div>
            <Label htmlFor="entry-order">Ordre dans la catégorie</Label>
            <Input
              id="entry-order"
              form={formId}
              name="sort_order"
              type="number"
              min={0}
              defaultValue={entry?.sort_order ?? 0}
              required
            />
          </div>
        </div>
        {!entry && (
          <p className="text-sm text-muted-foreground">
            La création de la fiche ouvrira ensuite la galerie pour ajouter vos images.
          </p>
        )}
        <Button form={formId} type="submit" disabled={disabled}>
          {pending ? 'Enregistrement…' : entry ? 'Enregistrer les modifications' : 'Créer la fiche'}
        </Button>
      </fieldset>
      {feedback}
    </Card>
  );
}

function FieldControl({ field, value }: { field: CategoryField; value: Json | undefined }) {
  if (field.type === 'buttons') return <EntryButtonLinks field={field} value={value} />;
  const name = `field-${field.id}`;
  const label = (
    <span className="inline-flex items-center gap-2">
      <FieldIcon name={field.icon} className="text-primary-ink" />
      {field.label}
      {field.is_required ? ' *' : ''}
    </span>
  );
  const scalar =
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : '';
  if (field.type === 'multi_select') {
    return (
      <fieldset className="rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-medium">{label}</legend>
        <div className="flex flex-wrap gap-3">
          {field.options.map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 rounded-full bg-muted px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                name={name}
                value={option}
                defaultChecked={Array.isArray(value) && value.includes(option)}
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      {field.type === 'long_text' ? (
        <CatalogTextarea id={name} name={name} maxLength={5000} defaultValue={scalar} />
      ) : field.type === 'select' || field.type === 'boolean' ? (
        <CatalogSelect id={name} name={name} defaultValue={scalar}>
          <option value="">Non renseigné</option>
          {field.type === 'boolean' ? (
            <>
              <option value="true">Oui</option>
              <option value="false">Non</option>
            </>
          ) : (
            field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))
          )}
        </CatalogSelect>
      ) : (
        <Input
          id={name}
          name={name}
          defaultValue={scalar}
          maxLength={field.type === 'url' ? 2048 : 250}
          type={field.type === 'date' ? 'date' : field.type === 'url' ? 'url' : 'text'}
          inputMode={field.type === 'number' ? 'decimal' : undefined}
        />
      )}
    </div>
  );
}

export function EntryForm({
  entry,
  categories,
  fields,
  media,
  relations,
  mediaCount,
  relationCount,
}: {
  entry?: CatalogEntryDetail;
  categories: CatalogCategory[];
  fields: CategoryField[];
  media?: ReactNode;
  relations?: ReactNode;
  mediaCount: number;
  relationCount: number;
}) {
  const formId = useId();
  const [categoryId, setCategory] = useState(entry?.category_id ?? '');
  const [extra, setExtra] = useState<{
    category: string;
    fields: CategoryField[];
    error?: string;
  }>();
  const original = entry?.category_id === categoryId;
  const active: typeof extra = original
    ? { category: categoryId, fields }
    : extra?.category === categoryId
      ? extra
      : undefined;
  const custom =
    entry?.custom_values &&
    typeof entry.custom_values === 'object' &&
    !Array.isArray(entry.custom_values)
      ? entry.custom_values
      : {};
  useEffect(() => {
    if (!categoryId || original) return;
    let current = true;
    findEntryFields(categoryId).then(
      (found) => {
        if (current) setExtra({ category: categoryId, fields: found });
      },
      () => {
        if (current)
          setExtra({
            category: categoryId,
            fields: [],
            error: 'Impossible de charger les champs de cette catégorie.',
          });
      },
    );
    return () => {
      current = false;
    };
  }, [categoryId, original]);

  return (
    <CatalogForm
      id={formId}
      run={saveEntry.bind(null, entry?.id ?? null)}
      protect
      renderLayout={({ form, feedback, pending, markDirty }) => (
        <EntryWorkspace
          saved={Boolean(entry)}
          mediaCount={mediaCount}
          relationCount={relationCount}
          content={
            <div className="space-y-5">
              {form}
              {entry && <DeleteEntryButton id={entry.id} title={entry.title} />}
            </div>
          }
          media={
            <div className="space-y-5">
              {entry && (
                <Card className="space-y-4">
                  <h2 className="text-lg font-bold">Photographie libre</h2>
                  <p className="text-sm text-muted-foreground">
                    Une sélection explicite peut illustrer cette fiche. Vos images importées sont
                    conservées dans la galerie.
                  </p>
                  <PlaceImage
                    category={entry.category?.name}
                    src={entry.cover_image_url}
                    photoReference={{ source: 'nagi', id: entry.id }}
                    credits="dialog"
                    className="aspect-[16/9] rounded-2xl"
                  />
                  <ImagePicker reference={{ source: 'nagi', id: entry.id }} />
                </Card>
              )}
              {media}
            </div>
          }
          relations={relations}
          publication={
            <EntryPublication
              formId={formId}
              entry={entry}
              disabled={!categoryId || !active || !!active.error}
              pending={pending}
              feedback={feedback}
              onChange={markDirty}
            />
          }
        />
      )}
    >
      <input type="hidden" name="updated_at" value={entry?.updated_at ?? ''} />
      <Card className="space-y-4">
        <h2 className="text-lg font-bold">Informations générales</h2>
        <div>
          <Label htmlFor="entry-title">Titre</Label>
          <Input
            id="entry-title"
            name="title"
            maxLength={180}
            required
            defaultValue={entry?.title}
          />
        </div>
        <div>
          <Label htmlFor="entry-summary">Résumé</Label>
          <CatalogTextarea
            id="entry-summary"
            name="summary"
            maxLength={400}
            rows={2}
            defaultValue={entry?.summary}
            placeholder="Quelques phrases pour les cartes et les résultats de recherche."
          />
        </div>
        <EntryEditor initial={entry?.description} />
      </Card>
      <Card className="space-y-4">
        <h2 className="text-lg font-bold">Localisation et catégorie</h2>
        <EntryLocationFields
          initial={{
            country: entry?.country ?? undefined,
            city: entry?.city ?? undefined,
            neighborhood: entry?.neighborhood ?? undefined,
          }}
        />
        <div>
          <Label htmlFor="entry-category">Catégorie</Label>
          <CatalogSelect
            id="entry-category"
            name="category_id"
            value={categoryId}
            required
            onChange={(event) => {
              setExtra(undefined);
              setCategory(event.target.value);
            }}
          >
            <option value="" disabled>
              Sélectionner une catégorie
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
                {category.is_enabled ? '' : ' (désactivée)'}
              </option>
            ))}
          </CatalogSelect>
        </div>
        {entry && categoryId && !original && Object.keys(custom).length > 0 && (
          <label className="flex items-start gap-2 rounded-xl border border-border bg-muted/50 p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              name="confirm_category_change"
              value="yes"
              required
            />
            Remplacer les anciennes valeurs personnalisées par celles de la nouvelle catégorie.
          </label>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="entry-latitude">Latitude</Label>
            <Input
              id="entry-latitude"
              name="latitude"
              inputMode="decimal"
              defaultValue={entry?.latitude ?? ''}
              placeholder="35,6895"
            />
          </div>
          <div>
            <Label htmlFor="entry-longitude">Longitude</Label>
            <Input
              id="entry-longitude"
              name="longitude"
              inputMode="decimal"
              defaultValue={entry?.longitude ?? ''}
              placeholder="139,6917"
            />
          </div>
        </div>
      </Card>
      <Card className="space-y-4">
        <h2 className="text-lg font-bold">Informations complémentaires</h2>
        <input type="hidden" name="fields_category" value={active?.category ?? ''} />
        <input
          type="hidden"
          name="fields_version"
          value={active?.fields.map((field) => field.id).join(',') ?? ''}
        />
        {!categoryId ? (
          <p className="text-sm text-muted-foreground">
            Choisissez une catégorie pour afficher ses champs.
          </p>
        ) : !active ? (
          <p role="status" className="text-sm text-muted-foreground">
            Chargement des champs…
          </p>
        ) : active.error ? (
          <p role="alert" className="text-sm text-destructive">
            {active.error}
          </p>
        ) : !active.fields.length ? (
          <p className="text-sm text-muted-foreground">
            Cette catégorie ne définit aucun champ supplémentaire.
          </p>
        ) : (
          <>
            {active.fields.some((field) => field.is_required) && (
              <p className="text-xs text-muted-foreground">* Obligatoire à la publication</p>
            )}
            <div key={categoryId} className="grid gap-4 sm:grid-cols-2">
              {active.fields.map((field) => (
                <div
                  key={field.id}
                  className={field.type === 'buttons' ? 'min-w-0 sm:col-span-2' : 'min-w-0'}
                >
                  <FieldControl field={field} value={original ? custom[field.id] : undefined} />
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </CatalogForm>
  );
}
