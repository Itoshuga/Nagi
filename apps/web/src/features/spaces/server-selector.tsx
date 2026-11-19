'use client';
import Link from 'next/link';
import { useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, LoaderCircle, Search, Star, Volume2, VolumeX } from 'lucide-react';
import { Input, cn } from '@nagi/ui';
import type { DiscordGuild } from '@nagi/shared';
import { GuildAvatar } from './guild-avatar';
import { useSpaceNavigation } from './space-navigation';
import { useSpaceSounds } from './space-sounds';

const MotionLink = motion.create(Link);
export function ServerSelector({
  guilds,
  favorite,
}: {
  guilds: DiscordGuild[];
  favorite: string | null;
}) {
  const [query, setQuery] = useState('');
  const [prepared, setPrepared] = useState(
    () => new Set([guilds.find((guild) => guild.id === favorite)?.id ?? guilds[0]?.id]),
  );
  const { opening, begin } = useSpaceNavigation();
  const sounds = useSpaceSounds();
  const reduce = useReducedMotion();
  const visible = guilds.filter((guild) =>
    guild.name.toLocaleLowerCase('fr-FR').includes(query.trim().toLocaleLowerCase('fr-FR')),
  );
  function prepare(id: string) {
    setPrepared((current) => (current.has(id) ? current : new Set([...current, id])));
  }
  return (
    <div className="mt-12 w-full max-w-4xl">
      {guilds.length > 8 && (
        <div className="relative mx-auto mb-10 max-w-xs">
          <Search
            aria-hidden="true"
            className="absolute left-4 top-3.5 size-4 text-muted-foreground"
          />
          <Input
            aria-label="Rechercher un serveur"
            placeholder="Trouver un espace…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="rounded-full bg-white pl-11"
          />
        </div>
      )}
      <div aria-busy={!!opening}>
        <div
          className="flex max-h-[48svh] flex-wrap justify-center gap-x-7 gap-y-9 overflow-y-auto px-4 py-5 sm:gap-x-10 sm:gap-y-12"
          aria-label="Serveurs Discord disponibles"
          role="group"
        >
          {visible.map((guild, index) => (
            <MotionLink
              key={guild.id}
              href={`/app/${guild.id}`}
              prefetch={prepared.has(guild.id)}
              aria-disabled={!!opening || undefined}
              className={cn(
                'guild-choice group flex w-28 flex-col items-center gap-4 sm:w-40',
                opening === guild.id && 'is-opening',
                opening && opening !== guild.id && 'is-muted',
              )}
              onPointerEnter={(event) => {
                prepare(guild.id);
                if (event.pointerType !== 'touch' && !opening) sounds.hover();
              }}
              onPointerDown={() => prepare(guild.id)}
              onFocus={(event) => {
                prepare(guild.id);
                if (event.currentTarget.matches(':focus-visible') && !opening) sounds.hover();
              }}
              onClick={(event) => {
                if (
                  event.defaultPrevented ||
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                if (opening) {
                  event.preventDefault();
                  return;
                }
                sounds.select();
                const bounds = event.currentTarget
                  .querySelector('.guild-bubble')
                  ?.getBoundingClientRect();
                begin(guild, bounds);
              }}
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.035, 0.24), duration: 0.3 }}
              whileHover={reduce || opening ? {} : { y: -5, scale: 1.035 }}
              whileTap={reduce || opening ? {} : { scale: 0.96 }}
            >
              <GuildAvatar guild={guild} large />
              <span className="flex min-h-10 w-full items-start justify-center gap-1.5 text-center text-sm font-bold leading-5">
                <span className="line-clamp-2 break-words">{guild.name}</span>
                {favorite === guild.id && (
                  <Star
                    className="mt-0.5 size-3 shrink-0 fill-primary text-primary-ink"
                    aria-label="Serveur par défaut"
                  />
                )}
              </span>
            </MotionLink>
          ))}
        </div>
        {!visible.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Aucun espace ne correspond à votre recherche.
          </p>
        )}
        <p
          role="status"
          className="mt-9 flex min-h-5 items-center justify-center gap-2 text-xs text-muted-foreground"
        >
          {opening ? (
            <>
              <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />{' '}
              Ouverture de votre espace…
            </>
          ) : (
            <>
              {guilds.length === 1
                ? 'Un espace, tout votre groupe.'
                : `${guilds.length} espaces en commun avec Nagi`}
              <ArrowRight className="size-3.5" />
            </>
          )}
        </p>
      </div>
      <div className="mt-4 flex justify-center">
        <button
          type="button"
          className="selector-sound-toggle"
          aria-label="Sons de sélection"
          aria-pressed={sounds.enabled}
          title={sounds.enabled ? 'Couper les sons' : 'Activer les sons'}
          onClick={sounds.toggle}
        >
          {sounds.enabled ? (
            <Volume2 className="size-3.5" aria-hidden="true" />
          ) : (
            <VolumeX className="size-3.5" aria-hidden="true" />
          )}
          {sounds.enabled ? 'Sons activés' : 'Sons coupés'}
        </button>
      </div>
    </div>
  );
}
