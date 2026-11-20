'use client';

import { calendarColorStyle } from './calendar-color-style';
import { useId, useRef, useState } from 'react';
import { Check, LoaderCircle, Trash2 } from 'lucide-react';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
} from '@nagi/ui';
import type { TripPlanItem } from '@nagi/database';
import {
  calendarEventColor,
  calendarHexToHsv,
  calendarPaletteLimit,
  calendarSwatchInk,
  formatTripDuration,
  formatTripTime,
  hsvToCalendarHex,
  normalizeCalendarHex,
  type CalendarHsv,
  type SavedCalendarColor,
} from '@nagi/shared';
import { itemDuration } from './planner-model';

type ColorResult = { ok: true } | { ok: false; error: string; reason?: string };
export function CustomColorDialog({
  item,
  colors,
  busy,
  canEdit,
  onClose,
  onAdd,
  onReload,
}: {
  item: TripPlanItem;
  colors: SavedCalendarColor[];
  busy: boolean;
  canEdit: boolean;
  onClose: () => void;
  onAdd: (hex: string) => Promise<ColorResult>;
  onReload: () => void;
}) {
  const id = useId();
  const initial = calendarEventColor(item.calendar_color, item.entry?.category?.color);
  const [hsv, setHsv] = useState(() => calendarHexToHsv(initial));
  const [input, setInput] = useState(initial);
  const [pending, setPending] = useState(false),
    inFlight = useRef(false);
  const [error, setError] = useState(''),
    [conflict, setConflict] = useState(false);
  const plane = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | undefined>(undefined);
  const hex = hsvToCalendarHex(hsv),
    parsed = normalizeCalendarHex(input);
  const locked = busy || pending;
  const duplicate = colors.some((color) => color.hex_color === parsed);
  const full = colors.length >= calendarPaletteLimit && !duplicate;
  function update(next: CalendarHsv) {
    setHsv(next);
    setInput(hsvToCalendarHex(next));
  }
  function point(clientX: number, clientY: number) {
    const rect = plane.current?.getBoundingClientRect();
    if (!rect) return;
    update({
      h: hsv.h,
      s: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      v: Math.max(0, Math.min(100, 100 - ((clientY - rect.top) / rect.height) * 100)),
    });
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !locked) onClose();
      }}
    >
      <DialogContent
        className="calendar-custom-color-dialog"
        closeDisabled={locked}
        onEscapeKeyDown={(event) => {
          event.stopPropagation();
          if (locked) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (locked) event.preventDefault();
        }}
      >
        <DialogTitle>Ajouter une couleur personnalisée</DialogTitle>
        <DialogDescription>
          Votre palette reste personnelle. La couleur de l’activité est partagée avec le voyage.
        </DialogDescription>
        <form
          className="calendar-custom-color-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (locked || inFlight.current || !canEdit) return;
            if (!parsed) {
              setError('Saisissez une couleur HEX valide, par exemple #73A6DF.');
              return;
            }
            inFlight.current = true;
            setPending(true);
            setError('');
            try {
              const result = await onAdd(parsed);
              if (result.ok) onClose();
              else {
                setError(result.error);
                setConflict(result.reason === 'conflict');
              }
            } catch {
              setError('Impossible d’enregistrer cette couleur. Réessayez.');
            } finally {
              inFlight.current = false;
              setPending(false);
            }
          }}
        >
          <fieldset disabled={locked || !canEdit}>
            <div
              ref={plane}
              className="calendar-color-plane"
              role="group"
              aria-label="Saturation et luminosité"
              style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
              onPointerDown={(event) => {
                if (event.button !== 0 || !event.isPrimary || locked) return;
                event.preventDefault();
                event.currentTarget.setPointerCapture(event.pointerId);
                activePointer.current = event.pointerId;
                point(event.clientX, event.clientY);
              }}
              onPointerMove={(event) => {
                if (activePointer.current === event.pointerId) point(event.clientX, event.clientY);
              }}
              onPointerUp={() => {
                activePointer.current = undefined;
              }}
              onPointerCancel={() => {
                activePointer.current = undefined;
              }}
            >
              <span
                className="calendar-color-plane-thumb"
                style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%`, backgroundColor: hex }}
              />
              <input
                type="range"
                className="sr-only"
                aria-label="Saturation"
                min={0}
                max={100}
                step={1}
                value={hsv.s}
                onChange={(event) => update({ ...hsv, s: Number(event.target.value) })}
              />
              <input
                type="range"
                className="sr-only"
                aria-label="Luminosité"
                min={0}
                max={100}
                step={1}
                value={hsv.v}
                onChange={(event) => update({ ...hsv, v: Number(event.target.value) })}
              />
            </div>
            <Label htmlFor={`${id}-hue`} className="sr-only">
              Teinte
            </Label>
            <input
              id={`${id}-hue`}
              type="range"
              className="calendar-hue-slider"
              min={0}
              max={360}
              step={1}
              value={hsv.h}
              onChange={(event) => update({ ...hsv, h: Number(event.target.value) })}
            />
            <div className="calendar-color-hex-row">
              <span
                className="calendar-color-large-swatch"
                style={{ backgroundColor: hex }}
                aria-label={`Aperçu ${hex}`}
              />
              <div>
                <Label htmlFor={`${id}-hex`}>Couleur HEX</Label>
                <Input
                  id={`${id}-hex`}
                  value={input}
                  maxLength={7}
                  spellCheck={false}
                  autoComplete="off"
                  aria-invalid={!parsed}
                  onBlur={() => {
                    if (parsed) setInput(parsed);
                  }}
                  onChange={(event) => {
                    setInput(event.target.value);
                    const next = normalizeCalendarHex(event.target.value);
                    if (next) setHsv(calendarHexToHsv(next));
                  }}
                />
              </div>
            </div>
            <p className="calendar-color-preview-label">Aperçu dans le calendrier</p>
            <div className="calendar-color-event-preview" style={calendarColorStyle(hex)}>
              <strong>{item.entry?.title ?? 'Votre activité'}</strong>
              <span>
                {[formatTripTime(item.start_time), formatTripDuration(itemDuration(item))]
                  .filter(Boolean)
                  .join(' · ') || 'Durée libre'}
              </span>
            </div>
            {duplicate && (
              <p className="calendar-palette-hint">
                <Check className="size-3.5" />
                Cette couleur est déjà dans votre palette. Elle sera réutilisée.
              </p>
            )}
            {full && (
              <p className="calendar-palette-hint">
                Votre palette contient 32 couleurs. Retirez-en une pour en ajouter une autre.
              </p>
            )}
          </fieldset>
          {error && (
            <Alert role="alert">
              {error}
              {conflict && (
                <button
                  type="button"
                  className="calendar-palette-retry"
                  disabled={locked}
                  onClick={() => {
                    onReload();
                    setConflict(false);
                    setError('');
                  }}
                >
                  Recharger l’activité avant de réessayer
                </button>
              )}
            </Alert>
          )}
          <div className="trip-dialog-actions">
            <Button type="button" variant="ghost" disabled={locked} onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" disabled={locked || !canEdit || !parsed || full}>
              {pending && (
                <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
              )}
              {pending ? 'Enregistrement…' : 'Ajouter'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ManageColorsDialog({
  colors,
  onClose,
  onRemove,
}: {
  colors: SavedCalendarColor[];
  onClose: () => void;
  onRemove: (id: string) => Promise<ColorResult>;
}) {
  const [removing, setRemoving] = useState<string>();
  const [error, setError] = useState('');
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !removing) onClose();
      }}
    >
      <DialogContent
        className="calendar-manage-colors-dialog"
        closeDisabled={!!removing}
        onEscapeKeyDown={(event) => {
          event.stopPropagation();
          if (removing) event.preventDefault();
        }}
      >
        <DialogTitle>Mes couleurs personnalisées</DialogTitle>
        <DialogDescription>
          Retirer une couleur de votre palette conserve la couleur des activités qui l’utilisent.
        </DialogDescription>
        <ul className="calendar-managed-colors">
          {colors.map((color) => (
            <li key={color.id}>
              <span
                className="calendar-current-color"
                style={{
                  backgroundColor: color.hex_color,
                  color: calendarSwatchInk(color.hex_color),
                }}
              />
              <span>{color.hex_color}</span>
              <button
                type="button"
                aria-label={`Supprimer la couleur ${color.hex_color}`}
                disabled={!!removing}
                onClick={async () => {
                  setRemoving(color.id);
                  setError('');
                  try {
                    const result = await onRemove(color.id);
                    if (!result.ok) setError(result.error);
                  } catch {
                    setError('Impossible de retirer cette couleur. Réessayez.');
                  } finally {
                    setRemoving(undefined);
                  }
                }}
              >
                {removing === color.id ? (
                  <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </button>
            </li>
          ))}
        </ul>
        {!colors.length && (
          <p className="calendar-palette-empty">
            Votre palette est prête à accueillir vos couleurs.
          </p>
        )}
        {error && <Alert role="alert">{error}</Alert>}
        <div className="trip-dialog-actions">
          <Button type="button" variant="secondary" disabled={!!removing} onClick={onClose}>
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
