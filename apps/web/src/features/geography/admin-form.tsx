'use client';

import { useActionState, useEffect, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, LoaderCircle, Trash2 } from 'lucide-react';
import { Alert, Button, Card, Input, Label, cn, toast } from '@nagi/ui';
import {
  coverFileSchema,
  coverMebibyte,
  coverMimeTypes,
  toDestinationSlug,
  type DestinationKind,
} from '@nagi/shared';
import type { Destination } from '@nagi/database';
import { saveDestination, type DestinationActionState } from './actions';
import { CityPicker, type CityOption } from './city-picker';
import { DestinationCover } from './cover';
import { ImagePicker } from '@/features/images/components';
import { selectClass } from './model';

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function DestinationForm({
  kind,
  initial,
  parentId,
  cities,
  selectedCity,
  countries,
  maxImageSize,
  modeWarning,
}: {
  kind: DestinationKind;
  initial?: Destination;
  parentId?: string;
  cities: CityOption[];
  selectedCity?: CityOption;
  countries: { id: string; name: string; iso_code: string | null }[];
  maxImageSize: number;
  modeWarning?: string;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial?.name ?? '');
  const [customSlug, setCustomSlug] = useState<string | null>(initial?.slug ?? null);
  const [published, setPublished] = useState(initial?.is_published ?? false);
  const [hasNeighborhoods, setHasNeighborhoods] = useState(
    !!initial && 'has_neighborhoods' in initial && initial.has_neighborhoods,
  );
  const [file, setFile] = useState<{ file: File; preview: string }>();
  const [removed, setRemoved] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [coverError, setCoverError] = useState('');
  const [state, submit, pending] = useActionState(
    async (_: DestinationActionState, data: FormData) => {
      if (file) data.set('cover', file.file);
      if (removed) data.set('remove_cover', 'true');
      const result = await saveDestination(
        kind,
        initial?.id ?? null,
        initial?.updated_at ?? null,
        data,
      );
      if (result.success) {
        toast.success(result.success);
        if (result.href) router.replace(result.href);
        else router.refresh();
      }
      return result;
    },
    {},
  );

  const filePreview = file?.preview;
  useEffect(
    () => () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    },
    [filePreview],
  );

  // Keep form content after a failed server action, including fields that were not invalid.
  const [values, setValues] = useState({
    iso_code: initial && 'iso_code' in initial ? (initial.iso_code ?? '') : '',
    country_id: initial && 'country_id' in initial ? initial.country_id : (parentId ?? ''),
    description: initial?.description ?? '',
    latitude: initial && 'latitude' in initial ? String(initial.latitude ?? '') : '',
    longitude: initial && 'longitude' in initial ? String(initial.longitude ?? '') : '',
    sort_order: String(initial?.sort_order ?? 0),
  });
  function setValue(key: keyof typeof values, value: string) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }
  function selectFile(input?: File) {
    if (!input || pending) return;
    const parsed = coverFileSchema(maxImageSize).safeParse(input);
    if (!parsed.success) {
      setCoverError(parsed.error.issues[0]!.message);
      return;
    }
    setCoverError('');
    setRemoved(false);
    setFile({ file: input, preview: URL.createObjectURL(input) });
  }
  function invalid(id: string) {
    return {
      'aria-invalid': !!state.fields?.[id],
      'aria-describedby': state.fields?.[id] ? `${id}-error` : undefined,
    };
  }
  const cover = file?.preview ?? (removed ? null : initial?.cover_image_url);
  const disabled = pending || !!state.success;

  return (
    <form action={submit} noValidate aria-busy={pending}>
      <fieldset
        disabled={disabled}
        className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,21rem)]"
      >
        <Card className="space-y-5 p-5 sm:p-6">
          <h2 className="text-base font-semibold">Informations générales</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field id="name" label="Nom" error={state.fields?.name}>
              <Input
                id="name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                required
                {...invalid('name')}
              />
            </Field>
            <Field id="slug" label="Adresse dans le catalogue" error={state.fields?.slug}>
              <Input
                id="slug"
                name="slug"
                value={customSlug ?? toDestinationSlug(name)}
                onChange={(event) => setCustomSlug(event.target.value || null)}
                maxLength={100}
                {...invalid('slug')}
              />
            </Field>
          </div>
          {kind === 'countries' && (
            <Field id="iso_code" label="Code ISO (2 lettres)" error={state.fields?.iso_code}>
              <Input
                id="iso_code"
                name="iso_code"
                value={values.iso_code}
                onChange={(event) => setValue('iso_code', event.target.value.toUpperCase())}
                placeholder="JP"
                maxLength={2}
                required
                className="max-w-40 uppercase"
                {...invalid('iso_code')}
              />
            </Field>
          )}
          {kind === 'cities' && (
            <Field id="country_id" label="Pays" error={state.fields?.country_id}>
              <select
                id="country_id"
                name="country_id"
                className={selectClass}
                value={values.country_id}
                onChange={(event) => setValue('country_id', event.target.value)}
                required
                {...invalid('country_id')}
              >
                <option value="">Sélectionner un pays</option>
                {countries.map((country) => (
                  <option value={country.id} key={country.id}>
                    {country.name}
                    {country.iso_code ? ` · ${country.iso_code}` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {kind === 'neighborhoods' && (
            <Field id="city_id" label="Ville" error={state.fields?.city_id}>
              <CityPicker initial={selectedCity} options={cities} error={state.fields?.city_id} />
            </Field>
          )}
          <Field id="description" label="Description" error={state.fields?.description}>
            <textarea
              id="description"
              name="description"
              rows={5}
              maxLength={5000}
              value={values.description}
              onChange={(event) => setValue('description', event.target.value)}
              className={cn(selectClass, 'h-auto min-h-28 resize-y py-3')}
              {...invalid('description')}
            />
          </Field>
          {kind !== 'countries' && (
            <div className="grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
              <Field id="latitude" label="Latitude (facultative)" error={state.fields?.latitude}>
                <Input
                  id="latitude"
                  name="latitude"
                  inputMode="decimal"
                  placeholder="−90 à 90"
                  value={values.latitude}
                  onChange={(event) => setValue('latitude', event.target.value)}
                  {...invalid('latitude')}
                />
              </Field>
              <Field id="longitude" label="Longitude (facultative)" error={state.fields?.longitude}>
                <Input
                  id="longitude"
                  name="longitude"
                  inputMode="decimal"
                  placeholder="−180 à 180"
                  value={values.longitude}
                  onChange={(event) => setValue('longitude', event.target.value)}
                  {...invalid('longitude')}
                />
              </Field>
            </div>
          )}
          {kind === 'cities' && (
            <div className="space-y-2 border-t border-border pt-5">
              <label className="flex cursor-pointer flex-wrap items-center justify-between gap-3 text-sm font-medium">
                <span>Cette ville possède-t-elle des quartiers ?</span>
                <span className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    role="switch"
                    className="peer sr-only"
                    checked={hasNeighborhoods}
                    onChange={(event) => setHasNeighborhoods(event.target.checked)}
                    aria-describedby="mode-help"
                  />
                  <span
                    aria-hidden="true"
                    className="relative h-6 w-11 rounded-full border border-border bg-muted after:absolute after:left-0.5 after:top-0.5 after:size-4.5 after:rounded-full after:bg-card after:shadow-sm after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
                  />
                  <span aria-hidden="true" className="w-7">
                    {hasNeighborhoods ? 'Oui' : 'Non'}
                  </span>
                </span>
              </label>
              <input type="hidden" name="has_neighborhoods" value={String(hasNeighborhoods)} />
              <p id="mode-help" className="text-xs leading-5 text-muted-foreground">
                {hasNeighborhoods
                  ? 'Dans Découvrir, la sélection d’un quartier précède les catégories.'
                  : 'Dans Découvrir, les catégories sont accessibles depuis la ville.'}
              </p>
              {(state.fields?.has_neighborhoods || modeWarning) && (
                <p
                  role="status"
                  className="rounded-xl border border-border bg-muted/70 p-3 text-xs leading-5"
                >
                  {state.fields?.has_neighborhoods ?? modeWarning}
                </p>
              )}
            </div>
          )}
        </Card>
        <div className="min-w-0 space-y-5">
          <Card className="space-y-4 p-5 sm:p-6">
            <h2 className="text-base font-semibold">Couverture</h2>
            <div
              className={cn(
                'rounded-xl border border-dashed border-border',
                dragging && 'border-ring ring-2 ring-ring/20',
              )}
              onDragOver={(event) => {
                event.preventDefault();
                if (!disabled) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                if (!disabled) selectFile(event.dataTransfer.files[0]);
              }}
            >
              {(cover || initial) && (
                <DestinationCover
                  id={!file && !removed ? initial?.id : undefined}
                  kind={kind}
                  src={cover}
                  className="aspect-[16/10] rounded-t-xl"
                  eager
                />
              )}
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex min-h-24 w-full flex-col items-center justify-center gap-2 rounded-xl px-3 py-4 text-center text-sm hover:bg-muted focus-visible:outline-offset-[-2px]"
                aria-describedby="cover-help"
              >
                <ImagePlus aria-hidden="true" className="size-5 text-primary-ink" />
                <span>{cover ? 'Remplacer l’image' : 'Choisir ou déposer une image'}</span>
              </button>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept={coverMimeTypes.join(',')}
              hidden
              onChange={(event) => {
                selectFile(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
            <p id="cover-help" className="text-xs text-muted-foreground">
              JPEG, PNG ou WebP statique. {maxImageSize / coverMebibyte} Mo maximum.
            </p>
            {(coverError || state.fields?.cover) && (
              <p role="alert" className="text-xs text-destructive">
                {coverError || state.fields?.cover}
              </p>
            )}
            {cover && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-ml-3 text-destructive"
                onClick={() => {
                  setFile(undefined);
                  setRemoved(true);
                  setCoverError('');
                }}
              >
                <Trash2 className="size-4" /> Retirer l’image
              </Button>
            )}
            {removed && initial?.cover_image_url && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setRemoved(false)}>
                Garder l’image actuelle
              </Button>
            )}
            {initial && (
              <div className="space-y-2 border-t border-border pt-4">
                <p className="text-sm font-semibold">Photographie de couverture</p>
                <ImagePicker
                  reference={{
                    source: 'nagi',
                    id: initial.id,
                    kind: (
                      {
                        countries: 'country',
                        cities: 'city',
                        neighborhoods: 'neighborhood',
                      } as const
                    )[kind],
                  }}
                  disabled={disabled || !!file || removed}
                />
              </div>
            )}
          </Card>
          <Card className="space-y-4 p-5 sm:p-6">
            <Field id="is_published" label="Publication" error={state.fields?.is_published}>
              <select
                id="is_published"
                name="is_published"
                className={selectClass}
                value={String(published)}
                onChange={(event) => setPublished(event.target.value === 'true')}
                {...invalid('is_published')}
              >
                <option value="false">Brouillon</option>
                <option value="true">Publié</option>
              </select>
            </Field>
            <Field id="sort_order" label="Ordre d’affichage" error={state.fields?.sort_order}>
              <Input
                id="sort_order"
                name="sort_order"
                type="number"
                min={0}
                step={1}
                value={values.sort_order}
                onChange={(event) => setValue('sort_order', event.target.value)}
                {...invalid('sort_order')}
              />
            </Field>
            <p className="text-xs leading-5 text-muted-foreground">
              Les positions les plus petites apparaissent en premier.
            </p>
          </Card>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
          <Button type="submit" disabled={disabled}>
            {pending && <LoaderCircle className="size-4 animate-spin" />}
            {pending
              ? 'Enregistrement…'
              : initial
                ? 'Enregistrer les modifications'
                : 'Créer la destination'}
          </Button>
          {state.error && <Alert className="text-destructive">{state.error}</Alert>}
          {state.fields && (
            <p role="status" className="text-xs font-medium text-destructive">
              Vérifiez les champs signalés.
            </p>
          )}
        </div>
      </fieldset>
    </form>
  );
}
