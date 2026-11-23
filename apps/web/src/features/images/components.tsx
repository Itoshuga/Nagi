'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle, Input } from '@nagi/ui';
import { EntryImage } from '@/features/media/image';
import type { ImageReference, ImageResolution, OpenImage } from './model';
import { ImageSession, emptyImageState, imageReferenceKey } from './session';
const Context = createContext<ImageSession | null>(null);
// Catalogue surfaces share their own in-memory session. Neither contexts nor
// provider responses enter localStorage or the planner mutation journal.
let catalogue: ImageSession | undefined;
function catalogueSession() {
  return (catalogue ??= new ImageSession('/api/images'));
}
export function ImageResolverProvider({
  url,
  trip,
  children,
}: {
  url: string;
  trip?: string;
  children: ReactNode;
}) {
  const session = useMemo(() => new ImageSession(url), [url]);
  useEffect(() => {
    session.start();
    const refresh = (event: Event) => {
      if ((event as CustomEvent).detail?.trip === trip) session.invalidate();
    };
    window.addEventListener('nagi:images-updated', refresh);
    return () => {
      window.removeEventListener('nagi:images-updated', refresh);
      session.dispose();
    };
  }, [session, trip]);
  return <Context.Provider value={session}>{children}</Context.Provider>;
}
export function useResolvedImage(reference?: ImageReference, eager = false) {
  const ctx = useContext(Context),
    session = ctx ?? catalogueSession();
  const key = reference ? imageReferenceKey(reference) : '';
  const element = useRef<HTMLElement | null>(null);
  const observe = useCallback((node: HTMLElement | null) => {
    element.current = node;
  }, []);
  const subscribe = useCallback(
    (fn: () => void) => (key ? session.subscribe(key, fn) : () => {}),
    [key, session],
  );
  const snapshot = useCallback(() => (key ? session.get(key) : emptyImageState), [key, session]);
  const state = useSyncExternalStore(subscribe, snapshot, () => emptyImageState);
  const encoded = reference ? JSON.stringify(reference) : '';
  useEffect(() => {
    if (!encoded) return;
    const ref: ImageReference = JSON.parse(encoded);
    if (ref.source === 'mapbox' && !ref.proof && !ref.visit) return;
    if (eager) return session.observe(ref);
    const node = element.current;
    if (!node) return;
    let stop: (() => void) | undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) stop ??= session.observe(ref);
      else {
        stop?.();
        stop = undefined;
      }
    });
    observer.observe(node);
    return () => {
      observer.disconnect();
      stop?.();
    };
  }, [encoded, eager, session]);
  return { ...state, observe, session, reference };
}
export function PhotoAttribution({
  image,
  cropped = true,
}: {
  image: OpenImage;
  cropped?: boolean;
}) {
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      <p className="font-semibold">{image.title}</p>
      <p>
        Auteur :{' '}
        {image.creatorUrl ? (
          <a className="underline" href={image.creatorUrl} target="_blank" rel="noreferrer">
            {image.creator}
          </a>
        ) : (
          image.creator || 'Non renseigné par la source'
        )}
      </p>
      <p>
        <a className="underline" href={image.sourceUrl} target="_blank" rel="noreferrer">
          Voir l’œuvre sur Wikimedia Commons
        </a>
      </p>
      <p>
        Licence :{' '}
        <a className="underline" href={image.licenseUrl} target="_blank" rel="noreferrer">
          {image.license}
          {image.licenseVersion ? ' ' + image.licenseVersion : ''}
        </a>
      </p>
      <p className="text-muted-foreground">{image.attribution}</p>
      {cropped && (
        <p className="text-muted-foreground">
          Présentation recadrée pour remplir le cadre. Fichier original accessible à la source.
        </p>
      )}
      {image.license === 'Public domain' && (
        <p className="text-muted-foreground">
          Domaine public déclaré par la source, distinct de la dédicace CC0.
        </p>
      )}
    </div>
  );
}
export function ImageCredits({
  image,
  interactive = false,
}: {
  image: OpenImage;
  interactive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (!interactive)
    return (
      <span
        className="absolute bottom-0.5 right-0.5 rounded bg-black/65 px-1 text-[9px] leading-4 text-white"
        title={image.attribution + ' — Présentation recadrée. Crédits complets dans les détails.'}
        aria-label={
          image.attribution + '. Présentation recadrée. Crédits complets dans les détails.'
        }
      >
        ©
      </span>
    );
  return (
    <>
      <button
        type="button"
        className="absolute bottom-2 right-2 rounded-full bg-black/70 px-3 py-1 text-xs text-white focus-visible:outline-2 focus-visible:outline-ring"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        Crédits photo
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent onClick={(event) => event.stopPropagation()}>
          <DialogTitle className="mb-3 font-display text-xl">Crédits photographiques</DialogTitle>
          <DialogDescription className="sr-only">
            Auteur, source, licence et modifications de la photographie.
          </DialogDescription>
          <PhotoAttribution image={image} />
        </DialogContent>
      </Dialog>
    </>
  );
}
export function ImagePicker({
  reference,
  disabled = false,
}: {
  reference: ImageReference;
  disabled?: boolean;
}) {
  const { result, session, error: loadError } = useResolvedImage(reference, true);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [search, setSearch] = useState(''),
    [alternatives, setAlternatives] = useState<ImageResolution>();
  const [inspected, setInspected] = useState<string>();
  const current = alternatives ?? result;
  async function choose(mode: 'automatic' | 'manual' | 'fallback', image: string | null) {
    setBusy(true);
    setError('');
    try {
      await session.select(reference, mode, image);
      setOpen(false);
      setAlternatives(undefined);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Choix non enregistré.');
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    setBusy(true);
    setError('');
    try {
      setAlternatives(
        await session.request({
          operation: 'resolve',
          reference,
          browse: true,
          ...(search.trim() ? { search: search.trim() } : {}),
        }),
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Recherche indisponible.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => {
          setOpen(true);
          setError('');
          if (!result?.candidates.length) void more();
        }}
      >
        Changer la photographie
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[85dvh] max-w-2xl overflow-y-auto" closeDisabled={busy}>
          <DialogTitle className="font-display text-xl">Photographie du lieu</DialogTitle>
          <DialogDescription className="mt-2 text-sm text-muted-foreground">
            {reference.visit
              ? 'Ce choix concerne uniquement cette visite dans le voyage.'
              : 'Ce choix s’applique à la fiche du catalogue.'}{' '}
            Confirmez que la photo représente bien ce lieu.
          </DialogDescription>
          <div className="my-5 grid grid-cols-2 gap-3">
            {current?.candidates.map((image) => (
              <div key={image.id} className="overflow-hidden rounded-2xl border border-border">
                <EntryImage
                  src={image.thumbnailUrl}
                  alt={image.title}
                  className="aspect-[4/3]"
                  sizes="240px"
                />
                <div className="space-y-2 p-3">
                  <p className="line-clamp-2 text-sm font-medium">{image.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {image.creator || 'Auteur non renseigné'} · {image.license}{' '}
                    {image.licenseVersion}
                  </p>
                  <button
                    type="button"
                    className="text-xs text-primary-ink underline"
                    onClick={() => setInspected(inspected === image.id ? undefined : image.id)}
                  >
                    Crédits et source
                  </button>
                  {inspected === image.id && <PhotoAttribution image={image} />}
                  <Button
                    type="button"
                    className="w-full"
                    disabled={busy}
                    onClick={() => void choose('manual', image.id)}
                  >
                    Choisir cette image
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {!current?.candidates.length && (
            <p role="status" className="my-4 text-sm text-muted-foreground">
              {busy
                ? 'Recherche de photographies…'
                : current?.status === 'unavailable'
                  ? 'Le fournisseur est momentanément indisponible.'
                  : 'Aucune photographie fiable disponible. L’illustration du lieu est conservée.'}
            </p>
          )}
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void more();
            }}
          >
            <Input
              aria-label="Préciser le lieu pour rechercher des photographies"
              placeholder="Nom exact, ville…"
              value={search}
              maxLength={160}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={busy || (reference.source === 'mapbox' && !reference.proof)}
            >
              Rechercher d’autres images
            </Button>
          </form>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void choose('automatic', null)}
            >
              Revenir au choix automatique
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void choose('fallback', null)}
            >
              Utiliser l’illustration
            </Button>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
              Conserver l’image actuelle
            </Button>
          </div>
          {(error || loadError) && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error || loadError}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
