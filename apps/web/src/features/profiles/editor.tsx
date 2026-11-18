'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Check, RotateCcw, Trash2, Upload } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
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
  toast,
} from '@nagi/ui';
import {
  coverFileSchema,
  profileBannerMaxSize,
  profileBioInput,
  profileCharacterCount,
  profileColors,
  profileTitleInput,
} from '@nagi/shared';
import type { SocialProfile } from '@nagi/database';
import { CatalogPicker } from '@/features/catalog/picker';
import { saveProfile, searchDreamDestinations, type DreamDestination } from './actions';
import { accentStyle, ProfileAvatar, ProfileBanner } from './visuals';

export default function ProfileEditor({
  profile,
  banner,
  onClose,
}: {
  profile: SocialProfile;
  banner: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const reduced = useReducedMotion();
  const custom = profile.customization;
  const [title, setTitle] = useState(custom.profile_title ?? '');
  const [bio, setBio] = useState(custom.bio ?? '');
  const [accent, setAccent] = useState(custom.accent);
  const [x, setX] = useState(custom.banner_x);
  const [y, setY] = useState(custom.banner_y);
  const [dream, setDream] = useState<DreamDestination | undefined>(
    profile.dream
      ? {
          id: profile.dream.city_id ?? profile.dream.country_id,
          name: profile.dream.city ?? profile.dream.country,
          country_id: profile.dream.country_id,
          country: profile.dream.country,
          city_id: profile.dream.city_id,
          kind: profile.dream.city_id ? 'city' : 'country',
        }
      : undefined,
  );
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [removed, setRemoved] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [imageError, setImageError] = useState('');
  const [reset, setReset] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const cancelReset = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const titleResult = profileTitleInput.safeParse(title);
  const bioResult = profileBioInput.safeParse(bio);
  const image = removed ? null : (preview ?? banner);
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);
  function choose(value?: File) {
    if (!value || pending) return;
    const check = coverFileSchema(profileBannerMaxSize).safeParse(value);
    if (!check.success) {
      setImageError(check.error.issues[0]?.message ?? 'Image invalide.');
      return;
    }
    setPreview(URL.createObjectURL(value));
    setFile(value);
    setRemoved(false);
    setImageError('');
    setX(50);
    setY(50);
  }
  async function save(defaults = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError('');
    const data = new FormData();
    Object.entries({
      revision: custom.revision,
      profile_title: defaults ? '' : title,
      bio: defaults ? '' : bio,
      accent: defaults ? '#73a6df' : accent,
      banner_x: defaults ? 50 : x,
      banner_y: defaults ? 50 : y,
      dream_country_id: defaults ? '' : (dream?.country_id ?? ''),
      dream_city_id: defaults ? '' : (dream?.city_id ?? ''),
      remove_banner: defaults || removed ? 'yes' : 'no',
    }).forEach(([key, value]) => data.set(key, String(value)));
    if (file && !defaults && !removed) data.set('banner', file);
    try {
      const result = await saveProfile(data);
      if (!result.ok) {
        setError(result.error);
        setReset(false);
        return;
      }
      toast.success(
        defaults ? 'Votre profil retrouve ses couleurs Nagi.' : 'Votre profil a été mis à jour.',
      );
      onClose();
      router.refresh();
    } catch {
      setError('L’enregistrement a échoué. Vos saisies sont conservées.');
      setReset(false);
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }
  return (
    <DialogContent
      className="profile-editor-dialog translate-x-0 translate-y-0 sm:-translate-x-1/2 sm:-translate-y-1/2"
      closeDisabled={pending}
      onEscapeKeyDown={(e) => {
        if (pending || reset) e.preventDefault();
        if (reset && !pending) setReset(false);
      }}
      onPointerDownOutside={(e) => {
        if (pending) e.preventDefault();
      }}
    >
      <div className="profile-editor-heading">
        <DialogTitle className="text-xl font-extrabold tracking-tight">
          Un profil qui vous ressemble.
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm text-muted-foreground">
          Quelques mots, une couleur, un coin du monde.
        </DialogDescription>
      </div>
      <form
        className="profile-editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="profile-editor-scroll" style={accentStyle(accent)}>
          <fieldset disabled={pending} className="min-w-0">
            <motion.div
              className="profile-editor-preview"
              animate={{ opacity: 1 }}
              initial={reduced ? false : { opacity: 0.7 }}
              transition={{ duration: 0.15 }}
            >
              <div
                className={`profile-dropzone${dragging ? ' profile-dropzone-active' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  choose(e.dataTransfer.files[0]);
                }}
              >
                <ProfileBanner src={image} x={x} y={y} compact />
                <button
                  type="button"
                  className="profile-banner-upload"
                  onClick={() => upload.current?.click()}
                >
                  <Camera className="size-4" />
                  {image ? 'Changer la bannière' : 'Ajouter une bannière'}
                </button>
                {dragging && (
                  <div className="profile-drop-hint">
                    <Upload />
                    Déposez votre image ici
                  </div>
                )}
              </div>
              <div className="px-4">
                <ProfileAvatar user={profile} small />
                <div className="profile-preview-identity">
                  <p className="text-lg font-extrabold">{profile.display_name}</p>
                  <p className="text-xs text-muted-foreground">@{profile.username}</p>
                  {title && <p className="mt-3 break-words text-sm font-semibold">{title}</p>}
                  {bio && (
                    <p className="mt-2 whitespace-pre-line break-words text-xs leading-5 text-muted-foreground">
                      {bio}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
            <input
              ref={upload}
              type="file"
              className="sr-only"
              tabIndex={-1}
              aria-label="Importer une bannière"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                choose(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                JPEG, PNG ou WebP · 5 Mo maximum · glisser-déposer possible
              </p>
              {image && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    setRemoved(true);
                    setFile(undefined);
                    setPreview(undefined);
                    setImageError('');
                  }}
                >
                  <Trash2 className="size-3" />
                  Retirer
                </button>
              )}
            </div>
            {imageError && (
              <p role="alert" className="mt-2 text-xs text-destructive">
                {imageError}
              </p>
            )}
            {image && (
              <div className="profile-position">
                <p className="mb-3 text-xs font-semibold">Recadrage panoramique</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    { label: 'Horizontal', value: x, change: setX },
                    { label: 'Vertical', value: y, change: setY },
                  ].map((axis) => (
                    <label key={axis.label} className="text-xs text-muted-foreground">
                      {axis.label}
                      <input
                        aria-label={`Positionnement ${axis.label.toLowerCase()} de la bannière`}
                        type="range"
                        min={0}
                        max={100}
                        value={axis.value}
                        onChange={(e) => axis.change(Number(e.target.value))}
                        className="mt-2 block w-full accent-primary-ink"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="profile-editor-field">
              <div className="profile-label-line">
                <Label htmlFor={`${id}-title`}>Votre titre</Label>
                <span
                  id={`${id}-title-count`}
                  className={!titleResult.success ? 'text-destructive' : ''}
                >
                  {profileCharacterCount(title)}/40
                </span>
              </div>
              <Input
                id={`${id}-title`}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="À la recherche du prochain ramen 🍜"
                aria-invalid={!titleResult.success}
                aria-describedby={`${id}-title-count${!titleResult.success ? ` ${id}-title-error` : ''}`}
              />
              {!titleResult.success && (
                <p id={`${id}-title-error`} className="profile-field-error">
                  {titleResult.error.issues[0]?.message}
                </p>
              )}
            </div>
            <div className="profile-editor-field">
              <div className="profile-label-line">
                <Label htmlFor={`${id}-bio`}>Quelques mots sur vous</Label>
                <span
                  id={`${id}-bio-count`}
                  className={!bioResult.success ? 'text-destructive' : ''}
                >
                  {profileCharacterCount(bio)}/280
                </span>
              </div>
              <textarea
                className="block w-full resize-y rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                id={`${id}-bio`}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={840}
                rows={4}
                placeholder="Vos envies d’ailleurs, vos petits rituels, ce qui vous anime…"
                aria-invalid={!bioResult.success}
                aria-describedby={`${id}-bio-help ${id}-bio-count${!bioResult.success ? ` ${id}-bio-error` : ''}`}
              />
              <p id={`${id}-bio-help`} className="mt-2 text-xs text-muted-foreground">
                Du texte et des emojis. Les liens, le HTML et le Markdown ne sont pas autorisés.
              </p>
              {!bioResult.success && (
                <p role="alert" id={`${id}-bio-error`} className="profile-field-error">
                  {bioResult.error.issues[0]?.message}
                </p>
              )}
            </div>
            <div className="profile-editor-field">
              <p className="mb-3 text-sm font-medium" id={`${id}-palette`}>
                Votre couleur
              </p>
              <div className="profile-palette" role="group" aria-labelledby={`${id}-palette`}>
                {Object.entries(profileColors).map(([color, label]) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={label}
                    title={label}
                    aria-pressed={accent === color}
                    style={{ background: color }}
                    onClick={() => setAccent(color)}
                  >
                    {accent === color && <Check className="size-4 text-slate-950" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="profile-editor-field">
              <CatalogPicker
                name="dream-selection"
                label="Destination de rêve"
                value={dream}
                selectedName={(d) => (d.kind === 'city' ? `${d.name}, ${d.country}` : d.name)}
                onSelect={setDream}
                search={searchDreamDestinations}
                placeholder="Rechercher un pays ou une ville…"
                render={(d) => (
                  <span className="flex justify-between gap-3">
                    <span>
                      {d.name}
                      {d.kind === 'city' && (
                        <small className="ml-2 text-muted-foreground">{d.country}</small>
                      )}
                    </span>
                    <small className="text-muted-foreground">
                      {d.kind === 'city' ? 'Ville' : 'Pays'}
                    </small>
                  </span>
                )}
              />
              {dream && (
                <button
                  type="button"
                  className="mt-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setDream(undefined)}
                >
                  Retirer cette destination
                </button>
              )}
            </div>
            {error && (
              <Alert role="alert" className="mt-5">
                {error}
              </Alert>
            )}
            <Dialog
              open={reset}
              onOpenChange={(open) => {
                if (!pending) setReset(open);
              }}
            >
              <DialogTrigger asChild>
                <button type="button" className="profile-reset">
                  <RotateCcw className="size-3.5" />
                  Réinitialiser les personnalisations
                </button>
              </DialogTrigger>
              <DialogContent
                closeDisabled={pending}
                className="max-w-sm"
                onOpenAutoFocus={(e) => {
                  e.preventDefault();
                  cancelReset.current?.focus();
                }}
                onEscapeKeyDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!pending) setReset(false);
                }}
                onPointerDownOutside={(e) => {
                  if (pending) e.preventDefault();
                }}
              >
                <DialogTitle className="text-lg font-bold">
                  Repartir d’une page blanche ?
                </DialogTitle>
                <DialogDescription className="mt-3 text-sm leading-6 text-muted-foreground">
                  Le titre, la biographie, la bannière et la destination de rêve seront retirés. La
                  couleur Nagi sera rétablie. Votre identité Discord reste synchronisée.
                </DialogDescription>
                <div className="mt-6 flex justify-end gap-2">
                  <Button
                    ref={cancelReset}
                    variant="ghost"
                    disabled={pending}
                    onClick={() => setReset(false)}
                  >
                    Annuler
                  </Button>
                  <Button variant="destructive" disabled={pending} onClick={() => void save(true)}>
                    {pending ? 'Réinitialisation…' : 'Réinitialiser'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </fieldset>
        </div>
        <div className="profile-editor-footer">
          <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" disabled={pending || !titleResult.success || !bioResult.success}>
            {pending ? 'Enregistrement…' : 'Enregistrer les modifications'}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}
