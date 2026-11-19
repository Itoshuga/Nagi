'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Compass, Settings2, ShieldCheck, UserRound, Users } from 'lucide-react';
import './settings.css';

const icons = {
  profile: UserRound,
  security: ShieldCheck,
  preferences: Compass,
  general: Settings2,
  members: Users,
};

type SettingsTab = {
  id: string;
  label: string;
  description: string;
  icon: keyof typeof icons;
  content: ReactNode;
};

export function SettingsWorkspace({
  title,
  description,
  back,
  badge,
  identity,
  sidebarAction,
  notice,
  tabs,
}: {
  title: string;
  description: string;
  back: { href: string; label: string };
  badge: string;
  identity: ReactNode;
  sidebarAction?: ReactNode;
  notice?: ReactNode;
  tabs: SettingsTab[];
}) {
  const prefix = useId();
  const [selected, setSelected] = useState(tabs[0]!.id);
  const [orientation, setOrientation] = useState<'vertical' | 'horizontal'>('vertical');
  const active = tabs.some((tab) => tab.id === selected) ? selected : tabs[0]!.id;
  const tabIds = tabs.map((tab) => tab.id).join(',');

  useEffect(() => {
    const sync = () => {
      const id = window.location.hash.slice(1);
      setSelected(tabIds.split(',').includes(id) ? id : tabIds.split(',')[0]!);
    };
    const frame = requestAnimationFrame(sync);
    window.addEventListener('hashchange', sync);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('hashchange', sync);
    };
  }, [tabIds]);

  useEffect(() => {
    const mobile = window.matchMedia('(max-width: 767.98px)');
    const sync = () => setOrientation(mobile.matches ? 'horizontal' : 'vertical');
    sync();
    mobile.addEventListener('change', sync);
    return () => mobile.removeEventListener('change', sync);
  }, []);

  function select(id: string) {
    setSelected(id);
    window.history.replaceState(window.history.state, '', `#${id}`);
  }

  return (
    <div className="settings-page">
      <Link href={back.href} className="settings-back">
        <ArrowLeft className="size-4" aria-hidden="true" />
        {back.label}
      </Link>
      <header className="settings-heading">
        <div>
          <p className="settings-eyebrow">À votre façon</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <span className="settings-status">{badge}</span>
      </header>
      {notice}
      <div className="settings-layout">
        <aside className="settings-sidebar">
          <div className="settings-trip">{identity}</div>
          <div
            role="tablist"
            aria-label={title}
            aria-orientation={orientation}
            className="settings-tabs"
          >
            {tabs.map(({ id, label, description: detail, icon }, index) => {
              const Icon = icons[icon];
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`${prefix}-${id}-tab`}
                  aria-controls={id}
                  aria-selected={active === id}
                  tabIndex={active === id ? 0 : -1}
                  onClick={() => select(id)}
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
                    const nextId = tabs[next]!.id;
                    select(nextId);
                    document.getElementById(`${prefix}-${nextId}-tab`)?.focus();
                  }}
                >
                  <Icon className="size-[18px]" aria-hidden="true" />
                  <span>
                    <strong>{label}</strong>
                    <small>{detail}</small>
                  </span>
                </button>
              );
            })}
          </div>
          {sidebarAction}
        </aside>
        <div className="settings-content">
          {tabs.map(({ id, content }) => (
            <div
              key={id}
              id={id}
              role="tabpanel"
              aria-labelledby={`${prefix}-${id}-tab`}
              hidden={active !== id}
              tabIndex={0}
            >
              {content}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
