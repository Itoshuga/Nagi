'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  Copy,
  MapPin,
  Pencil,
  Route,
  Sparkles,
} from 'lucide-react';
import { Alert, Button, Dialog, DialogTrigger, cn, toast } from '@nagi/ui';
import { profileHref } from '@nagi/shared';
import type { ProfileTrip, SocialProfile } from '@nagi/database';
import { EntryImage } from '@/features/media/image';
import { tripDates, tripStatus } from '@/features/trips/trip-list';
import { profileTrips } from './actions';
import { accentStyle, ProfileAvatar, ProfileBanner } from './visuals';
import './profile.css';

const ProfileEditor = dynamic(() => import('./editor'), { ssr: false });

export function SocialProfilePage({
  profile,
  own,
  banner,
}: {
  profile: SocialProfile;
  own: boolean;
  banner: string | null;
}) {
  const [editor, setEditor] = useState(false);
  const [tab, setTab] = useState<'overview' | 'trips'>('overview');
  const [copied, setCopied] = useState(false);
  const reduced = useReducedMotion();
  const prefix = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const custom = profile.customization;
  const memberSince = new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Paris',
  }).format(new Date(profile.created_at));
  async function copy() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${profileHref(profile.username)}`,
      );
      setCopied(true);
      toast.success('Lien du profil copié.');
    } catch {
      toast.error('La copie a échoué. Vous pouvez copier l’adresse de cette page.');
    }
  }
  return (
    <Dialog open={editor} onOpenChange={setEditor}>
      <motion.article
        className="social-profile"
        style={accentStyle(custom.accent)}
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <ProfileBanner src={banner} x={custom.banner_x} y={custom.banner_y} />
        <div className="profile-body">
          <div className="profile-topline">
            <ProfileAvatar user={profile} />
            <div className="profile-actions">
              <Button
                variant="secondary"
                size="sm"
                onClick={copy}
                aria-label="Copier le lien du profil"
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                <span className="hidden sm:inline">{copied ? 'Lien copié' : 'Copier le lien'}</span>
              </Button>
              {own && (
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Pencil className="size-3.5" />
                    Modifier le profil
                  </Button>
                </DialogTrigger>
              )}
            </div>
          </div>
          <div className="profile-identity">
            <h1>{profile.display_name}</h1>
            <p className="profile-handle">@{profile.username}</p>
            {custom.profile_title && (
              <p className="profile-personal-title">{custom.profile_title}</p>
            )}
            {custom.bio && <p className="profile-bio">{custom.bio}</p>}
          </div>
          <div className="profile-social-line">
            <span>
              <CalendarDays className="size-3.5" aria-hidden="true" />
              Membre de Nagi depuis {memberSince}
            </span>
            {!own && profile.common_guilds.length > 0 && (
              <span className="profile-common-summary">
                <span className="profile-guild-stack">
                  {profile.common_guilds.slice(0, 3).map((g) => (
                    <span key={g.id}>
                      {g.icon_url ? (
                        <Image src={g.icon_url} width={22} height={22} unoptimized alt="" />
                      ) : (
                        g.name.slice(0, 1)
                      )}
                    </span>
                  ))}
                </span>
                {profile.common_guilds.length}{' '}
                {profile.common_guilds.length === 1 ? 'serveur en commun' : 'serveurs en commun'}
              </span>
            )}
          </div>
          {profile.organized_count > 0 && (
            <button className="profile-stat" onClick={() => setTab('trips')}>
              <strong>{profile.organized_count}</strong>
              <span>{profile.organized_count === 1 ? 'voyage organisé' : 'voyages organisés'}</span>
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </button>
          )}
          <div
            className="profile-tabs"
            role="tablist"
            aria-label="Contenu du profil"
            onKeyDown={(event) => {
              if (
                !profile.organized_count ||
                !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === 'Home' ? 0 : event.key === 'End' ? 1 : tab === 'overview' ? 1 : 0;
              setTab(next ? 'trips' : 'overview');
              tabs.current[next]?.focus();
            }}
          >
            {(
              ['overview', ...(profile.organized_count > 0 ? ['trips'] : [])] as (
                'overview' | 'trips'
              )[]
            ).map((value, i) => (
              <button
                key={value}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                id={`${prefix}-${value}`}
                role="tab"
                aria-selected={tab === value}
                aria-controls={`${prefix}-panel-${value}`}
                tabIndex={tab === value ? 0 : -1}
                onClick={() => setTab(value)}
              >
                {value === 'overview' ? 'Aperçu' : 'Voyages'}
                {tab === value && (
                  <motion.span
                    className="profile-tab-indicator"
                    layoutId={`${prefix}-active`}
                    transition={{ duration: reduced ? 0 : 0.18 }}
                  />
                )}
              </button>
            ))}
          </div>
          <motion.div
            key={tab}
            id={`${prefix}-panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`${prefix}-${tab}`}
            tabIndex={0}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="profile-panel"
          >
            {tab === 'overview' ? (
              <div className="profile-overview">
                {profile.dream ? (
                  <section className="profile-dream">
                    <div className="profile-section-label">
                      <Sparkles className="size-4" />
                      Destination de rêve
                    </div>
                    <div className="profile-dream-link">
                      {profile.dream.cover && (
                        <EntryImage src={profile.dream.cover} className="profile-dream-image" />
                      )}
                      <div>
                        <p className="profile-dream-eyebrow">Un jour, peut-être.</p>
                        <h2>{profile.dream.city ?? profile.dream.country}</h2>
                        {profile.dream.city && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {profile.dream.country}
                          </p>
                        )}
                      </div>
                    </div>
                  </section>
                ) : own ? (
                  <button className="profile-empty-dream" onClick={() => setEditor(true)}>
                    <Sparkles className="size-5" />
                    <span>
                      <strong>Quelque part, une envie d’ailleurs.</strong>
                      <small>Ajoutez la destination qui vous fait rêver.</small>
                    </span>
                    <ArrowUpRight className="size-4" />
                  </button>
                ) : null}
                {profile.organized_count > 0 && (
                  <section className="profile-overview-trips">
                    <div className="profile-section-label">
                      <Route className="size-4" />
                      Carnet de voyages
                    </div>
                    <h2>Les aventures prennent forme.</h2>
                    <p>
                      {profile.display_name} organise {profile.organized_count}{' '}
                      {profile.organized_count === 1 ? 'voyage accessible' : 'voyages accessibles'}{' '}
                      dans vos espaces Discord partagés.
                    </p>
                    <button className="profile-text-link" onClick={() => setTab('trips')}>
                      Parcourir les voyages
                      <ArrowUpRight className="size-4" />
                    </button>
                  </section>
                )}
                {!profile.dream && !profile.organized_count && !own && (
                  <p className="py-4 text-sm text-muted-foreground">
                    Ce carnet s’écrira au fil des envies et des voyages.
                  </p>
                )}
                {!own && profile.common_guilds.length > 0 && (
                  <section className="profile-common-detail">
                    <h2>On se croise ici</h2>
                    <ul>
                      {profile.common_guilds.map((g) => (
                        <li key={g.id}>
                          <Link href={`/app/${g.id}`} prefetch={false}>
                            {g.icon_url ? (
                              <Image
                                src={g.icon_url}
                                alt=""
                                width={28}
                                height={28}
                                unoptimized
                                className="rounded-lg"
                              />
                            ) : (
                              <span className="grid size-7 place-items-center rounded-lg bg-muted text-xs">
                                {g.name.slice(0, 1)}
                              </span>
                            )}
                            <span>{g.name}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            ) : (
              <ProfileJourneys target={profile.id} />
            )}
          </motion.div>
        </div>
        {editor && (
          <ProfileEditor profile={profile} banner={banner} onClose={() => setEditor(false)} />
        )}
      </motion.article>
    </Dialog>
  );
}

function ProfileJourneys({ target }: { target: string }) {
  const [rows, setRows] = useState<ProfileTrip[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const started = useRef(false);
  const inFlight = useRef(false);
  async function load() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      const data = await profileTrips(target, page);
      setRows((old) => [...old, ...data.filter((t) => !old.some((v) => v.id === t.id))]);
      setPage((value) => value + 1);
      setMore(data.length === 12);
    } catch {
      setError('Impossible de charger les voyages. Vérifiez votre accès puis réessayez.');
    } finally {
      setPending(false);
      inFlight.current = false;
    }
  }
  // A ref callback starts loading only when this tab is actually mounted.
  return (
    <div
      ref={(element) => {
        if (element && !started.current) {
          started.current = true;
          void load();
        }
      }}
    >
      <p className="mb-6 text-xs leading-5 text-muted-foreground">
        Voyages organisés par ce membre et accessibles dans vos espaces Discord communs.
      </p>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((trip) => (
          <li key={trip.id}>
            <Link
              prefetch={false}
              href={`/app/${trip.guild_id}/trips/${trip.id}`}
              className="profile-trip group"
            >
              <div className="relative">
                <EntryImage
                  src={trip.cover_image_url}
                  className="aspect-[4/3] rounded-2xl [&>img]:transition-transform group-hover:[&>img]:scale-[1.03] motion-reduce:[&>img]:transform-none"
                />
                <span className="absolute bottom-3 left-3 rounded-full bg-card px-2.5 py-1 text-[11px] font-semibold">
                  {tripStatus[trip.status]}
                </span>
              </div>
              <h2 className="mt-4 flex items-start justify-between gap-2 text-base font-bold">
                {trip.title}
                <ArrowUpRight className="mt-1 size-4 shrink-0" />
              </h2>
              {trip.destination && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="size-3" />
                  {trip.destination}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">{tripDates(trip)}</p>
            </Link>
          </li>
        ))}
      </ul>
      {pending && (
        <div
          role="status"
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          aria-label="Chargement des voyages"
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="mt-4 aspect-[4/3] animate-pulse rounded-2xl bg-muted motion-reduce:animate-none"
            />
          ))}
        </div>
      )}
      {!pending && !rows.length && !error && (
        <p className="py-6 text-sm text-muted-foreground">Aucun voyage accessible actuellement.</p>
      )}
      {error && (
        <Alert role="alert" className="my-4">
          {error}
        </Alert>
      )}
      {!pending && (more || error) && (
        <Button
          variant="secondary"
          className={cn('mt-7', !rows.length && !error && 'hidden')}
          onClick={load}
        >
          {error ? 'Réessayer' : 'Voir plus de voyages'}
        </Button>
      )}
    </div>
  );
}
