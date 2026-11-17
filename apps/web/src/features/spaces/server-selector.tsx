'use client';
import { useActionState, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, LoaderCircle, Search, Star } from 'lucide-react';
import { Alert, Input } from '@nagi/ui';
import type { DiscordGuild } from '@nagi/shared';
import { GuildAvatar } from './guild-avatar';
import { selectGuild } from './actions';
export function ServerSelector({
  guilds,
  favorite,
}: {
  guilds: DiscordGuild[];
  favorite: string | null;
}) {
  const [query, setQuery] = useState('');
  const [state, action, pending] = useActionState(selectGuild, { error: '' });
  const reduce = useReducedMotion();
  const visible = guilds.filter((guild) =>
    guild.name.toLocaleLowerCase('fr-FR').includes(query.trim().toLocaleLowerCase('fr-FR')),
  );
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
      {state.error && <Alert className="mb-6">{state.error}</Alert>}
      <form action={action} aria-busy={pending}>
        <div
          className="flex max-h-[48svh] flex-wrap justify-center gap-x-7 gap-y-9 overflow-y-auto px-4 py-5 sm:gap-x-10 sm:gap-y-12"
          aria-label="Serveurs Discord disponibles"
        >
          {visible.map((guild, index) => (
            <motion.button
              key={guild.id}
              name="guildId"
              value={guild.id}
              type="submit"
              disabled={pending}
              className="guild-choice group flex w-28 flex-col items-center gap-4 disabled:opacity-50 sm:w-40"
              initial={reduce ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(index * 0.035, 0.24), duration: 0.3 }}
              whileHover={reduce ? {} : { y: -5, scale: 1.035 }}
              whileTap={reduce ? {} : { scale: 0.96 }}
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
            </motion.button>
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
          {pending ? (
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
      </form>
    </div>
  );
}
