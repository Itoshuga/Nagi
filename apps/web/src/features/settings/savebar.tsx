import { CheckCheck, LoaderCircle, Save } from 'lucide-react';
import { Button, cn } from '@nagi/ui';

export function SettingsSavebar({
  dirty,
  pending,
  error,
  message,
  onReset,
  disabled = false,
}: {
  dirty: boolean;
  pending: boolean;
  error?: string;
  message?: string;
  onReset: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={cn('settings-savebar', (dirty || pending) && 'is-active')}>
      <div className="settings-save-feedback">
        {error && !pending ? (
          <p role="alert" className="settings-save-error">
            {error}
          </p>
        ) : (
          <p role="status">
            {pending ? (
              <LoaderCircle
                className="size-4 animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : dirty ? (
              <span className="settings-dirty-dot" />
            ) : (
              <CheckCheck className="size-4" aria-hidden="true" />
            )}
            {pending
              ? 'Enregistrement…'
              : dirty
                ? 'Modifications non enregistrées'
                : message || 'Tout est à jour'}
          </p>
        )}
      </div>
      <div className="settings-save-actions">
        <Button type="button" variant="ghost" disabled={!dirty || pending} onClick={onReset}>
          Rétablir
        </Button>
        <Button type="submit" disabled={!dirty || pending || disabled}>
          <Save className="size-4" aria-hidden="true" />
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  );
}
