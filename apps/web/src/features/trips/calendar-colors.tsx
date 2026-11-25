'use client';

import dynamic from 'next/dynamic';
import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
} from 'react';
import {
  Check,
  ChevronRight,
  LoaderCircle,
  Palette,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  cn,
} from '@nagi/ui';
import {
  calendarEventColor,
  calendarPresets,
  calendarSwatchInk,
  type SavedCalendarColor,
  type TripResult,
} from '@nagi/shared';
import type { TripPlan, TripPlanItem } from '@nagi/database';
import type { PlanMutation } from './planner-model';
import {
  addCalendarColor,
  listCalendarColors,
  removeCalendarColor,
} from './calendar-color-actions';
import './calendar-colors.css';
import { RemoveTripStepDialog } from './remove-step-dialog';

const CustomColorDialog = dynamic(
  () => import('./calendar-color-dialog').then((module) => module.CustomColorDialog),
  { ssr: false },
);
const ManageColorsDialog = dynamic(
  () => import('./calendar-color-dialog').then((module) => module.ManageColorsDialog),
  { ssr: false },
);
type ColorTarget = {
  id: string;
  trip: number;
  version: number;
  x: number;
  y: number;
  focus: HTMLElement | null;
  snapshot: TripPlanItem;
};
type ColorAccess = {
  open: (item: TripPlanItem, point?: { x: number; y: number }, focus?: HTMLElement | null) => void;
  enabled: boolean;
  visible: boolean;
};
const CalendarColorContext = createContext<ColorAccess | null>(null);
export const useCalendarColors = () => useContext(CalendarColorContext);

export function CalendarColorsProvider({
  guild,
  plan,
  canEdit,
  busy,
  mutate,
  onEdit,
  children,
}: {
  guild: string;
  plan: TripPlan;
  canEdit: boolean;
  busy: boolean;
  mutate: PlanMutation;
  onEdit?: (item: TripPlanItem) => void;
  children: ReactNode;
}) {
  const [target, setTarget] = useState<ColorTarget>();
  const [menu, setMenu] = useState(false);
  const [removing, setRemoving] = useState<ColorTarget>();
  const [dialog, setDialog] = useState<'create' | 'manage'>();
  const [colors, setColors] = useState<SavedCalendarColor[]>([]);
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');
  const [paletteError, setPaletteError] = useState('');
  const loading = useRef(false),
    loaded = useRef(false),
    openingDialog = useRef(false);
  const pendingEdit = useRef<TripPlanItem | undefined>(undefined);
  const item = plan.items.find((entry) => entry.id === target?.id);
  const enabled = canEdit && !busy;
  async function load() {
    if (loading.current || loaded.current) return;
    loading.current = true;
    setPhase('loading');
    setPaletteError('');
    try {
      const result = await listCalendarColors(guild);
      if (result.ok) {
        setColors(result.data);
        loaded.current = true;
        setPhase('ready');
      } else {
        setPaletteError(result.error);
        setPhase('failed');
      }
    } catch {
      setPhase('failed');
      setPaletteError('Impossible de charger vos couleurs. Réessayez.');
    } finally {
      loading.current = false;
    }
  }
  function focusBack() {
    requestAnimationFrame(() => {
      if (target?.focus?.isConnected) target.focus.focus();
      else {
        const fallback =
          document.querySelector<HTMLElement>(
            `.trip-context-panel, [data-calendar-item-id="${target?.id}"] .trip-calendar-event-copy`,
          ) ?? document.querySelector<HTMLElement>('.trip-calendar-scroll');
        fallback?.focus();
      }
    });
  }
  function open(item: TripPlanItem, point?: { x: number; y: number }, focus?: HTMLElement | null) {
    if (!enabled) return;
    const element =
      focus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const rect = element?.getBoundingClientRect();
    setTarget({
      id: item.id,
      trip: plan.version,
      version: item.version,
      x: point?.x ?? rect?.left ?? 20,
      y: point?.y ?? rect?.bottom ?? 20,
      focus: element,
      snapshot: item,
    });
    openingDialog.current = false;
    pendingEdit.current = undefined;
    setMenu(true);
    void load();
  }
  async function apply(color: string | null): Promise<TripResult> {
    if (!target || !canEdit || busy || !item)
      return { ok: false, error: 'Cette activité n’est plus modifiable.' };
    return mutate(
      { operation: 'color_item', data: { id: target.id, item_version: target.version, color } },
      target.trip,
      { item: target.snapshot },
    );
  }
  function choose(color: string | null) {
    setMenu(false);
    void apply(color);
  }
  function showDialog(next: 'create' | 'manage') {
    openingDialog.current = true;
    setMenu(false);
    setDialog(next);
  }
  function closeDialog() {
    setDialog(undefined);
    openingDialog.current = false;
    focusBack();
  }
  const current = item
    ? calendarEventColor(item.calendar_color, item.entry?.category?.color)
    : null;
  const swatch = (hex: string, name: string) => (
    <DropdownMenuRadioItem
      key={hex}
      value={hex}
      aria-label={name}
      className="calendar-color-swatch"
      style={{ backgroundColor: hex, color: calendarSwatchInk(hex) }}
      onSelect={() => choose(hex)}
    >
      {current === hex && <Check className="size-3.5" aria-hidden="true" />}
    </DropdownMenuRadioItem>
  );
  return (
    <CalendarColorContext value={{ open, enabled, visible: canEdit }}>
      {children}
      {target && (
        <DropdownMenu open={menu && enabled && !!item} onOpenChange={setMenu}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className="calendar-context-anchor"
              style={{ left: target.x, top: target.y }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="calendar-color-menu"
            align="start"
            sideOffset={0}
            collisionPadding={10}
            onContextMenu={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              const edit = pendingEdit.current;
              pendingEdit.current = undefined;
              // Release the menu's focus trap before opening the details panel.
              if (edit) requestAnimationFrame(() => onEdit?.(edit));
              else if (!openingDialog.current) focusBack();
            }}
          >
            <DropdownMenuLabel className="calendar-color-menu-label">
              Couleur de l’activité
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={current ?? ''} className="calendar-color-swatches">
              {calendarPresets.map((color) => swatch(color.hex, color.name))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="calendar-color-menu-item">
                Couleurs personnalisées <ChevronRight className="size-3.5" aria-hidden="true" />
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="calendar-custom-submenu">
                {phase === 'loading' && (
                  <p role="status" className="calendar-palette-message">
                    <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
                    Chargement…
                  </p>
                )}
                {!!colors.length && (
                  <DropdownMenuRadioGroup
                    value={current ?? ''}
                    className="calendar-color-swatches is-custom"
                  >
                    {colors.map((color) => swatch(color.hex_color, color.hex_color))}
                  </DropdownMenuRadioGroup>
                )}
                {paletteError && (
                  <div className="calendar-palette-message" role="alert">
                    {paletteError}
                    <button type="button" onClick={() => void load()}>
                      Réessayer
                    </button>
                  </div>
                )}
                <DropdownMenuItem
                  disabled={phase !== 'ready'}
                  onSelect={() => showDialog('create')}
                >
                  <Plus className="size-3.5" />
                  Ajouter une couleur personnalisée
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={phase !== 'ready'}
                  onSelect={() => showDialog('manage')}
                >
                  <Settings2 className="size-3.5" />
                  Gérer mes couleurs
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator className="calendar-color-menu-divider" />
            <DropdownMenuItem onSelect={() => choose(null)}>
              <RotateCcw className="size-3.5" />
              Couleur par défaut
              {item?.calendar_color == null && <Check className="ml-auto size-3.5" />}
            </DropdownMenuItem>
            {onEdit && (
              <>
                <DropdownMenuSeparator className="calendar-color-menu-divider" />
                <DropdownMenuItem
                  onSelect={() => {
                    if (item) pendingEdit.current = item;
                  }}
                >
                  <Pencil className="size-3.5" /> Modifier l’étape
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive"
                  onSelect={() => {
                    openingDialog.current = true;
                    setMenu(false);
                    setRemoving(target);
                  }}
                >
                  <Trash2 className="size-3.5" /> Supprimer l’étape
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {removing && canEdit && (
        <RemoveTripStepDialog
          item={removing.snapshot}
          version={removing.trip}
          busy={busy}
          mutate={mutate}
          onClose={() => {
            setRemoving(undefined);
            openingDialog.current = false;
          }}
          returnFocus={focusBack}
        />
      )}
      {dialog === 'create' && item && target && (
        <CustomColorDialog
          item={item}
          colors={colors}
          busy={busy}
          canEdit={canEdit}
          onClose={closeDialog}
          onReload={() =>
            setTarget({ ...target, trip: plan.version, version: item.version, snapshot: item })
          }
          onAdd={async (hex) => {
            const saved = await addCalendarColor(guild, hex);
            if (!saved.ok) return saved;
            setColors((previous) =>
              [...previous.filter((color) => color.id !== saved.data.id), saved.data].sort(
                (a, b) => a.sort_order - b.sort_order,
              ),
            );
            const applied = await apply(saved.data.hex_color);
            return applied.ok
              ? { ok: true }
              : {
                  ...applied,
                  error: `La couleur est enregistrée dans votre palette. ${applied.error}`,
                };
          }}
        />
      )}
      {dialog === 'manage' && (
        <ManageColorsDialog
          colors={colors}
          onClose={closeDialog}
          onRemove={async (id) => {
            const result = await removeCalendarColor(guild, id);
            if (result.ok) setColors((previous) => previous.filter((color) => color.id !== id));
            return result;
          }}
        />
      )}
    </CalendarColorContext>
  );
}

export function CalendarColorAction({
  item,
  className,
  children,
}: {
  item: TripPlanItem;
  className?: string;
  children?: ReactNode;
}) {
  const access = useCalendarColors();
  if (!access?.visible) return null;
  return (
    <button
      type="button"
      className={cn('trip-detail-color', className)}
      aria-label="Couleur du calendrier"
      disabled={!access.enabled}
      onClick={(event) => access.open(item, undefined, event.currentTarget)}
    >
      {children ?? (
        <>
          <Palette className="size-4" aria-hidden="true" />
          <span>Couleur du calendrier</span>
        </>
      )}
      <span
        className="calendar-current-color"
        style={
          {
            backgroundColor: calendarEventColor(item.calendar_color, item.entry?.category?.color),
          } as CSSProperties
        }
        aria-label={item.calendar_color ?? 'Couleur par défaut'}
      />
    </button>
  );
}
