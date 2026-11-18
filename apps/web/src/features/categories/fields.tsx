'use client';

import { useId, useRef, useState } from 'react';
import { ArrowUpRight, Layers2, MousePointer2, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
  toast,
} from '@nagi/ui';
import { catalogButtonsLimit, catalogFieldTypes, toDestinationSlug } from '@nagi/shared';
import type { CategoryField } from '@nagi/database';
import { CatalogForm, CatalogSelect, CatalogTextarea } from '@/features/catalog/admin-form';
import { deleteCategoryField, saveCategoryField } from './actions';
import '@/features/entries/workspace.css';
import { IconPicker } from '@/features/icons/picker';
import { FieldIcon } from '@/features/icons/field-icon';

const fieldTypes = {
  short_text: ['Texte court', 'Une information courte, comme une origine ou un horaire.'],
  long_text: ['Texte long', 'Un complément de description sur plusieurs lignes.'],
  number: ['Nombre', 'Une valeur numérique, entière ou décimale.'],
  boolean: ['Oui / non', 'Une information à activer ou désactiver.'],
  url: ['Lien', 'Une adresse web affichée comme un lien.'],
  date: ['Date', 'Une date précise à renseigner sur la fiche.'],
  select: ['Choix unique', 'Une valeur à choisir parmi vos options.'],
  multi_select: ['Choix multiples', 'Plusieurs valeurs à choisir parmi vos options.'],
  buttons: [
    'Boutons',
    'Un ou plusieurs liens avec leurs propres libellés : sources, site officiel, réservation…',
  ],
} as const;

function FieldDialog({
  categoryId,
  field,
  position,
  removing,
  onClose,
  returnFocus,
}: {
  categoryId: string;
  field?: CategoryField;
  position: number;
  removing: boolean;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const controlId = useId();
  const [type, setType] = useState<CategoryField['type']>(field?.type ?? 'short_text');
  const [label, setLabel] = useState(field?.label ?? '');
  const [key, setKey] = useState<string>();
  const [options, setOptions] = useState(field?.options.join('\n') ?? '');
  const [pending, setPending] = useState(false);
  const [icon, setIcon] = useState<string | null>(field?.icon ?? null);
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
        className={`entry-editor-dialog ${removing ? 'max-w-md' : 'max-w-2xl'}`}
        onOpenAutoFocus={(event) => {
          if (removing) {
            event.preventDefault();
            cancel.current?.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
      >
        <div className="entry-dialog-heading">
          <DialogTitle>
            {removing ? 'Supprimer ce champ ?' : field ? 'Modifier le champ' : 'Ajouter un champ'}
          </DialogTitle>
          <DialogDescription>
            {removing
              ? 'Un champ renseigné dans des fiches ne peut pas être supprimé tant que ses valeurs sont utilisées.'
              : 'Définissez l’information que vous souhaitez renseigner sur les fiches de cette catégorie.'}
          </DialogDescription>
        </div>
        <CatalogForm
          run={
            removing && field
              ? deleteCategoryField.bind(null, categoryId, field.id)
              : saveCategoryField.bind(null, categoryId, field?.id ?? null)
          }
          onPendingChange={setPending}
          onSuccess={() => {
            toast.success(removing ? 'Champ supprimé.' : 'Champ enregistré.');
            onClose();
          }}
        >
          <div className="entry-dialog-body space-y-5">
            {removing ? (
              <>
                <input type="hidden" name="confirm" value="yes" />
                <p className="break-words text-sm leading-7">
                  Supprimer le champ <strong>« {field?.label} »</strong> de cette catégorie ?
                </p>
              </>
            ) : (
              <>
                <div className="grid gap-2 text-sm font-medium">
                  <Label htmlFor={`${controlId}-label`} className="mb-0">
                    Libellé
                  </Label>
                  <Input
                    id={`${controlId}-label`}
                    name="label"
                    value={label}
                    maxLength={100}
                    required
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder="Sources, site officiel…"
                  />
                </div>
                <IconPicker value={icon} onChange={setIcon} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2 text-sm font-medium">
                    <Label htmlFor={`${controlId}-type`} className="mb-0">
                      Type de champ
                    </Label>
                    <CatalogSelect
                      id={`${controlId}-type`}
                      name="type"
                      value={type}
                      onChange={(event) => setType(event.target.value as CategoryField['type'])}
                    >
                      {catalogFieldTypes.map((value) => (
                        <option key={value} value={value}>
                          {fieldTypes[value][0]}
                        </option>
                      ))}
                    </CatalogSelect>
                  </div>
                  <div className="grid gap-2 text-sm font-medium">
                    <Label htmlFor={`${controlId}-required`} className="mb-0">
                      Obligatoire à la publication
                    </Label>
                    <CatalogSelect
                      id={`${controlId}-required`}
                      name="is_required"
                      defaultValue={String(field?.is_required ?? false)}
                    >
                      <option value="false">Facultatif</option>
                      <option value="true">Obligatoire</option>
                    </CatalogSelect>
                  </div>
                </div>
                <div className="rounded-2xl border border-border bg-muted/40 p-4">
                  <p className="text-xs leading-6 text-muted-foreground">{fieldTypes[type][1]}</p>
                  {type === 'buttons' && (
                    <>
                      <div
                        aria-hidden="true"
                        className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-primary-ink"
                      >
                        {['Site officiel', 'Source'].map((name) => (
                          <span
                            key={name}
                            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2"
                          >
                            {name}
                            <ArrowUpRight className="size-3.5" />
                          </span>
                        ))}
                      </div>
                      <p className="mt-3 text-xs leading-6 text-muted-foreground">
                        Les libellés et les liens se renseignent sur chaque fiche, jusqu’à{' '}
                        {catalogButtonsLimit} boutons par champ.
                      </p>
                    </>
                  )}
                </div>
                {type === 'select' || type === 'multi_select' ? (
                  <div className="grid gap-2 text-sm font-medium">
                    <Label htmlFor={`${controlId}-options`} className="mb-0">
                      Options, une par ligne
                    </Label>
                    <CatalogTextarea
                      id={`${controlId}-options`}
                      name="options"
                      value={options}
                      onChange={(event) => setOptions(event.target.value)}
                      required
                    />
                  </div>
                ) : (
                  <input type="hidden" name="options" value="" />
                )}
                <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                  <div className="grid gap-2 text-sm font-medium">
                    <Label htmlFor={`${controlId}-key`} className="mb-0">
                      Clé du champ
                    </Label>
                    <Input
                      id={`${controlId}-key`}
                      name="key"
                      value={key ?? field?.key ?? toDestinationSlug(label).slice(0, 80)}
                      maxLength={80}
                      required
                      onChange={(event) => setKey(event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2 text-sm font-medium">
                    <Label htmlFor={`${controlId}-order`} className="mb-0">
                      Ordre
                    </Label>
                    <Input
                      id={`${controlId}-order`}
                      name="sort_order"
                      type="number"
                      min={0}
                      max={2147483647}
                      required
                      defaultValue={field?.sort_order ?? position}
                    />
                  </div>
                </div>
                <p className="text-xs leading-6 text-muted-foreground">
                  Les valeurs déjà renseignées sont protégées. Pour rendre un champ obligatoire,
                  complétez d’abord les fiches publiées.
                </p>
              </>
            )}
          </div>
          <div className="entry-dialog-footer">
            <Button ref={cancel} type="button" variant="ghost" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" variant={removing ? 'destructive' : 'default'}>
              {pending
                ? 'Enregistrement…'
                : removing
                  ? 'Supprimer le champ'
                  : field
                    ? 'Enregistrer le champ'
                    : 'Ajouter le champ'}
            </Button>
          </div>
        </CatalogForm>
      </DialogContent>
    </Dialog>
  );
}

export function CategoryFields({
  categoryId,
  fields,
}: {
  categoryId: string;
  fields: CategoryField[];
}) {
  const [dialog, setDialog] = useState<{
    mode: 'create' | 'edit' | 'remove';
    field?: CategoryField;
  }>();
  const add = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">Champs personnalisés</h2>
          <p className="mt-2 max-w-xl text-xs leading-6 text-muted-foreground">
            Adaptez les informations des fiches : détails pratiques, choix ou boutons vers vos
            sources.
          </p>
        </div>
        <Button
          ref={add}
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            opener.current = add.current;
            setDialog({ mode: 'create' });
          }}
        >
          <Plus className="size-3.5" />
          Nouveau champ
        </Button>
      </div>
      {fields.length ? (
        <ul className="space-y-3">
          {fields.map((field) => {
            const Icon = field.type === 'buttons' ? MousePointer2 : Layers2;
            return (
              <li
                key={field.id}
                className="flex items-center gap-2 rounded-2xl border border-border p-2"
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                  aria-label={`Modifier le champ ${field.label}`}
                  onClick={(event) => {
                    opener.current = event.currentTarget;
                    setDialog({ mode: 'edit', field });
                  }}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary-ink">
                    {field.icon ? <FieldIcon name={field.icon} /> : <Icon className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-bold">{field.label}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {fieldTypes[field.type][0]} ·{' '}
                      {field.is_required ? 'Obligatoire' : 'Facultatif'}
                    </span>
                  </span>
                  <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-8 shrink-0"
                  aria-label={`Supprimer le champ ${field.label}`}
                  onClick={(event) => {
                    opener.current = event.currentTarget;
                    setDialog({ mode: 'remove', field });
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-muted/25 p-6 text-center">
          <p className="text-sm font-semibold">Les bonnes informations pour chaque fiche.</p>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">
            Ajoutez votre premier champ pour enrichir cette catégorie.
          </p>
        </div>
      )}
      <Badge>
        {fields.length} champ{fields.length > 1 ? 's' : ''}
      </Badge>
      {dialog && (
        <FieldDialog
          key={`${dialog.mode}-${dialog.field?.id ?? 'new'}`}
          categoryId={categoryId}
          field={dialog.field}
          position={Math.min(2147483647, (fields.at(-1)?.sort_order ?? -1) + 1)}
          removing={dialog.mode === 'remove'}
          onClose={() => setDialog(undefined)}
          returnFocus={() => {
            if (opener.current?.isConnected) opener.current.focus();
            else add.current?.focus();
          }}
        />
      )}
    </Card>
  );
}
