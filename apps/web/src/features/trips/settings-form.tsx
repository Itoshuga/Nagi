'use client';

import {
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCheck,
  Globe2,
  ImagePlus,
  Info,
  LoaderCircle,
  LockKeyhole,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
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
  cn,
} from '@nagi/ui';
import { coverFileSchema, coverMebibyte, snowflakeSchema } from '@nagi/shared';
import type { CatalogLocation, Trip, TripService } from '@nagi/database';
import { CatalogPicker } from '@/features/catalog/picker';
import { CatalogSelect, CatalogTextarea } from '@/features/catalog/admin-form';
import { EntryImage } from '@/features/media/image';
import { UserIdentity } from '@/features/profiles/identity';
import { editTrip, tripPlaceOptions, type TripFormState } from './actions';
import { tripStatus } from './trip-list';
import './settings.css';

const tabs = [
  { id: 'trip-general', label: 'Général', description: 'Destination & dates', icon: Settings2 },
  { id: 'trip-cover', label: 'Couverture', description: 'L’image du voyage', icon: ImagePlus },
  {
    id: 'trip-organizers',
    label: 'Collaboration',
    description: 'Accès & organisateurs',
    icon: Users,
  },
] as const;
type SettingsTab = (typeof tabs)[number]['id'];
type Organizers = Awaited<ReturnType<TripService['organizerCards']>>;
type FormAction = (state: TripFormState, form: FormData) => Promise<TripFormState>;
const currentTab = (): SettingsTab =>
  tabs.find((tab) => `#${tab.id}` === window.location.hash)?.id ?? 'trip-general';
function selectTab(tab: SettingsTab) {
  window.history.replaceState(window.history.state, '', `#${tab}`);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}
function SectionHeading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <header className="trip-settings-section-heading">
      <h2>{title}</h2>
      <p>{children}</p>
    </header>
  );
}

export function TripSettingsForm({
  guild,
  trip,
  destination,
  destinationCover,
  organizers,
  maxCoverBytes,
  timezones,
  run,
  remove,
}: {
  guild: string;
  trip: Trip;
  destination?: CatalogLocation;
  destinationCover?: string | null;
  organizers: Organizers;
  maxCoverBytes: number;
  timezones: readonly string[];
  run: FormAction;
  remove: FormAction;
}) {
  const prefix = useId();
  const [tab, setTab] = useState<SettingsTab>('trip-general');
  const tabReady = useRef(false);
  const [initial] = useState(() => ({
    title: trip.title,
    description: trip.description,
    start_date: trip.start_date ?? '',
    end_date: trip.end_date ?? '',
    timezone: trip.timezone,
    status: trip.status,
    collaboration_mode: trip.collaboration_mode,
  }));
  const [draft, setDraft] = useState(initial);
  const [country, setCountry] = useState(destination);
  const [version, setVersion] = useState(trip.version);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<string>();
  const [removeCover, setRemoveCover] = useState(false);
  const [fileError, setFileError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [discordId, setDiscordId] = useState('');
  const [teamFeedback, setTeamFeedback] = useState({ error: '', success: '' });
  const [teamPending, startTeamTransition] = useTransition();
  const teamInFlight = useRef(false);
  const [errorVisible, setErrorVisible] = useState(true);
  const [state, action, pending] = useActionState(
    async (previous: TripFormState, form: FormData) => {
      setErrorVisible(true);
      // React resets native file inputs after actions; retain the upload for retries.
      if (file) form.set('cover', file);
      else form.delete('cover');
      return run(previous, form);
    },
    { error: '' },
  );
  const busy = pending || teamPending;
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(initial) ||
    country?.id !== destination?.id ||
    !!file ||
    removeCover;
  const fallbackCover = country?.id === destination?.id ? destinationCover : null;
  const cover = preview ?? (removeCover ? null : trip.cover_image_url) ?? fallbackCover;
  const customCover = !!preview || (!!trip.cover_image_url && !removeCover);
  const path = `/app/${guild}/trips/${trip.id}`;

  useEffect(() => {
    if (preview) return () => URL.revokeObjectURL(preview);
  }, [preview]);
  useEffect(() => {
    const sync = () => {
      setTab(currentTab());
      tabReady.current = true;
    };
    const frame = requestAnimationFrame(sync);
    window.addEventListener('hashchange', sync);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', sync);
    };
  }, []);
  useEffect(() => {
    if (tabReady.current && window.location.hash !== `#${tab}`) selectTab(tab);
  }, [tab, trip.version]);

  function reset() {
    setDraft(initial);
    setCountry(destination);
    setFile(undefined);
    setPreview(undefined);
    setRemoveCover(false);
    setFileError('');
    setErrorVisible(false);
    if (fileInput.current) fileInput.current.value = '';
  }
  function changeOrganizer(removeId?: string) {
    if (busy || teamInFlight.current) return;
    if (!removeId && !snowflakeSchema.safeParse(discordId.trim()).success) {
      setTeamFeedback({
        error: 'Saisissez un identifiant Discord de 17 à 20 chiffres.',
        success: '',
      });
      document.getElementById(`${prefix}-discord`)?.focus();
      return;
    }
    teamInFlight.current = true;
    setTeamFeedback({ error: '', success: '' });
    startTeamTransition(async () => {
      try {
        const result = await editTrip(
          guild,
          trip.id,
          version,
          removeId
            ? { operation: 'organizer_remove', data: { id: removeId } }
            : { operation: 'organizer_add', data: { discord_id: discordId.trim() } },
        );
        if (result.ok) {
          setVersion(result.version);
          setDiscordId('');
          setTeamFeedback({
            error: '',
            success: removeId ? 'Organisateur retiré.' : 'Organisateur ajouté.',
          });
        } else {
          setTeamFeedback({
            error:
              result.reason === 'conflict'
                ? 'Le voyage a été modifié ailleurs. Rechargez la page avant de réessayer.'
                : result.error,
            success: '',
          });
        }
      } catch {
        setTeamFeedback({
          error: 'Impossible de mettre à jour les organisateurs. Réessayez.',
          success: '',
        });
      } finally {
        teamInFlight.current = false;
      }
    });
  }
  return (
    <div className="trip-settings-page">
      <Link href={path} className="trip-settings-back">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Retour au voyage
      </Link>
      <header className="trip-settings-heading">
        <div>
          <p className="trip-settings-eyebrow">À votre façon</p>
          <h1>Paramètres du voyage</h1>
          <p>Les détails qui donnent le ton. L’organisation qui vous ressemble.</p>
        </div>
        <span className="trip-settings-status">{tripStatus[draft.status]}</span>
      </header>
      <div className="trip-settings-layout">
        <aside className="trip-settings-sidebar">
          <div className="trip-settings-trip">
            <EntryImage src={cover} className="trip-settings-thumb" sizes="48px" />
            <div>
              <strong>{draft.title.trim() || 'Votre voyage'}</strong>
              <span>{country?.name ?? 'Destination libre'}</span>
            </div>
          </div>
          <div
            role="tablist"
            aria-label="Paramètres du voyage"
            aria-orientation="vertical"
            className="trip-settings-tabs"
          >
            {tabs.map(({ id, label, description, icon: Icon }, index) => (
              <button
                key={id}
                type="button"
                role="tab"
                id={`${prefix}-${id}-tab`}
                aria-controls={id}
                aria-selected={tab === id}
                tabIndex={tab === id ? 0 : -1}
                onClick={() => selectTab(id)}
                onKeyDown={(event) => {
                  const next =
                    event.key === 'ArrowDown' || event.key === 'ArrowRight'
                      ? (index + 1) % tabs.length
                      : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
                        ? (index + tabs.length - 1) % tabs.length
                        : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? tabs.length - 1
                            : -1;
                  if (next < 0) return;
                  event.preventDefault();
                  selectTab(tabs[next]!.id);
                  document.getElementById(`${prefix}-${tabs[next]!.id}-tab`)?.focus();
                }}
              >
                <Icon className="size-[18px]" aria-hidden="true" />
                <span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </span>
              </button>
            ))}
          </div>
          <TripDeleteForm version={version} title={trip.title} run={remove} disabled={busy} />
        </aside>
        <form
          id={`${prefix}-form`}
          action={action}
          className="trip-settings-form"
          aria-busy={busy}
          onReset={(event) => event.preventDefault()}
          onInvalidCapture={(event) => {
            const input = event.target as HTMLInputElement;
            const panel = input.closest<HTMLElement>('[role="tabpanel"]');
            if (!panel?.hidden) return;
            event.preventDefault();
            selectTab(panel.id as SettingsTab);
            requestAnimationFrame(() => {
              input.focus();
              input.reportValidity();
            });
          }}
        >
          <input type="hidden" name="version" value={version} />
          <input type="hidden" name="remove_cover" value={removeCover ? 'yes' : ''} />
          <fieldset disabled={busy} className="min-w-0">
            <section
              id="trip-general"
              role="tabpanel"
              aria-labelledby={`${prefix}-trip-general-tab`}
              hidden={tab !== 'trip-general'}
              className="trip-settings-panel"
            >
              <SectionHeading title="Les grandes lignes">
                Une destination, un nom et quelques dates pour poser le décor.
              </SectionHeading>
              <div className="trip-settings-fields">
                <div>
                  <Label htmlFor={`${prefix}-title`}>Nom du voyage</Label>
                  <Input
                    id={`${prefix}-title`}
                    name="title"
                    required
                    maxLength={120}
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                    placeholder="Japon, à notre rythme"
                  />
                </div>
                <div className="trip-settings-columns">
                  <CatalogPicker
                    name="destination_country_id"
                    label="Destination principale"
                    placeholder="Choisir un pays (facultatif)"
                    value={country}
                    selectedName={(item) => item.name}
                    search={(query) => tripPlaceOptions(guild, 'countries', query)}
                    onSelect={setCountry}
                    disabled={busy}
                  />
                  <div>
                    <Label htmlFor={`${prefix}-status`}>Statut du voyage</Label>
                    <CatalogSelect
                      id={`${prefix}-status`}
                      name="status"
                      value={draft.status}
                      onChange={(e) =>
                        setDraft({ ...draft, status: e.target.value as Trip['status'] })
                      }
                    >
                      {Object.entries(tripStatus).map(([status, label]) => (
                        <option key={status} value={status}>
                          {label}
                        </option>
                      ))}
                    </CatalogSelect>
                  </div>
                </div>
                <div>
                  <div className="trip-settings-label-row">
                    <Label htmlFor={`${prefix}-description`}>Quelques mots sur le voyage</Label>
                    <span>Facultatif</span>
                  </div>
                  <CatalogTextarea
                    id={`${prefix}-description`}
                    name="description"
                    rows={3}
                    maxLength={4000}
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    placeholder="L’ambiance, les envies, les idées à partager…"
                  />
                </div>
              </div>
              <div className="trip-settings-divider-heading">
                <CalendarDays className="size-4" aria-hidden="true" />
                <h3>Dates & horaires</h3>
                <span>À définir à votre rythme</span>
              </div>
              <div className="trip-settings-fields">
                <div className="trip-settings-columns">
                  <div>
                    <Label htmlFor={`${prefix}-start`}>Départ</Label>
                    <Input
                      id={`${prefix}-start`}
                      name="start_date"
                      type="date"
                      max={draft.end_date || undefined}
                      value={draft.start_date}
                      onChange={(e) => setDraft({ ...draft, start_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`${prefix}-end`}>Retour</Label>
                    <Input
                      id={`${prefix}-end`}
                      name="end_date"
                      type="date"
                      min={draft.start_date || undefined}
                      value={draft.end_date}
                      onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor={`${prefix}-zone`}>Fuseau horaire</Label>
                  <Input
                    id={`${prefix}-zone`}
                    name="timezone"
                    list={`${prefix}-zones`}
                    required
                    value={draft.timezone}
                    onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
                    aria-describedby={`${prefix}-zone-help`}
                  />
                  <datalist id={`${prefix}-zones`}>
                    {timezones.map((zone) => (
                      <option key={zone} value={zone} />
                    ))}
                  </datalist>
                  <p id={`${prefix}-zone-help`} className="trip-settings-help">
                    Les horaires des étapes suivent l’heure locale du voyage.
                  </p>
                </div>
                <p className="trip-settings-note">
                  <Info className="size-4" aria-hidden="true" />
                  <span>
                    Les journées sont complétées selon vos dates. Si vous raccourcissez le séjour,
                    les journées et étapes déjà prévues sont conservées.
                  </span>
                </p>
              </div>
            </section>
            <section
              id="trip-cover"
              role="tabpanel"
              aria-labelledby={`${prefix}-trip-cover-tab`}
              hidden={tab !== 'trip-cover'}
              className="trip-settings-panel"
            >
              <SectionHeading title="Une image, votre voyage">
                Donnez-lui une couverture qui vous ressemble.
              </SectionHeading>
              <div className="trip-settings-fields">
                <div className="trip-settings-cover-preview">
                  <EntryImage
                    src={cover}
                    className="trip-settings-cover-image"
                    sizes="(max-width: 767px) 100vw, 720px"
                  />
                  <div className="trip-settings-cover-shade" />
                  <span className="trip-settings-cover-source">
                    {customCover
                      ? 'Couverture personnalisée'
                      : cover
                        ? 'Couverture de la destination'
                        : 'Couverture par défaut'}
                  </span>
                  <div className="trip-settings-cover-caption">
                    <span>{country?.name ?? 'Votre prochaine destination'}</span>
                    <strong>{draft.title.trim() || 'Votre voyage'}</strong>
                  </div>
                </div>
                <input
                  ref={fileInput}
                  id={`${prefix}-cover`}
                  name="cover"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="Choisir une couverture"
                  onChange={(event) => {
                    const next = event.target.files?.[0];
                    if (!next) return;
                    const parsed = coverFileSchema(maxCoverBytes).safeParse(next);
                    if (!parsed.success) {
                      event.target.value = '';
                      setFile(undefined);
                      setPreview(undefined);
                      setFileError(
                        parsed.error.issues[0]?.message ?? 'Choisissez une image valide.',
                      );
                      return;
                    }
                    setFile(next);
                    setPreview(URL.createObjectURL(next));
                    setRemoveCover(false);
                    setFileError('');
                  }}
                />
                <div className="trip-settings-cover-tools">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => fileInput.current?.click()}
                  >
                    <Upload className="size-4" aria-hidden="true" />
                    {customCover ? 'Changer l’image' : 'Choisir une image'}
                  </Button>
                  {customCover && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setFile(undefined);
                        setPreview(undefined);
                        setRemoveCover(!!trip.cover_image_url);
                        setFileError('');
                        if (fileInput.current) fileInput.current.value = '';
                      }}
                    >
                      <X className="size-4" aria-hidden="true" />
                      Retirer
                    </Button>
                  )}
                  {removeCover && (
                    <button
                      type="button"
                      className="trip-settings-text-button"
                      onClick={() => setRemoveCover(false)}
                    >
                      Conserver l’image actuelle
                    </button>
                  )}
                </div>
                <p className="trip-settings-help">
                  {file ? `${file.name} · ` : ''}JPEG, PNG ou WebP · {maxCoverBytes / coverMebibyte}{' '}
                  Mo maximum. Un format horizontal est idéal.
                </p>
                {fileError && <Alert role="alert">{fileError}</Alert>}
                <p className="trip-settings-note">
                  <ImagePlus className="size-4" aria-hidden="true" />
                  <span>
                    Sans image personnalisée, Nagi utilise la couverture de votre destination
                    lorsqu’elle est disponible.
                  </span>
                </p>
              </div>
            </section>
            <section
              id="trip-organizers"
              role="tabpanel"
              aria-labelledby={`${prefix}-trip-organizers-tab`}
              hidden={tab !== 'trip-organizers'}
              className="trip-settings-panel"
            >
              <SectionHeading title="Mieux préparer, ensemble">
                Choisissez qui organise et qui peut faire évoluer l’itinéraire.
              </SectionHeading>
              <div className="trip-settings-fields">
                <fieldset className="min-w-0">
                  <legend className="trip-settings-legend">Qui peut modifier l’itinéraire ?</legend>
                  <div className="trip-settings-permissions">
                    {(
                      [
                        {
                          value: 'all_members',
                          title: 'Tous les membres',
                          text: 'Chaque membre du serveur peut ajouter et organiser les étapes.',
                          icon: Globe2,
                        },
                        {
                          value: 'organizers_only',
                          title: 'Les organisateurs',
                          text: 'Les autres membres consultent le voyage sans le modifier.',
                          icon: LockKeyhole,
                        },
                      ] as const
                    ).map(({ value, title, text, icon: Icon }) => (
                      <label
                        key={value}
                        className={cn(
                          'trip-settings-permission',
                          draft.collaboration_mode === value && 'is-selected',
                        )}
                      >
                        <input
                          type="radio"
                          name="collaboration_mode"
                          value={value}
                          checked={draft.collaboration_mode === value}
                          onChange={() => setDraft({ ...draft, collaboration_mode: value })}
                        />
                        <Icon className="size-5" aria-hidden="true" />
                        <strong>{title}</strong>
                        <span>{text}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <p className="trip-settings-note">
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  <span>
                    Les paramètres du voyage et la gestion des organisateurs restent réservés aux
                    organisateurs.
                  </span>
                </p>
              </div>
              <div className="trip-settings-divider-heading">
                <Users className="size-4" aria-hidden="true" />
                <h3>Organisateurs</h3>
                <span>{organizers.length}</span>
              </div>
              <div className="trip-settings-fields">
                {organizers.length === 0 && (
                  <p className="trip-settings-help">
                    Ce voyage n’a plus d’organisateur. Vous pouvez en ajouter un en tant
                    qu’administrateur Discord de cet espace.
                  </p>
                )}
                <ul className="trip-settings-organizers">
                  {organizers.map((person) => (
                    <li key={person.id}>
                      <UserIdentity
                        user={{
                          id: person.id,
                          username: person.username,
                          display_name: person.name,
                          avatar_url: person.avatar,
                        }}
                      />
                      {person.id === trip.created_by ? (
                        <span className="trip-settings-owner">Créateur</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => changeOrganizer(person.id)}
                          aria-label={`Retirer ${person.name} des organisateurs`}
                          className="trip-settings-remove-member"
                        >
                          Retirer
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <div
                  className="trip-settings-invite"
                  role="group"
                  aria-labelledby={`${prefix}-invite-label`}
                >
                  <Label id={`${prefix}-invite-label`} htmlFor={`${prefix}-discord`}>
                    Ajouter un organisateur
                  </Label>
                  <div>
                    <Input
                      id={`${prefix}-discord`}
                      inputMode="numeric"
                      maxLength={20}
                      value={discordId}
                      onChange={(event) => setDiscordId(event.target.value)}
                      placeholder="Identifiant Discord du membre"
                      aria-describedby={`${prefix}-invite-help`}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          changeOrganizer();
                        }
                      }}
                    />
                    <Button type="button" variant="secondary" onClick={() => changeOrganizer()}>
                      <UserPlus className="size-4" aria-hidden="true" />
                      Ajouter
                    </Button>
                  </div>
                  <p id={`${prefix}-invite-help`} className="trip-settings-help">
                    Le membre doit avoir ouvert cet espace dans Nagi. Sur Discord, le mode
                    développeur permet de copier son identifiant.
                  </p>
                </div>
                {teamFeedback.error && <Alert role="alert">{teamFeedback.error}</Alert>}
                <p className="trip-settings-team-status" role="status">
                  {teamPending ? (
                    <>
                      <LoaderCircle
                        className="size-3.5 animate-spin motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                      Mise à jour de l’équipe…
                    </>
                  ) : teamFeedback.success ? (
                    <>
                      <Check className="size-3.5" aria-hidden="true" />
                      {teamFeedback.success}
                    </>
                  ) : (
                    'Les changements d’équipe sont enregistrés immédiatement.'
                  )}
                </p>
              </div>
            </section>
          </fieldset>
        </form>
      </div>
      <div className={cn('trip-settings-savebar', (dirty || pending) && 'is-active')}>
        <div className="trip-settings-save-feedback">
          {state.error && errorVisible && !pending ? (
            <p role="alert" className="trip-settings-save-error">
              {state.error}
            </p>
          ) : (
            <p role="status">
              {pending ? (
                <LoaderCircle
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : dirty ? (
                <span className="trip-settings-dirty-dot" />
              ) : (
                <CheckCheck className="size-4" aria-hidden="true" />
              )}
              {pending
                ? 'Enregistrement…'
                : dirty
                  ? 'Modifications non enregistrées'
                  : 'Tout est à jour'}
            </p>
          )}
        </div>
        <div className="trip-settings-save-actions">
          <Button type="button" variant="ghost" disabled={!dirty || busy} onClick={reset}>
            Rétablir
          </Button>
          <Button type="submit" form={`${prefix}-form`} disabled={!dirty || busy}>
            <Save className="size-4" aria-hidden="true" />
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function TripDeleteForm({
  version,
  title,
  run,
  disabled,
}: {
  version: number;
  title: string;
  run: FormAction;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(run, { error: '' });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <button type="button" className="trip-settings-delete" disabled={disabled}>
          <Trash2 className="size-4" aria-hidden="true" />
          Supprimer le voyage
        </button>
      </DialogTrigger>
      <DialogContent
        closeDisabled={pending}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <span className="trip-settings-delete-icon">
          <Trash2 className="size-5" aria-hidden="true" />
        </span>
        <DialogTitle className="pr-5 text-xl font-extrabold tracking-tight">
          Supprimer ce voyage ?
        </DialogTitle>
        <DialogDescription className="mt-3 text-sm leading-6 text-muted-foreground">
          Le voyage « {title} », ses journées, ses étapes et ses notes seront supprimés
          définitivement. Les fiches du catalogue sont conservées.
        </DialogDescription>
        <form action={action} className="mt-6 space-y-4" aria-busy={pending}>
          <input type="hidden" name="version" value={version} />
          <input type="hidden" name="confirm" value="yes" />
          {state.error && <Alert role="alert">{state.error}</Alert>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setOpen(false)}
              autoFocus
            >
              Annuler
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? 'Suppression…' : 'Supprimer le voyage'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
