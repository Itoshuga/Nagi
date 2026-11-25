'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  ExternalLink,
  Image as ImageIcon,
  Info,
  Loader2,
  Search,
  Shapes,
  Sparkles,
} from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Label,
  cn,
} from '@nagi/ui';
import { EntryImage } from '@/features/media/image';
import { useResolvedImage, PhotoAttribution, PhotoStatus } from './components';
import type {
  DiscoveryCandidate,
  ImageGallery,
  ImageReference,
  ImageRights,
  PersistentImage,
  PreviewImage,
} from './model';
import { imageRightsLabels as rightsLabels, isTemporaryImage, isOpenImage } from './model';
import { PlacePlaceholder } from './place-placeholder';
export function ImageGalleryPicker({
  reference,
  disabled = false,
  initiallyOpen = false,
  className,
  children,
  currentSrc,
  category,
}: {
  reference: ImageReference;
  currentSrc?: string | null;
  category?: string;
  disabled?: boolean;
  initiallyOpen?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const { result, session } = useResolvedImage(reference, true);
  const [open, setOpen] = useState(initiallyOpen),
    [gallery, setGallery] = useState<ImageGallery>(),
    [error, setError] = useState('');
  const [filter, setFilter] = useState(''),
    [loading, setLoading] = useState(false),
    [indexing, setIndexing] = useState(false),
    [saving, setSaving] = useState(false);
  const [chosen, setChosen] = useState<PersistentImage | PreviewImage>(),
    [inspected, setInspected] = useState<DiscoveryCandidate>(),
    [inspectedPhoto, setInspectedPhoto] = useState<PersistentImage>();
  const readAbort = useRef<AbortController | null>(null),
    indexAbort = useRef<AbortController | null>(null);
  const inspector = useRef<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const initialIndex = useRef(false),
    indexAction = useRef<() => Promise<void>>(async () => {});
  const encoded = JSON.stringify(reference);
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    readAbort.current?.abort();
    readAbort.current = abort;
    const timer = setTimeout(
      () => {
        setLoading(true);
        void session
          .request<ImageGallery>(
            { operation: 'gallery', reference: JSON.parse(encoded), offset: 0, filter },
            abort.signal,
          )
          .then((data) => {
            if (!abort.signal.aborted) {
              setGallery(data);
              setError('');
              if (
                data.searchEnabled !== false &&
                data.state === 'idle' &&
                data.total === 0 &&
                !initialIndex.current
              ) {
                initialIndex.current = true;
                void indexAction.current();
              }
            }
          })
          .catch((error) => {
            if (!abort.signal.aborted)
              setError(error instanceof Error ? error.message : 'Galerie indisponible.');
          })
          .finally(() => {
            if (!abort.signal.aborted) setLoading(false);
          });
      },
      filter ? 250 : 0,
    );
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [open, encoded, filter, session]);
  useEffect(
    () => () => {
      readAbort.current?.abort();
      indexAbort.current?.abort();
    },
    [],
  );
  async function index() {
    indexAbort.current?.abort();
    const abort = new AbortController();
    indexAbort.current = abort;
    setIndexing(true);
    setError('');
    setFilter('');
    try {
      let data = await session.request<ImageGallery>(
        { operation: 'index', reference },
        abort.signal,
      );
      if (abort.signal.aborted) return;
      setGallery(data);
      if (data.stopReason === 'busy') session.refresh(reference);
      // Wait for another worker using free database reads only. Never poll the
      // indexing operation: after a lease finishes that could buy another page.
      for (
        let attempt = 0;
        (data.state === 'indexing' || data.stopReason === 'busy') &&
        attempt < 45 &&
        !abort.signal.aborted;
        attempt++
      ) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1000));
        if (abort.signal.aborted) return;
        data = await session.request<ImageGallery>(
          { operation: 'gallery', reference, offset: 0, filter: '' },
          abort.signal,
        );
        if (!abort.signal.aborted) {
          setGallery(data);
        }
      }
      if (!abort.signal.aborted) {
        if (data.searchIssue) setError(data.searchIssue);
        else session.refresh(reference);
      }
    } catch (error) {
      if (!abort.signal.aborted)
        setError(error instanceof Error ? error.message : 'Recherche indisponible.');
    } finally {
      if (indexAbort.current === abort) setIndexing(false);
    }
  }
  useEffect(() => {
    indexAction.current = index;
  });
  function close(value: boolean) {
    if (!value) {
      readAbort.current?.abort();
      indexAbort.current?.abort();
      setIndexing(false);
      setChosen(undefined);
      setInspected(undefined);
      setInspectedPhoto(undefined);
      initialIndex.current = false;
    }
    setOpen(value);
  }
  const previewEnabled = !!gallery?.previewEnabled;
  async function select(mode: 'manual' | 'automatic' | 'fallback' | 'published') {
    if (mode === 'manual' && !chosen) return;
    indexAbort.current?.abort();
    setSaving(true);
    setError('');
    try {
      if (previewEnabled)
        await session.selectPreview(
          reference,
          mode,
          mode === 'manual' ? chosen!.id : null,
          mode === 'manual' ? chosen : undefined,
        );
      else if (mode !== 'published')
        await session.select(
          reference,
          mode,
          mode === 'manual' ? chosen!.id : null,
          mode === 'manual' ? (chosen as PersistentImage) : undefined,
        );
      close(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Choix non enregistré.');
    } finally {
      setSaving(false);
    }
  }
  async function review(input: {
    rights: ImageRights;
    creator: string;
    license: string;
    licenseUrl: string;
    evidence: string;
    excluded: boolean;
  }) {
    if (!inspected) return;
    setSaving(true);
    setError('');
    try {
      const data = await session.request<ImageGallery>({
        operation: 'review',
        reference,
        image: inspected.id,
        ...input,
      });
      setGallery(data);
      const current = data.items.find((item) => item.id === inspected.id);
      setInspected(current);
      if (current?.photo) setChosen(current.photo);
      else setChosen(undefined);
      session.invalidate(reference.visit);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Vérification non enregistrée.');
    } finally {
      setSaving(false);
    }
  }
  async function report() {
    if (!inspected) return;
    try {
      await session.request({ operation: 'report', reference, image: inspected.id });
      setError('Signalement enregistré.');
    } catch {
      setError('Le signalement n’a pas pu être enregistré.');
    }
  }
  const candidates = (gallery?.items ?? []).slice(0, 10);
  const candidateIds = new Set(candidates.flatMap((item) => [item.id, item.photo?.id]));
  const fallbacks = (gallery?.fallbacks ?? [])
    .filter((photo) => !candidateIds.has(photo.id))
    .slice(0, 10 - candidates.length);
  const currentMode = (previewEnabled ? result?.previewMode : result?.mode) ?? 'automatic';
  const currentImage = result?.coverHidden || currentMode === 'fallback' ? null : result?.selected;
  const currentSource =
    result?.coverHidden ||
    result?.mode === 'fallback' ||
    (result?.mode === 'manual' && !currentImage)
      ? undefined
      : (currentImage?.thumbnailUrl ?? currentSrc);
  const modeLabel =
    currentMode === 'fallback'
      ? 'Pictogramme'
      : currentMode === 'published'
        ? 'Couverture publiée'
        : currentMode === 'manual'
          ? 'Photo personnalisée'
          : 'Choix automatique';
  const detailedPhoto = inspectedPhoto ?? chosen ?? currentImage;
  useEffect(() => {
    if (inspector.current) inspector.current.scrollTop = 0;
  }, [inspected?.id, detailedPhoto?.id]);
  function focusInformation() {
    requestAnimationFrame(() => {
      inspector.current?.focus({ preventScroll: true });
      if (window.matchMedia('(max-width: 760px)').matches)
        inspector.current?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  }
  function inspect(item: DiscoveryCandidate) {
    setInspected(item);
    // Only an explicit Information action moves focus; selecting a card never jumps.
    focusInformation();
  }
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          className={className}
          ref={trigger}
          aria-label="Modifier la photo"
          disabled={disabled}
          onClick={() => {
            setError('');
            setFilter('');
            setChosen(undefined);
            close(true);
          }}
        >
          {children ?? 'Modifier la photo'}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent
          className="nagi-photo-dialog nagi-photo-picker"
          closeDisabled={saving}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            trigger.current?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (saving) event.preventDefault();
          }}
          onPointerDownOutside={(event) => {
            if (saving) event.preventDefault();
          }}
        >
          <header className="nagi-photo-header">
            <DialogTitle>Choisir une photographie</DialogTitle>
            <DialogDescription>
              {reference.visit
                ? 'Personnalisez la photo de cette visite uniquement.'
                : 'Choisissez la couverture de ce lieu dans le catalogue.'}
            </DialogDescription>
          </header>
          <div className="nagi-photo-toolbar">
            <Search aria-hidden="true" size={16} />
            <Input
              value={filter}
              disabled={indexing}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Rechercher dans la galerie…"
              aria-label="Rechercher parmi les photographies"
            />
            {(loading || indexing) && (
              <Loader2 aria-label="Chargement" size={16} className="animate-spin" />
            )}
          </div>
          <div className="nagi-photo-browser">
            <div className="nagi-photo-results" aria-busy={loading || indexing}>
              <section className="nagi-photo-current" aria-label="Photo actuelle">
                <EntryImage
                  src={currentSource}
                  alt=""
                  fit={
                    currentImage && isTemporaryImage(currentImage) && !currentImage.cropAllowed
                      ? 'contain'
                      : 'cover'
                  }
                  fallback={<PlacePlaceholder category={category} />}
                  sizes="64px"
                  className="nagi-photo-current-image"
                />
                <div>
                  <span className="nagi-photo-eyebrow">Photo actuelle</span>
                  <h3>
                    {currentImage?.title ??
                      (currentSource
                        ? 'Image importée'
                        : currentMode === 'manual'
                          ? 'Photographie indisponible'
                          : 'Pictogramme du lieu')}
                  </h3>
                  <p>{modeLabel}</p>
                </div>
                <Check aria-hidden="true" size={16} />
              </section>
              <div className="nagi-photo-section-heading">
                <h3>La galerie</h3>
                <span role="status">
                  {loading || indexing
                    ? 'Chargement…'
                    : `${candidates.length + fallbacks.length} / 10 photos`}
                </span>
              </div>
              {previewEnabled && (
                <p className="nagi-photo-context">
                  Aperçu privé : vos choix ne modifient pas la couverture publiée.
                </p>
              )}
              {((loading && !gallery) || (indexing && !candidates.length && !fallbacks.length)) && (
                <div className="nagi-photo-grid" aria-label="Chargement de la galerie">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="nagi-photo-skeleton" />
                  ))}
                </div>
              )}
              {!!candidates.length && (
                <div className="nagi-photo-grid">
                  {candidates.map((item) => {
                    const available = !item.excluded && item.availability !== 'unavailable';
                    const selectable = available
                      ? previewEnabled
                        ? (item.preview ?? item.photo)
                        : item.photo
                      : undefined;
                    const selected = !!selectable && chosen?.id === selectable.id;
                    const current =
                      !!currentImage &&
                      [item.id, item.photo?.id, item.preview?.id].includes(currentImage.id);
                    return (
                      <article
                        key={item.id}
                        data-image-candidate={item.id}
                        className={cn('nagi-photo-card', selected && 'is-selected')}
                        data-current={current || undefined}
                      >
                        <button
                          type="button"
                          className="nagi-photo-card-select"
                          disabled={!available || saving}
                          aria-label={`Sélectionner ${item.metadata.title ?? 'cette photographie'}`}
                          aria-pressed={selected}
                          onClick={() => {
                            setInspected(item);
                            setChosen(selectable);
                          }}
                        >
                          <EntryImage
                            src={
                              item.metadata.thumbnailUrl ??
                              (previewEnabled ? item.preview?.thumbnailUrl : undefined)
                            }
                            alt=""
                            className="nagi-photo-card-image"
                            sizes="(max-width: 760px) 45vw, 200px"
                          />
                          {(selected || current) && (
                            <span className="nagi-photo-card-check">
                              <Check aria-hidden="true" size={13} />
                              {selected ? 'Sélectionnée' : 'Actuelle'}
                            </span>
                          )}
                          <span className="nagi-photo-card-title">
                            {item.metadata.title ?? 'Photographie'}
                          </span>
                          <span className="nagi-photo-card-source">
                            {item.metadata.source ?? item.metadata.domain ?? 'Source à consulter'}
                          </span>
                        </button>
                        <div className="nagi-photo-card-meta">
                          <PhotoStatus
                            rights={item.rightsStatus}
                            label={
                              item.excluded
                                ? 'Exclue'
                                : item.availability === 'unavailable'
                                  ? 'Indisponible'
                                  : undefined
                            }
                          />
                          <button
                            type="button"
                            className="nagi-photo-info"
                            title="Informations sur la photographie"
                            aria-label={`Informations : ${item.metadata.title ?? 'photographie'}`}
                            onClick={() => inspect(item)}
                          >
                            <Info aria-hidden="true" size={13} />
                            <span>Informations</span>
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              {gallery && !candidates.length && !fallbacks.length && !loading && !indexing && (
                <div className="nagi-photo-empty" role="status">
                  <ImageIcon aria-hidden="true" size={26} />
                  <h3>
                    {filter ? 'Aucune photo correspondante' : 'Pas de photographie disponible'}
                  </h3>
                  <p>
                    {filter
                      ? 'Essayez un autre mot ou effacez votre recherche.'
                      : 'Le pictogramme du lieu reste disponible pour votre couverture.'}
                  </p>
                  {filter && (
                    <Button size="sm" variant="ghost" onClick={() => setFilter('')}>
                      Effacer la recherche
                    </Button>
                  )}
                </div>
              )}
              {!!fallbacks.length && (
                <section className="nagi-photo-fallbacks">
                  <h3>Photographies autorisées</h3>
                  <div className="nagi-photo-grid">
                    {fallbacks.map((photo) => {
                      const selected = chosen?.id === photo.id,
                        current = currentImage?.id === photo.id;
                      return (
                        <article
                          key={photo.id}
                          className={cn('nagi-photo-card', selected && 'is-selected')}
                          data-current={current || undefined}
                        >
                          <button
                            type="button"
                            className="nagi-photo-card-select"
                            disabled={saving}
                            aria-label={`Sélectionner ${photo.title}`}
                            aria-pressed={selected}
                            onClick={() => {
                              setChosen(photo);
                              setInspectedPhoto(photo);
                              setInspected(undefined);
                            }}
                          >
                            <EntryImage
                              src={photo.thumbnailUrl}
                              alt=""
                              className="nagi-photo-card-image"
                              sizes="200px"
                            />
                            {(selected || current) && (
                              <span className="nagi-photo-card-check">
                                <Check aria-hidden="true" size={13} />
                                {selected ? 'Sélectionnée' : 'Actuelle'}
                              </span>
                            )}
                            <span className="nagi-photo-card-title">{photo.title}</span>
                            <span className="nagi-photo-card-source">
                              {photo.creator || 'Source originale'}
                            </span>
                          </button>
                          <div className="nagi-photo-card-meta">
                            <PhotoStatus
                              rights={isOpenImage(photo) ? 'open_license' : photo.rightsStatus}
                            />
                            <button
                              className="nagi-photo-info"
                              title="Informations sur la photographie"
                              type="button"
                              aria-label={`Informations : ${photo.title}`}
                              onClick={() => {
                                setInspectedPhoto(photo);
                                setInspected(undefined);
                                focusInformation();
                              }}
                            >
                              <Info aria-hidden="true" size={13} />
                              <span>Informations</span>
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}
              <p className="nagi-photo-cache-note">
                {indexing
                  ? 'Recherche des photos en cours. Les premiers résultats restent consultables.'
                  : '10 photos maximum, conservées pour vos prochaines visites.'}
                {gallery?.searchIssue && <> {gallery.searchIssue}</>}
              </p>
            </div>
            <aside
              ref={inspector}
              tabIndex={-1}
              className="nagi-photo-inspector"
              aria-label="Informations de la photographie"
            >
              {inspected ? (
                <>
                  <EntryImage
                    src={
                      (previewEnabled ? inspected.preview?.previewUrl : undefined) ??
                      inspected.photo?.previewUrl ??
                      inspected.metadata.thumbnailUrl
                    }
                    fallbackSrc={inspected.metadata.thumbnailUrl}
                    alt=""
                    fit="contain"
                    className="nagi-photo-inspector-image"
                    sizes="320px"
                  />
                  <div className="nagi-photo-inspector-body">
                    <span className="nagi-photo-eyebrow">Informations</span>
                    <h3>{inspected.metadata.title ?? 'Photographie'}</h3>
                    <PhotoStatus
                      rights={inspected.rightsStatus}
                      label={
                        inspected.excluded
                          ? 'Exclue'
                          : inspected.availability === 'unavailable'
                            ? 'Indisponible'
                            : undefined
                      }
                    />
                    <dl className="nagi-photo-facts">
                      <div>
                        <dt>Source</dt>
                        <dd>
                          {inspected.metadata.source ??
                            inspected.metadata.domain ??
                            'Non renseignée'}
                        </dd>
                      </div>
                      <div>
                        <dt>Auteur</dt>
                        <dd>{inspected.creator || 'Non renseigné par la source'}</dd>
                      </div>
                      <div>
                        <dt>Licence</dt>
                        <dd>{inspected.license || 'Non renseignée'}</dd>
                      </div>
                      {inspected.metadata.imageWidth && inspected.metadata.imageHeight && (
                        <div>
                          <dt>Dimensions</dt>
                          <dd>
                            {inspected.metadata.imageWidth} × {inspected.metadata.imageHeight} px
                          </dd>
                        </div>
                      )}
                    </dl>
                    {inspected.metadata.link && (
                      <a
                        href={inspected.metadata.link}
                        target="_blank"
                        rel="noreferrer"
                        className="nagi-photo-link"
                      >
                        Ouvrir la page source
                        <ExternalLink aria-hidden="true" size={12} />
                      </a>
                    )}
                    {!inspected.photo && (
                      <p className="nagi-photo-context">
                        {previewEnabled
                          ? 'Disponible pour votre aperçu privé. Les droits restent à vérifier avant publication.'
                          : 'Cette photo doit être autorisée avant de pouvoir devenir une couverture.'}
                      </p>
                    )}
                    {!!inspected.sources.length && (
                      <details className="nagi-photo-references">
                        <summary>Autres références ({inspected.sources.length})</summary>
                        {inspected.sources.map((source) => (
                          <a href={source} key={source} target="_blank" rel="noreferrer">
                            {source}
                          </a>
                        ))}
                      </details>
                    )}
                    {!gallery?.canReview && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={saving}
                        onClick={() => void report()}
                      >
                        Signaler une image incorrecte
                      </Button>
                    )}
                    {gallery?.canReview && !previewEnabled && (
                      <RightsReview
                        key={inspected.id + inspected.rightsStatus}
                        candidate={inspected}
                        busy={saving}
                        onSave={review}
                      />
                    )}
                  </div>
                </>
              ) : detailedPhoto ? (
                <div className="nagi-photo-inspector-body">
                  <EntryImage
                    src={detailedPhoto.thumbnailUrl}
                    alt=""
                    className="nagi-photo-inspector-image"
                    sizes="320px"
                  />
                  <PhotoAttribution image={detailedPhoto} />
                </div>
              ) : (
                <div className="nagi-photo-inspector-empty">
                  <Info aria-hidden="true" size={24} />
                  <h3>Un choix éclairé</h3>
                  <p>
                    Sélectionnez une photo pour l’agrandir et consulter son auteur, sa source et ses
                    droits.
                  </p>
                  <PhotoStatus rights="unknown" />
                  <p>
                    Les photos à vérifier restent consultables. Leur publication nécessite une
                    autorisation.
                  </p>
                </div>
              )}
            </aside>
          </div>
          <footer className="nagi-photo-footer">
            <div className="nagi-photo-mode-row">
              <span className="nagi-photo-eyebrow">Mode d’affichage</span>
              <div
                className="nagi-photo-modes"
                role="group"
                aria-label="Mode d’affichage de la couverture"
              >
                {previewEnabled && (
                  <button
                    type="button"
                    aria-pressed={currentMode === 'published'}
                    disabled={saving}
                    onClick={() => void select('published')}
                    title="Revenir à la couverture publiée du lieu"
                  >
                    <ImageIcon aria-hidden="true" size={14} />
                    Couverture publiée
                  </button>
                )}
                <button
                  type="button"
                  aria-pressed={currentMode === 'fallback'}
                  disabled={saving}
                  onClick={() => void select('fallback')}
                  title="Appliquer le pictogramme du lieu"
                >
                  <Shapes aria-hidden="true" size={14} />
                  Utiliser le pictogramme
                </button>
                <button
                  type="button"
                  aria-pressed={currentMode === 'automatic'}
                  disabled={saving}
                  onClick={() => void select('automatic')}
                  title="Laisser Nagi choisir une photographie disponible"
                >
                  <Sparkles aria-hidden="true" size={14} />
                  Choix automatique
                </button>
              </div>
            </div>
            {error && (
              <p role="alert" className="nagi-photo-error">
                {error}
              </p>
            )}
            <div className="nagi-photo-decision">
              <p aria-live="polite">
                {chosen ? (
                  <>
                    <Check aria-hidden="true" size={14} />
                    <span>{chosen.title}</span>
                  </>
                ) : (
                  'Sélectionnez une photo pour continuer.'
                )}
              </p>
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => close(false)}
                >
                  Annuler
                </Button>
                <Button
                  type="button"
                  disabled={!chosen || saving}
                  onClick={() => void select('manual')}
                >
                  {saving ? 'Enregistrement…' : 'Choisir'}
                </Button>
              </div>
            </div>
          </footer>
        </DialogContent>
      </Dialog>
    </>
  );
}
function RightsReview({
  candidate,
  busy,
  onSave,
}: {
  candidate: DiscoveryCandidate;
  busy: boolean;
  onSave: (input: {
    rights: ImageRights;
    creator: string;
    license: string;
    licenseUrl: string;
    evidence: string;
    excluded: boolean;
  }) => Promise<void>;
}) {
  const [rights, setRights] = useState(candidate.rightsStatus),
    [creator, setCreator] = useState(candidate.creator ?? ''),
    [license, setLicense] = useState(candidate.license ?? ''),
    [licenseUrl, setLicenseUrl] = useState(candidate.licenseUrl ?? ''),
    [evidence, setEvidence] = useState(candidate.evidence ?? ''),
    [excluded, setExcluded] = useState(candidate.excluded);
  return (
    <form
      className="nagi-photo-review"
      onSubmit={(event) => {
        event.preventDefault();
        void onSave({ rights, creator, license, licenseUrl, evidence, excluded });
      }}
    >
      <h4 className="text-sm font-bold">Vérification des droits</h4>
      <p className="text-xs text-muted-foreground">
        Le résultat de recherche ne constitue pas une autorisation. Conservez une preuve avant
        d’autoriser la publication.
      </p>
      <div className="grid gap-3">
        <div>
          <Label htmlFor="photo-rights">Statut</Label>
          <select
            id="photo-rights"
            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm"
            value={rights}
            onChange={(event) => setRights(event.target.value as ImageRights)}
          >
            {Object.entries(rightsLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="photo-creator">Auteur</Label>
          <Input
            id="photo-creator"
            value={creator}
            maxLength={500}
            onChange={(event) => setCreator(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="photo-license">Licence ou autorisation</Label>
          <Input
            id="photo-license"
            value={license}
            maxLength={150}
            onChange={(event) => setLicense(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="photo-license-url">Lien de licence</Label>
          <Input
            id="photo-license-url"
            value={licenseUrl}
            maxLength={4096}
            onChange={(event) => setLicenseUrl(event.target.value)}
            placeholder="https://…"
          />
        </div>
        <div>
          <Label htmlFor="photo-evidence">Preuve de l’autorisation</Label>
          <Input
            id="photo-evidence"
            value={evidence}
            maxLength={2000}
            onChange={(event) => setEvidence(event.target.value)}
            placeholder="Page de licence, référence de l’accord du titulaire…"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={excluded}
          onChange={(event) => setExcluded(event.target.checked)}
        />
        Exclure cette image de la sélection
      </label>
      <Button type="submit" size="sm" variant="secondary" disabled={busy}>
        Enregistrer la vérification
      </Button>
    </form>
  );
}
