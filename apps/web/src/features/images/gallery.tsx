'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ExternalLink, Info, Loader2, Search } from 'lucide-react';
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
import { useResolvedImage, PhotoAttribution } from './components';
import type {
  DiscoveryCandidate,
  ImageGallery,
  ImageReference,
  ImageRights,
  PersistentImage,
  PreviewImage,
} from './model';
import { imageRightsLabels as rightsLabels } from './model';
export function ImageGalleryPicker({
  reference,
  disabled = false,
  initiallyOpen = false,
  className,
  children,
}: {
  reference: ImageReference;
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
    [inspected, setInspected] = useState<DiscoveryCandidate>();
  const readAbort = useRef<AbortController | null>(null),
    indexAbort = useRef<AbortController | null>(null);
  const inspector = useRef<HTMLElement | null>(null);
  useEffect(() => {
    inspector.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [inspected?.id]);
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
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          className={className}
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
          className="flex max-h-[90dvh] max-w-5xl flex-col overflow-hidden p-0"
          closeDisabled={saving}
        >
          <header className="shrink-0 space-y-2 border-b border-border px-5 pb-4 pt-6 sm:px-7">
            <DialogTitle className="pr-8 font-display text-xl font-extrabold">
              Choisir une photographie
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {reference.visit
                ? 'Ce choix concerne uniquement cette visite.'
                : 'La couverture du catalogue reste indépendante des voyages.'}{' '}
              {previewEnabled
                ? 'Aperçu de développement, visible uniquement par vous. La couverture publiée reste inchangée.'
                : 'Les images à vérifier restent dans la galerie sans être publiées.'}
            </DialogDescription>
            <div className="relative pt-2">
              <Search
                aria-hidden="true"
                className="absolute left-3 top-5 size-4 text-muted-foreground"
              />
              <Input
                className="pl-9"
                value={filter}
                disabled={indexing}
                onChange={(event) => {
                  setFilter(event.target.value);
                }}
                placeholder="Rechercher parmi les résultats…"
                aria-label="Rechercher parmi les photographies"
              />
            </div>
          </header>
          <div className="min-h-0 space-y-5 overflow-y-auto p-5 sm:p-7">
            {loading && !gallery && (
              <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Chargement de la galerie…
              </p>
            )}
            {!!gallery?.items.length && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {candidates.map((item) => {
                  const selectable = previewEnabled ? (item.preview ?? item.photo) : item.photo;
                  return (
                    <div
                      key={item.id}
                      data-image-candidate={item.id}
                      className={cn(
                        'overflow-hidden rounded-2xl border bg-card',
                        (chosen?.id === selectable?.id && selectable) || inspected?.id === item.id
                          ? 'border-primary ring-2 ring-primary/25'
                          : 'border-border',
                      )}
                    >
                      <button
                        type="button"
                        className="relative block w-full text-left"
                        aria-label={`Sélectionner ${item.metadata.title ?? 'cette photographie'}`}
                        aria-pressed={!!selectable && chosen?.id === selectable.id}
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
                          className="aspect-[4/3]"
                          sizes="200px"
                        />
                        <span
                          className={cn(
                            'absolute bottom-2 left-2 rounded-full bg-background/95 px-2 py-0.5 text-[10px] font-semibold',
                            item.photo ? 'text-primary-ink' : 'text-muted-foreground',
                          )}
                        >
                          {item.excluded
                            ? 'Exclue'
                            : item.availability === 'unavailable'
                              ? 'Indisponible'
                              : rightsLabels[item.rightsStatus]}
                        </span>
                        {selectable && chosen?.id === selectable.id && (
                          <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground">
                            <Check className="size-4" />
                          </span>
                        )}
                      </button>
                      <div className="space-y-1 p-2.5">
                        <p className="line-clamp-2 text-xs font-semibold">
                          {item.metadata.title ?? 'Photographie'}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {item.metadata.source ?? item.metadata.domain ?? 'Source à consulter'}
                        </p>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[11px] text-primary-ink"
                          onClick={() => setInspected(item)}
                        >
                          <Info className="size-3" />
                          Informations
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {gallery && !gallery.items.length && !loading && (
              <div className="rounded-2xl bg-muted/50 p-7 text-center text-sm text-muted-foreground">
                {filter
                  ? 'Aucun résultat ne correspond à ce filtre.'
                  : 'Aucune photographie découverte pour le moment.'}
              </div>
            )}
            {gallery && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <p role="status" className="text-muted-foreground">
                  {Math.min(10, gallery.total)}{' '}
                  {gallery.total > 1 ? 'images trouvées' : 'image trouvée'}
                  {indexing
                    ? ' · Recherche en cours…'
                    : gallery.state === 'complete'
                      ? ' · Recherche terminée, résultats conservés.'
                      : gallery.stopReason === 'budget'
                        ? ' · Limite de recherche atteinte.'
                        : ''}
                </p>
              </div>
            )}
            {gallery && !indexing && (
              <p className="text-xs text-muted-foreground">
                Dix photos maximum par lieu. Elles sont conservées et réutilisées sans nouvelle
                recherche.
                {gallery.searchIssue && <> {gallery.searchIssue}</>}
              </p>
            )}
            {indexing && (
              <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Les premières images restent consultables pendant la recherche.
              </p>
            )}
            {!!fallbacks.length && (
              <section>
                <h3 className="mb-3 text-sm font-bold">Autres photographies autorisées</h3>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {fallbacks.map((photo) => (
                    <button
                      type="button"
                      key={photo.id}
                      aria-label={`Sélectionner ${photo.title}`}
                      aria-pressed={chosen?.id === photo.id}
                      className={cn(
                        'overflow-hidden rounded-2xl border text-left',
                        chosen?.id === photo.id
                          ? 'border-primary ring-2 ring-primary/25'
                          : 'border-border',
                      )}
                      onClick={() => {
                        setChosen(photo);
                        setInspected(undefined);
                      }}
                    >
                      <EntryImage
                        src={photo.thumbnailUrl}
                        alt=""
                        className="aspect-[4/3]"
                        sizes="200px"
                      />
                      <span className="block p-2 text-xs font-semibold line-clamp-2">
                        {photo.title}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {inspected && (
              <section
                ref={inspector}
                className="space-y-4 rounded-2xl border border-border bg-muted/25 p-4"
                aria-label="Informations de la photographie"
              >
                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                  <EntryImage
                    src={
                      (previewEnabled ? inspected.preview?.previewUrl : undefined) ??
                      inspected.photo?.previewUrl ??
                      inspected.metadata.thumbnailUrl
                    }
                    fallbackSrc={inspected.metadata.thumbnailUrl}
                    alt=""
                    fit="contain"
                    className="aspect-[4/3] rounded-xl"
                    sizes="400px"
                  />
                  <div className="space-y-2 text-sm">
                    <h3 className="font-bold">{inspected.metadata.title ?? 'Photographie'}</h3>
                    <p>{inspected.metadata.source ?? inspected.metadata.domain}</p>
                    {inspected.metadata.imageWidth && inspected.metadata.imageHeight && (
                      <p className="text-muted-foreground">
                        {inspected.metadata.imageWidth} × {inspected.metadata.imageHeight} px
                      </p>
                    )}
                    <p>{rightsLabels[inspected.rightsStatus]}</p>
                    {inspected.metadata.link && (
                      <a
                        href={inspected.metadata.link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary-ink underline"
                      >
                        Ouvrir la page source
                        <ExternalLink className="size-3" />
                      </a>
                    )}
                    {!!inspected.sources.length && (
                      <details className="text-xs text-muted-foreground">
                        <summary>Autres références ({inspected.sources.length})</summary>
                        {inspected.sources.map((source) => (
                          <a
                            className="mt-1 block break-all underline"
                            href={source}
                            key={source}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {source}
                          </a>
                        ))}
                      </details>
                    )}
                    {!gallery?.canReview && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => void report()}>
                        Signaler une image incorrecte
                      </Button>
                    )}
                  </div>
                </div>
                {gallery?.canReview && !previewEnabled && (
                  <RightsReview
                    key={inspected.id + inspected.rightsStatus}
                    candidate={inspected}
                    busy={saving}
                    onSave={review}
                  />
                )}
              </section>
            )}
            {chosen && !inspected && (
              <details className="rounded-xl border border-border p-3 text-sm">
                <summary>Crédits de la sélection</summary>
                <PhotoAttribution image={chosen} />
              </details>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-background p-4 sm:px-7">
            <div className="flex flex-wrap gap-2">
              {previewEnabled && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => void select('published')}
                >
                  Couverture publiée
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => void select('fallback')}
              >
                Utiliser le pictogramme
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={saving}
                onClick={() => void select('automatic')}
              >
                Choix automatique
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
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
          </footer>
        </DialogContent>
      </Dialog>
      {result?.selected && (
        <p className="text-xs text-muted-foreground">{result.selected.attribution}</p>
      )}
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
      className="space-y-3 border-t border-border pt-4"
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
      <div className="grid gap-3 sm:grid-cols-2">
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
        <div className="sm:col-span-2">
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
