'use client';

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { toast } from '@nagi/ui';
import type { DiscordGuild } from '@nagi/shared';
import { GuildAvatar } from './guild-avatar';
import { rememberSelectedGuild } from './actions';
import './space-navigation.css';

type Selection = {
  guild: DiscordGuild;
  from: string;
  x: number;
  y: number;
  scale: number;
};
const SpaceNavigationContext = createContext<{
  opening: string | null;
  begin: (guild: DiscordGuild, bounds?: DOMRect) => void;
} | null>(null);

export function SpaceNavigation({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [selection, setSelection] = useState<Selection | null>(null);
  const [dismissed, setDismissed] = useState<Selection | null>(null);
  const recorded = useRef<Selection | null>(null);
  const href = selection ? `/app/${selection.guild.id}` : null;
  const arrived = !!href && (pathname === href || pathname.startsWith(`${href}/`));
  const visible = selection && selection !== dismissed;

  useEffect(() => {
    if (!selection) return;
    // Only an actual arrival records a choice. Prefetching never writes preferences.
    if (arrived && recorded.current !== selection) {
      recorded.current = selection;
      startTransition(async () => {
        try {
          const result = await rememberSelectedGuild(selection.guild.id);
          if (result.error) toast.error(result.error);
        } catch {
          toast.error('Votre dernier espace n’a pas pu être mémorisé.');
        }
      });
    }
    // Never leave an animation over a failed, redirected or interrupted navigation.
    const delay = arrived ? 220 : pathname !== selection.from ? 0 : 5000;
    const timer = window.setTimeout(() => {
      if (!arrived && pathname === selection.from) setDismissed(selection);
      else setSelection((current) => (current === selection ? null : current));
    }, delay);
    return () => window.clearTimeout(timer);
  }, [selection, pathname, arrived]);

  function begin(guild: DiscordGuild, bounds?: DOMRect) {
    setSelection({
      guild,
      from: pathname,
      x: bounds ? bounds.left + bounds.width / 2 - window.innerWidth / 2 : 0,
      y: bounds ? bounds.top + bounds.height / 2 - window.innerHeight / 2 + 35 : 0,
      scale: bounds ? bounds.width / 112 : 1,
    });
  }

  return (
    <SpaceNavigationContext.Provider
      value={{ opening: visible ? selection.guild.id : null, begin }}
    >
      {children}
      {visible && (
        <div
          className="space-transfer"
          data-arrived={arrived}
          aria-hidden="true"
          style={
            {
              '--space-from-x': `${selection.x}px`,
              '--space-from-y': `${selection.y}px`,
              '--space-from-scale': selection.scale,
            } as CSSProperties
          }
        >
          <div className="space-transfer-glow" />
          <div className="space-transfer-content">
            <div className="space-transfer-avatar">
              <GuildAvatar guild={selection.guild} large />
            </div>
            <p>{selection.guild.name}</p>
            <span>Votre espace, ensemble.</span>
          </div>
        </div>
      )}
    </SpaceNavigationContext.Provider>
  );
}

export function useSpaceNavigation() {
  const navigation = useContext(SpaceNavigationContext);
  if (!navigation) throw new Error('SpaceNavigation is required.');
  return navigation;
}
