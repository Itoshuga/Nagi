'use client';

import { useActionState, useId, useRef, useState } from 'react';
import { Check, Compass, LogOut, Star, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@nagi/ui';
import {
  deleteAccount,
  saveDefaultSpace,
  signOutOtherSessions,
  type SettingsState,
} from './actions';
import { SettingsSection } from './section';
import { SettingsSavebar } from './savebar';

const initialState: SettingsState = { error: '' };

export function DefaultSpaceForm({
  spaces,
  selected,
  children,
}: {
  spaces: { id: string; name: string }[];
  selected: string | null;
  children?: ReactNode;
}) {
  const id = useId();
  const [state, action, pending] = useActionState(saveDefaultSpace, initialState);
  const [value, setValue] = useState(
    spaces.find((space) => space.id === selected)?.id ??
      (spaces.length === 1 ? (spaces[0]?.id ?? '') : ''),
  );
  const [feedbackVisible, setFeedbackVisible] = useState(true);
  const dirty = !!value && value !== selected;
  return (
    <form action={action} aria-busy={pending} onSubmit={() => setFeedbackVisible(true)}>
      <SettingsSection
        title="Votre point de départ"
        description="Retrouvez votre espace préféré dès la connexion."
      >
        <div>
          <Label htmlFor={id}>Espace à ouvrir après la connexion</Label>
          <select
            id={id}
            name="guildId"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setFeedbackVisible(false);
            }}
            disabled={pending}
            required
            className="settings-select"
            aria-describedby={`${id}-help`}
          >
            <option value="" disabled>
              Choisir un espace
            </option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
          <p id={`${id}-help`} className="settings-help">
            Ce choix est personnel. Il ne change pas les préférences des autres membres de l’espace.
          </p>
        </div>
        {children}
      </SettingsSection>
      <SettingsSavebar
        dirty={dirty}
        pending={pending}
        error={feedbackVisible ? state.error : ''}
        message={feedbackVisible ? state.message : undefined}
        onReset={() => {
          setValue(spaces.find((space) => space.id === selected)?.id ?? '');
          setFeedbackVisible(false);
        }}
        disabled={!value}
      />
    </form>
  );
}

export function DefaultSpaceShortcut({
  space,
  selected,
  children,
}: {
  space: { id: string; name: string };
  selected: string | null;
  children?: ReactNode;
}) {
  const [state, action, pending] = useActionState(saveDefaultSpace, initialState);
  const isDefault = selected === space.id || !!state.message;
  return (
    <form action={action} aria-busy={pending}>
      <input type="hidden" name="guildId" value={space.id} />
      <SettingsSection
        title="Votre point de départ"
        description="Retrouvez cet espace dès votre prochaine connexion."
      >
        <p className="settings-note">
          <Compass className="size-4" aria-hidden="true" />
          <span>
            Ouvrez directement {space.name} après la connexion. Ce choix s’applique uniquement à
            votre compte.
          </span>
        </p>
        {state.error && <Alert role="alert">{state.error}</Alert>}
        {isDefault ? (
          <p className="settings-success" role="status">
            <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>Cet espace est déjà votre espace par défaut.</span>
          </p>
        ) : (
          <div className="settings-section-actions">
            <Button type="submit" size="sm" disabled={pending}>
              <Star className="size-4" aria-hidden="true" />
              {pending ? 'Enregistrement…' : 'Définir cet espace par défaut'}
            </Button>
          </div>
        )}
        {children}
      </SettingsSection>
    </form>
  );
}

export function SessionControls() {
  const [state, action, pending] = useActionState(signOutOtherSessions, initialState);
  return (
    <form action={action} className="space-y-3">
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        <LogOut aria-hidden="true" className="size-4" />
        {pending ? 'Déconnexion…' : 'Déconnecter les autres appareils'}
      </Button>
      {state.error && <Alert role="alert">{state.error}</Alert>}
      {state.message && (
        <p role="status" className="settings-success">
          {state.message}
        </p>
      )}
    </form>
  );
}

function DeleteAccountForm({ userId, onCancel }: { userId: string; onCancel: () => void }) {
  const id = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const [confirmation, setConfirmation] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [state, action, pending] = useActionState(deleteAccount.bind(null, userId), initialState);
  return (
    <DialogContent
      className="max-h-[90svh] max-w-lg overflow-y-auto"
      closeDisabled={pending}
      onEscapeKeyDown={(event) => {
        if (pending) event.preventDefault();
      }}
      onPointerDownOutside={(event) => {
        if (pending) event.preventDefault();
      }}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        cancel.current?.focus();
      }}
    >
      <span className="settings-delete-icon">
        <Trash2 className="size-5" aria-hidden="true" />
      </span>
      <DialogTitle className="pr-6 text-xl font-bold">
        Supprimer votre compte Nagi&nbsp;?
      </DialogTitle>
      <DialogDescription className="mt-3 text-sm leading-6 text-muted-foreground">
        Votre profil, votre bannière, vos préférences et vos connexions Nagi seront supprimés
        définitivement.
      </DialogDescription>
      <form action={action} className="mt-5 space-y-5">
        <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm leading-6">
          Les voyages, les étapes et les fiches partagés sont conservés. Si vous êtes le dernier
          organisateur d’un voyage, les administrateurs Discord de cet espace pourront en reprendre
          la gestion.
        </div>
        <fieldset disabled={pending} className="min-w-0 space-y-4">
          <div>
            <Label htmlFor={id}>Pour confirmer, saisissez SUPPRIMER</Label>
            <Input
              id={id}
              name="confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              pattern="SUPPRIMER"
              required
            />
          </div>
          <label className="flex items-start gap-3 text-sm leading-6">
            <input
              className="mt-1 size-4 shrink-0 accent-primary-ink"
              type="checkbox"
              name="understood"
              value="yes"
              checked={understood}
              onChange={(event) => setUnderstood(event.target.checked)}
              required
            />
            <span>Je confirme la suppression définitive de mon compte Nagi.</span>
          </label>
        </fieldset>
        {state.error && <Alert role="alert">{state.error}</Alert>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-5">
          <Button ref={cancel} type="button" variant="ghost" disabled={pending} onClick={onCancel}>
            Annuler
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={pending || confirmation !== 'SUPPRIMER' || !understood}
          >
            <Trash2 aria-hidden="true" className="size-4" />
            {pending ? 'Suppression…' : 'Supprimer mon compte'}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

export function DeleteAccountButton({ available, userId }: { available: boolean; userId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="settings-delete" disabled={!available}>
          <Trash2 aria-hidden="true" className="size-4" />
          Supprimer le compte
        </button>
      </DialogTrigger>
      {open && <DeleteAccountForm userId={userId} onCancel={() => setOpen(false)} />}
    </Dialog>
  );
}
