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
import { Copyright, ExternalLink, Info, ShieldCheck } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@nagi/ui';
import { EntryImage } from '@/features/media/image';
import './photo-ui.css';
import {
  isOpenImage,
  isTemporaryImage,
  isPreviewImage,
  imageRightsLabels,
  imageProviderLabels,
  type ImageReference,
  type ImageRights,
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
/** Shared, quiet status language for gallery cards and photo details. */
export function PhotoStatus({ rights, label }: { rights?: ImageRights; label?: string }) {
  const approved =
    !label &&
    (rights === 'auto_approved' || rights === 'open_license' || rights === 'permission_granted');
  const Icon = approved ? ShieldCheck : Info;
  return (
    <span className="nagi-photo-status" data-approved={approved || undefined}>
      <Icon aria-hidden="true" size={12} />
      {label ?? (rights ? imageRightsLabels[rights] : 'À vérifier')}
    </span>
  );
}
function PhotoLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="nagi-photo-link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ExternalLink aria-hidden="true" size={12} />
    </a>
  );
}
function sourceLabel(image: PlaceImageCandidate) {
  if (image.provider !== 'serper') return imageProviderLabels[image.provider];
  try {
    return new URL(image.sourceUrl).hostname.replace(/^www\./, '');
  } catch {
    return 'Page originale';
  }
}
export function PhotoAttribution({
  image,
  cropped = true,
}: {
  image: PlaceImageCandidate;
  cropped?: boolean;
}) {
  const preview = isPreviewImage(image),
    temporary = isTemporaryImage(image),
    open = isOpenImage(image);
  const license = temporary
    ? 'Conditions du fournisseur'
    : (image.license ??
      (preview || image.rightsStatus === 'auto_approved'
        ? 'Non renseignée par la source'
        : image.rightsStatus === 'permission_granted'
          ? 'Autorisation de publication vérifiée'
          : 'Licence ouverte vérifiée'));
  const licenseUrl = temporary ? undefined : image.licenseUrl;
  return (
    <div className="nagi-photo-attribution">
      <dl className="nagi-photo-facts">
        <div className="nagi-photo-work">
          <dt>Titre de l’œuvre</dt>
          <dd>{image.title}</dd>
        </div>
        <div>
          <dt>Auteur</dt>
          <dd>
            {open && image.creatorUrl ? (
              <PhotoLink href={image.creatorUrl}>{image.creator}</PhotoLink>
            ) : (
              image.creator || 'Non renseigné par la source'
            )}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            <PhotoLink href={image.sourceUrl}>{sourceLabel(image)}</PhotoLink>
          </dd>
        </div>
        <div>
          <dt>Licence</dt>
          <dd>
            {licenseUrl ? (
              <PhotoLink href={licenseUrl}>
                {license}
                {open && image.licenseVersion ? ' ' + image.licenseVersion : ''}
              </PhotoLink>
            ) : (
              license
            )}
          </dd>
        </div>
      </dl>
      {preview && (
        <div className="nagi-photo-notice">
          <PhotoStatus rights={image.rightsStatus} />
          <p>
            Prévisualisation de développement · Droits : {imageRightsLabels[image.rightsStatus]}.
            Cet aperçu privé ne modifie pas la couverture publiée.
          </p>
        </div>
      )}
      <div className="nagi-photo-usage">
        <h3>Notes d’utilisation</h3>
        <p>{image.attribution}</p>
        {!temporary && !open && image.rightsStatus === 'auto_approved' && (
          <p>
            Validée automatiquement pour Nagi. Les informations de licence sont celles renseignées
            par la source.
          </p>
        )}
        {temporary && (
          <p>
            Affichage temporaire sous les conditions du fournisseur. Cette photographie n’est pas
            sous licence libre.
          </p>
        )}
        {cropped && (!temporary || image.cropAllowed) && (
          <p>
            Présentation recadrée pour remplir le cadre. Fichier original accessible à la source.
          </p>
        )}
        {open && image.license === 'Public domain' && (
          <p>Domaine public déclaré par la source, distinct de la dédicace CC0.</p>
        )}
      </div>
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
  const trigger = useRef<HTMLButtonElement | null>(null);
  const caption =
    image.attribution +
    (!isTemporaryImage(image) || image.cropAllowed ? ' — Présentation recadrée.' : '') +
    ' Crédits complets dans les détails.';
  if (!interactive)
    return (
      <span className="nagi-photo-credit-summary" title={caption} aria-label={caption}>
        ©
      </span>
    );
  return (
    <>
      <button
        type="button"
        ref={trigger}
        className="nagi-photo-credit"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <Copyright aria-hidden="true" size={12} />
        Crédits photo
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="nagi-photo-dialog nagi-photo-credits-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <header className="nagi-photo-header">
            <DialogTitle>Crédits photographiques</DialogTitle>
            <DialogDescription>
              L’image, son auteur et ses conditions d’utilisation.
            </DialogDescription>
          </header>
          <div className="nagi-photo-credits-body">
            <EntryImage
              src={image.thumbnailUrl}
              fit={isTemporaryImage(image) && !image.cropAllowed ? 'contain' : 'cover'}
              alt=""
              className="nagi-photo-credits-preview"
              sizes="450px"
            />
            <PhotoAttribution image={image} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
export function ImagePicker({
  reference,
  disabled = false,
  className,
  children,
  currentSrc,
  category,
}: {
  reference: ImageReference;
  currentSrc?: string | null;
  category?: string;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const [Gallery, setGallery] = useState<typeof import('./gallery').ImageGalleryPicker>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  if (Gallery)
    return (
      <Gallery
        reference={reference}
        currentSrc={currentSrc}
        category={category}
        disabled={disabled}
        initiallyOpen
        className={className}
      >
        {children}
      </Gallery>
    );
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
        <Button
          type="button"
          variant="secondary"
          className={className}
          aria-label="Modifier la photo"
          aria-busy={loading}
          disabled={disabled || loading}
          onClick={open}
        >
          {loading ? 'Chargement…' : (children ?? 'Modifier la photo')}
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
