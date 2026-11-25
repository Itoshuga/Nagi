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
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@nagi/ui';
import {
  isOpenImage,
  isTemporaryImage,
  isPreviewImage,
  imageRightsLabels,
  imageProviderLabels,
  type ImageReference,
  type PlaceImageCandidate,
} from './model';
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
    const ref: ImageReference = {
      ...JSON.parse(encoded),
      priority: eager || reference?.visit ? 'selected' : 'visible',
    };
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
  }, [encoded, eager, reference?.visit, session]);
  return { ...state, observe, session, reference };
}
export function PhotoAttribution({
  image,
  cropped = true,
}: {
  image: PlaceImageCandidate;
  cropped?: boolean;
}) {
  if (isPreviewImage(image))
    return (
      <div className="space-y-2 text-sm leading-relaxed">
        <p className="font-semibold">{image.title}</p>
        <p>Prévisualisation de développement · Droits : {imageRightsLabels[image.rightsStatus]}</p>
        {image.creator && <p>Auteur : {image.creator}</p>}
        {image.license && <p>Licence renseignée : {image.license}</p>}
        <a className="underline" href={image.sourceUrl} target="_blank" rel="noreferrer">
          Voir la page originale
        </a>
        <p className="text-muted-foreground">{image.attribution}</p>
        <p className="text-muted-foreground">
          Cet aperçu privé ne modifie pas la couverture publiée.
        </p>
      </div>
    );
  if (isTemporaryImage(image))
    return (
      <div className="space-y-2 text-sm leading-relaxed">
        <p className="font-semibold">{image.title}</p>
        <p>{imageProviderLabels[image.provider]}</p>
        {image.creator && <p>Auteur : {image.creator}</p>}
        <a className="underline" href={image.sourceUrl} target="_blank" rel="noreferrer">
          Voir la source de la photographie
        </a>
        <p>{image.attribution}</p>
        <p className="text-muted-foreground">
          Affichage temporaire sous les conditions du fournisseur. Cette photographie n’est pas sous
          licence libre.
        </p>
        {cropped && image.cropAllowed && (
          <p className="text-muted-foreground">Présentation recadrée pour remplir le cadre.</p>
        )}
      </div>
    );
  if (!isOpenImage(image))
    return (
      <div className="space-y-2 text-sm leading-relaxed">
        <p className="font-semibold">{image.title}</p>
        {image.creator && <p>Auteur : {image.creator}</p>}
        <a className="underline" href={image.sourceUrl} target="_blank" rel="noreferrer">
          Voir la page originale
        </a>
        <p>
          {image.license ??
            (image.rightsStatus === 'permission_granted'
              ? 'Autorisation de publication vérifiée'
              : 'Licence ouverte vérifiée')}
        </p>
        {image.licenseUrl && (
          <a className="block underline" href={image.licenseUrl} target="_blank" rel="noreferrer">
            Consulter la licence
          </a>
        )}
        <p className="text-muted-foreground">{image.attribution}</p>
      </div>
    );
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
  image: PlaceImageCandidate;
  interactive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const caption =
    image.attribution +
    (!isTemporaryImage(image) || image.cropAllowed ? ' — Présentation recadrée.' : '') +
    ' Crédits complets dans les détails.';
  if (!interactive)
    return (
      <span
        className="absolute bottom-0.5 right-0.5 rounded bg-black/65 px-1 text-[9px] leading-4 text-white"
        title={caption}
        aria-label={caption}
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
  const [Gallery, setGallery] = useState<typeof import('./gallery').ImageGalleryPicker>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  if (Gallery) return <Gallery reference={reference} disabled={disabled} initiallyOpen />;
  async function open() {
    setLoading(true);
    setError('');
    try {
      const galleryModule = await import('./gallery');
      setGallery(() => galleryModule.ImageGalleryPicker);
    } catch {
      // An optional chunk failure must never unmount the planner or its drafts.
      setError('La galerie est indisponible. Vérifiez votre connexion puis réessayez.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={disabled || loading} onClick={open}>
          {loading ? 'Chargement…' : 'Modifier la photo'}
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
