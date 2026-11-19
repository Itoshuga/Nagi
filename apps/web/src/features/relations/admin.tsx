'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowLeftRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  Shapes,
  Trash2,
} from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  toast,
} from '@nagi/ui';
import type { RelationTypeStats } from '@nagi/database';
import { CatalogForm, CatalogSelect, CatalogTextarea } from '@/features/catalog/admin-form';
import { IconPicker } from '@/features/icons/picker';
import { FieldIcon } from '@/features/icons/field-icon';
import {
  deleteRelationType,
  orderRelationTypes,
  relationTypeDependencies,
  saveRelationType,
  toggleRelationType,
} from './actions';
import { RelationPreview } from './preview';
import './relations.css';

export { AdminEntryRelations } from './entry-relations';
const classes =
  'entry-editor-dialog relation-dialog translate-x-0 translate-y-0 sm:-translate-x-1/2 sm:-translate-y-1/2';
function TypeEditor({
  type,
  order,
  onClose,
  returnFocus,
}: {
  type?: RelationTypeStats;
  order: number;
  onClose: () => void;
  returnFocus: () => void;
}) {
  const id = useId(),
    [forward, setForward] = useState(type?.forward_label ?? ''),
    [inverse, setInverse] = useState(type?.inverse_label ?? ''),
    [symmetric, setSymmetric] = useState(type?.is_symmetric ?? false),
    [icon, setIcon] = useState(type?.icon ?? null),
    [iconOpen, setIconOpen] = useState(false),
    [acyclic, setAcyclic] = useState(type?.is_acyclic ?? false),
    [pending, setPending] = useState(false);
  const used = Boolean(type?.usage_count);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
    >
      <DialogContent
        closeDisabled={pending}
        className={`${classes} max-w-2xl`}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus();
        }}
        onEscapeKeyDown={(e) => {
          if (pending || iconOpen) e.preventDefault();
          if (iconOpen && !pending) setIconOpen(false);
        }}
        onPointerDownOutside={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        <div className="entry-dialog-heading">
          <DialogTitle>
            {type ? 'Modifier le type de relation' : 'Créer un type de relation'}
          </DialogTitle>
          <DialogDescription>
            Donnez un sens aux liens. Les libellés seront partagés par toutes les fiches utilisant
            ce type.
          </DialogDescription>
        </div>
        <CatalogForm
          run={saveRelationType.bind(null, type?.id ?? null)}
          onPendingChange={setPending}
          onSuccess={() => {
            toast.success('Type de relation enregistré.');
            onClose();
          }}
        >
          <input type="hidden" name="updated_at" value={type?.updated_at ?? ''} />
          <input type="hidden" name="sort_order" value={type?.sort_order ?? order} />
          <input type="hidden" name="slug" value={type?.slug ?? ''} />
          <div className="entry-dialog-body space-y-5">
            <div>
              <Label htmlFor={`${id}-name`}>
                Nom du type <span className="font-normal text-muted-foreground">· facultatif</span>
              </Label>
              <Input
                id={`${id}-name`}
                name="name"
                defaultValue={type?.name}
                maxLength={100}
                placeholder="Par exemple : Localisation"
              />
              {type && (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Clé permanente : {type.slug}
                </p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor={`${id}-forward`}>Libellé direct</Label>
                <Input
                  autoFocus
                  id={`${id}-forward`}
                  name="forward_label"
                  value={forward}
                  onChange={(e) => setForward(e.target.value)}
                  required
                  maxLength={120}
                  placeholder="Se situe dans"
                />
              </div>
              {!symmetric ? (
                <div>
                  <Label htmlFor={`${id}-inverse`}>Libellé inverse</Label>
                  <Input
                    id={`${id}-inverse`}
                    name="inverse_label"
                    value={inverse}
                    onChange={(e) => setInverse(e.target.value)}
                    required
                    maxLength={120}
                    placeholder="Abrite"
                  />
                </div>
              ) : (
                <input type="hidden" name="inverse_label" value={forward} />
              )}
            </div>
            <div>
              <Label htmlFor={`${id}-symmetry`}>Sens de lecture</Label>
              <CatalogSelect
                id={`${id}-symmetry`}
                name={used ? undefined : 'is_symmetric'}
                value={String(symmetric)}
                disabled={used}
                onChange={(e) => setSymmetric(e.target.value === 'true')}
              >
                <option value="false">Asymétrique · un libellé par sens</option>
                <option value="true">Symétrique · le même libellé des deux côtés</option>
              </CatalogSelect>
              {used && <input type="hidden" name="is_symmetric" value={String(symmetric)} />}
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                {used
                  ? 'Le comportement est conservé tant que ce type est utilisé. Les libellés restent modifiables.'
                  : symmetric
                    ? 'Le libellé direct est automatiquement utilisé dans les deux sens.'
                    : 'Les deux orientations seront proposées lors de l’ajout d’une relation.'}
              </p>
            </div>
            <RelationPreview
              current="Fiche A"
              other="Fiche B"
              type={{
                id: type?.id ?? 'preview',
                forward_label: forward || 'Libellé direct',
                inverse_label: inverse || 'Libellé inverse',
                is_symmetric: symmetric,
              }}
            />
            <div>
              <Label htmlFor={`${id}-description`}>
                Description <span className="font-normal text-muted-foreground">· facultative</span>
              </Label>
              <CatalogTextarea
                id={`${id}-description`}
                name="description"
                defaultValue={type?.description ?? ''}
                maxLength={1000}
                rows={2}
                placeholder="Quand utiliser ce type de relation ?"
              />
            </div>
            <IconPicker
              value={icon}
              onChange={setIcon}
              label="Icône du type"
              open={iconOpen}
              onOpenChange={setIconOpen}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor={`${id}-active`}>Statut</Label>
                <CatalogSelect
                  id={`${id}-active`}
                  name="is_enabled"
                  defaultValue={String(type?.is_enabled ?? true)}
                >
                  <option value="true">Actif</option>
                  <option value="false">Inactif</option>
                </CatalogSelect>
              </div>
              <div>
                <Label htmlFor={`${id}-hierarchy`}>Hiérarchie</Label>
                <CatalogSelect
                  id={`${id}-hierarchy`}
                  name={used || symmetric ? undefined : 'is_acyclic'}
                  value={String(symmetric ? false : acyclic)}
                  onChange={(e) => setAcyclic(e.target.value === 'true')}
                  disabled={used || symmetric}
                >
                  <option value="false">Les cycles sont autorisés</option>
                  <option value="true">Empêcher les cycles</option>
                </CatalogSelect>
                {(used || symmetric) && (
                  <input
                    type="hidden"
                    name="is_acyclic"
                    value={String(symmetric ? false : (type?.is_acyclic ?? false))}
                  />
                )}
              </div>
            </div>
            <p className="text-xs leading-6 text-muted-foreground">
              Désactiver un type empêche les nouvelles associations. Les relations déjà créées
              restent visibles.
            </p>
          </div>
          <div className="entry-dialog-footer">
            <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit">
              {pending ? 'Enregistrement…' : type ? 'Enregistrer le type' : 'Créer le type'}
            </Button>
          </div>
        </CatalogForm>
      </DialogContent>
    </Dialog>
  );
}
function DeleteType({
  type,
  types,
  onClose,
  returnFocus,
}: {
  type: RelationTypeStats;
  types: RelationTypeStats[];
  onClose: () => void;
  returnFocus: () => void;
}) {
  const [pending, setPending] = useState(false),
    [destination, setDestination] = useState('');
  const cancel = useRef<HTMLButtonElement>(null);
  const [dependencies, setDependencies] =
      useState<Awaited<ReturnType<typeof relationTypeDependencies>>>(),
    [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    relationTypeDependencies(type.id).then(
      (rows) => {
        if (!cancelled) setDependencies(rows);
      },
      () => {
        if (!cancelled) setError('Impossible de charger le détail des dépendances.');
      },
    );
    return () => {
      cancelled = true;
    };
  }, [type.id]);
  const compatible = types.filter(
    (t) =>
      t.id !== type.id &&
      t.is_enabled &&
      t.is_symmetric === type.is_symmetric &&
      t.is_acyclic === type.is_acyclic,
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
        className={`${classes} max-w-lg`}
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
          <DialogTitle>Supprimer ce type de relation ?</DialogTitle>
          <DialogDescription>
            {type.usage_count
              ? `${type.usage_count} relation(s) utilisent ce type. Réaffectez-les avant de le supprimer.`
              : 'Ce type ne possède aucune relation. Les fiches du catalogue seront conservées.'}
          </DialogDescription>
        </div>
        <CatalogForm
          run={deleteRelationType.bind(null, type.id)}
          onPendingChange={setPending}
          onSuccess={() => {
            toast.success('Type de relation supprimé.');
            onClose();
          }}
        >
          <input type="hidden" name="updated_at" value={type.updated_at} />
          <input type="hidden" name="confirm" value="yes" />
          <div className="entry-dialog-body space-y-5">
            <p className="text-sm font-bold">{type.name}</p>
            {error && <Alert role="alert">{error}</Alert>}
            {type.usage_count > 0 && (
              <>
                <ul className="space-y-3">
                  {dependencies?.map((r) => (
                    <li key={r.id} className="text-xs leading-6">
                      <Link
                        className="font-medium hover:underline"
                        href={`/admin/entries/${r.source.id}`}
                      >
                        {r.source.title}
                      </Link>
                      <span className="px-2 text-muted-foreground">↔</span>
                      <Link
                        className="font-medium hover:underline"
                        href={`/admin/entries/${r.target.id}`}
                      >
                        {r.target.title}
                      </Link>
                    </li>
                  ))}
                </ul>
                {!dependencies && !error && (
                  <p role="status" className="text-xs">
                    Chargement des dépendances…
                  </p>
                )}
                {type.usage_count > 6 && (
                  <p className="text-xs text-muted-foreground">
                    Les six premières associations sont affichées ; les {type.usage_count} seront
                    réaffectées.
                  </p>
                )}
                {compatible.length ? (
                  <div>
                    <Label htmlFor="relation-type-destination">Réaffecter les relations à</Label>
                    <CatalogSelect
                      id="relation-type-destination"
                      name="destination"
                      required
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                    >
                      <option value="">Choisir un type compatible…</option>
                      {compatible.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.forward_label} ↔ {t.inverse_label}
                        </option>
                      ))}
                    </CatalogSelect>
                    <p className="mt-2 text-xs leading-6 text-muted-foreground">
                      Les associations conserveront leur orientation et adopteront les libellés du
                      type choisi. Un doublon ou un cycle annulera l’opération entière.
                    </p>
                  </div>
                ) : (
                  <Alert>
                    Aucun type actif compatible. Vous pouvez désactiver ce type pour conserver ses
                    associations.
                  </Alert>
                )}
              </>
            )}
          </div>
          <div className="entry-dialog-footer">
            <Button ref={cancel} type="button" variant="ghost" disabled={pending} onClick={onClose}>
              Annuler
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={type.usage_count > 0 && !destination}
            >
              {pending
                ? 'Suppression…'
                : type.usage_count
                  ? 'Réaffecter et supprimer'
                  : 'Supprimer le type'}
            </Button>
          </div>
        </CatalogForm>
      </DialogContent>
    </Dialog>
  );
}
export function RelationTypeAdmin({ types }: { types: RelationTypeStats[] }) {
  const add = useRef<HTMLButtonElement>(null),
    restore = useRef<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<{ mode: 'create' | 'edit' | 'remove'; id?: string }>(),
    [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const selected = types.find((t) => t.id === dialog?.id);
  function returnFocus() {
    if (restore.current?.isConnected) restore.current.focus();
    else add.current?.focus();
  }
  function mutate(run: () => Promise<{ ok: boolean; message: string }>) {
    if (busy.current) return;
    busy.current = true;
    startTransition(async () => {
      setError('');
      try {
        const result = await run();
        if (result.ok) toast.success(result.message);
        else setError(result.message);
      } catch {
        setError('La modification a échoué. Réessayez.');
      } finally {
        busy.current = false;
      }
    });
  }
  function move(index: number, offset: number) {
    const ids = types.map((t) => t.id);
    [ids[index], ids[index + offset]] = [ids[index + offset]!, ids[index]!];
    mutate(() => orderRelationTypes(ids));
  }
  return (
    <div className="mt-8 max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          {types.length} types · des libellés partagés par tout le catalogue
        </p>
        <Button
          ref={add}
          type="button"
          size="sm"
          onClick={() => {
            restore.current = add.current;
            setDialog({ mode: 'create' });
          }}
        >
          <Plus className="size-4" />
          Ajouter un type
        </Button>
      </div>
      {error && <Alert role="alert">{error}</Alert>}
      <div className="relation-type-list">
        {types.map((type, index) => (
          <div key={type.id} className="relation-type-row">
            <span className="relation-type-mark">
              {type.icon ? (
                <FieldIcon name={type.icon} className="size-5" />
              ) : (
                <Shapes className="size-5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="break-words text-sm font-bold">{type.name}</h2>
                <Badge className={type.is_enabled ? 'bg-accent text-primary-ink' : undefined}>
                  {type.is_enabled ? 'Actif' : 'Inactif'}
                </Badge>
              </div>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 break-words text-xs leading-6 text-muted-foreground">
                <span>{type.forward_label}</span>
                <ArrowLeftRight className="size-3 shrink-0" />
                <span>{type.inverse_label}</span>
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {type.is_symmetric ? 'Symétrique' : 'Asymétrique'}
                {type.is_acyclic ? ' · Hiérarchique' : ''} · {type.usage_count}{' '}
                {type.usage_count === 1 ? 'relation' : 'relations'}
              </p>
            </div>
            <div className="relation-type-actions">
              <div className="flex flex-col">
                <Button
                  size="icon"
                  className="size-7"
                  variant="ghost"
                  aria-label={`Monter ${type.name}`}
                  disabled={pending || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-3" />
                </Button>
                <Button
                  size="icon"
                  className="size-7"
                  variant="ghost"
                  aria-label={`Descendre ${type.name}`}
                  disabled={pending || index === types.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-3" />
                </Button>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label={`Options du type ${type.name}`}
                    disabled={pending}
                    onClick={(e) => {
                      restore.current = e.currentTarget;
                    }}
                  >
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="entry-media-menu">
                  <DropdownMenuItem onSelect={() => setDialog({ mode: 'edit', id: type.id })}>
                    <Pencil className="size-4" />
                    Modifier le type
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() =>
                      mutate(() => toggleRelationType(type.id, !type.is_enabled, type.updated_at))
                    }
                  >
                    <Power className="size-4" />
                    {type.is_enabled ? 'Désactiver le type' : 'Activer le type'}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onSelect={() => setDialog({ mode: 'remove', id: type.id })}
                  >
                    <Trash2 className="size-4" />
                    Supprimer le type
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
        {!types.length && (
          <p className="p-8 text-center text-sm text-muted-foreground">
            Créez le premier type pour relier vos fiches.
          </p>
        )}
      </div>
      {dialog?.mode === 'create' && (
        <TypeEditor
          order={Math.max(0, ...types.map((t) => t.sort_order)) + 10}
          onClose={() => setDialog(undefined)}
          returnFocus={returnFocus}
        />
      )}
      {dialog?.mode === 'edit' && selected && (
        <TypeEditor
          type={selected}
          order={selected.sort_order}
          onClose={() => setDialog(undefined)}
          returnFocus={returnFocus}
        />
      )}
      {dialog?.mode === 'remove' && selected && (
        <DeleteType
          type={selected}
          types={types}
          onClose={() => setDialog(undefined)}
          returnFocus={returnFocus}
        />
      )}
    </div>
  );
}
