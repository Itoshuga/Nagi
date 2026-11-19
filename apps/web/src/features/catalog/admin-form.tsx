'use client';

import {
  useEffect,
  useState,
  useTransition,
  type ComponentProps,
  type FormEvent,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { Alert, Button, cn, toast } from '@nagi/ui';
import type { CatalogResult } from './mutations';

export function CatalogForm({
  run,
  children,
  className,
  protect = false,
  reset = false,
  onSuccess,
  onPendingChange,
  id,
  renderLayout,
}: {
  run: (form: FormData) => Promise<CatalogResult>;
  children: React.ReactNode;
  className?: string;
  protect?: boolean;
  reset?: boolean;
  onSuccess?: () => void;
  onPendingChange?: (pending: boolean) => void;
  id?: string;
  renderLayout?: (parts: {
    form: ReactNode;
    feedback: ReactNode;
    pending: boolean;
    markDirty: () => void;
  }) => ReactNode;
}) {
  const router = useRouter();
  const [dirty, setDirty] = useState(false);
  const [result, setResult] = useState<CatalogResult>();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!protect || !dirty) return;
    function preventUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    function guardLink(event: MouseEvent) {
      if (
        !(event.target instanceof Element) ||
        event.button ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = event.target.closest('a[href]');
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === '_blank' ||
        link.hasAttribute('download')
      )
        return;
      if (
        link.origin === location.origin &&
        link.pathname === location.pathname &&
        link.search === location.search
      )
        return;
      if (!window.confirm('Quitter cette fiche sans enregistrer les modifications ?')) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener('beforeunload', preventUnload);
    document.addEventListener('click', guardLink, true);
    return () => {
      window.removeEventListener('beforeunload', preventUnload);
      document.removeEventListener('click', guardLink, true);
    };
  }, [dirty, protect]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    onPendingChange?.(true);
    startTransition(async () => {
      setResult(undefined);
      try {
        const saved = await run(values);
        setResult(saved);
        if (!saved.ok) return;
        setDirty(false);
        if (reset) form.reset();
        onSuccess?.();
        if (saved.href) {
          toast.success(saved.message);
          router.push(saved.href);
        }
        // Catalog actions already revalidate the route and return its updated UI.
        // A second refresh prolongs this transition after the save has succeeded.
      } catch {
        setResult({ ok: false, message: 'La requête a échoué. Réessayez.' });
      } finally {
        onPendingChange?.(false);
      }
    });
  }

  const feedback = (
    <>
      {pending && (
        <p role="status" className="mt-3 text-sm text-muted-foreground">
          Enregistrement…
        </p>
      )}
      {result && (
        <Alert className={cn('mt-3', !result.ok && 'border-destructive/50')}>
          {result.message}
        </Alert>
      )}
    </>
  );
  const form = (
    <form
      id={id}
      className={className}
      onSubmit={submit}
      onChange={() => setDirty(true)}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('[data-form-change]'))
          setDirty(true);
      }}
    >
      <fieldset disabled={pending} className="min-w-0 space-y-4">
        {children}
      </fieldset>
      {!renderLayout && feedback}
    </form>
  );
  return renderLayout
    ? renderLayout({ form, feedback, pending, markDirty: () => setDirty(true) })
    : form;
}

export function CatalogSelect({ className, ...props }: ComponentProps<'select'>) {
  return (
    <select
      {...props}
      className={cn(
        'h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50',
        className,
      )}
    />
  );
}

export function CatalogTextarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      {...props}
      className={cn(
        'min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-ring',
        className,
      )}
    />
  );
}

export function ConfirmCatalogDeletion({ label = 'Supprimer' }: { label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="confirm" value="yes" required /> Confirmer la suppression
      </label>
      <Button type="submit" variant="destructive" size="sm">
        {label}
      </Button>
    </div>
  );
}
