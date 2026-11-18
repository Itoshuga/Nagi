'use client';

import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { FileText, Image, Link2, LockKeyhole } from 'lucide-react';
import './workspace.css';

const sections = [
  { id: 'contenu', label: 'Contenu', icon: FileText },
  { id: 'medias', label: 'Médias', icon: Image },
  { id: 'relations', label: 'Relations', icon: Link2 },
] as const;
type Section = (typeof sections)[number]['id'];

export function EntryWorkspace({
  content,
  media,
  relations,
  publication,
  mediaCount,
  relationCount,
  saved,
}: {
  content: ReactNode;
  media?: ReactNode;
  relations?: ReactNode;
  publication?: ReactNode;
  mediaCount: number;
  relationCount: number;
  saved: boolean;
}) {
  const id = useId();
  const revealingInvalid = useRef(false);
  const params = useSearchParams();
  const requested = params.get('onglet');
  const active: Section =
    saved && (requested === 'medias' || requested === 'relations') ? requested : 'contenu';
  function select(section: Section) {
    const url = new URL(window.location.href);
    if (section === 'contenu') url.searchParams.delete('onglet');
    else url.searchParams.set('onglet', section);
    url.hash = '';
    window.history.replaceState(null, '', url);
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const length = saved ? sections.length : 1;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + length) % length;
    const target = sections[next]!;
    select(target.id);
    document.getElementById(`${id}-${target.id}-tab`)?.focus();
  }
  return (
    <div
      className="entry-workspace"
      onInvalidCapture={(event) => {
        const field = event.target;
        if (!(field instanceof HTMLElement) || !field.closest('[role="tabpanel"][hidden]')) return;
        event.preventDefault();
        if (revealingInvalid.current) return;
        revealingInvalid.current = true;
        select('contenu');
        requestAnimationFrame(() => {
          revealingInvalid.current = false;
          field.focus();
          if (
            field instanceof HTMLInputElement ||
            field instanceof HTMLSelectElement ||
            field instanceof HTMLTextAreaElement
          )
            field.reportValidity();
        });
      }}
    >
      <div role="tablist" aria-label="Édition de la fiche" className="entry-workspace-tabs">
        {sections.map(({ id: section, label, icon: Icon }, index) => {
          const locked = !saved && section !== 'contenu';
          const count =
            section === 'medias' ? mediaCount : section === 'relations' ? relationCount : undefined;
          return (
            <button
              key={section}
              type="button"
              role="tab"
              id={`${id}-${section}-tab`}
              aria-controls={`${id}-${section}-panel`}
              aria-selected={active === section}
              disabled={locked}
              tabIndex={active === section ? 0 : -1}
              className="entry-workspace-tab"
              title={locked ? 'Créez la fiche pour compléter cette section.' : undefined}
              onClick={() => select(section)}
              onKeyDown={(event) => navigate(event, index)}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span>{label}</span>
              {locked ? (
                <LockKeyhole className="size-3 opacity-60" aria-hidden="true" />
              ) : (
                count !== undefined && <span className="entry-workspace-count">{count}</span>
              )}
            </button>
          );
        })}
      </div>
      {!saved && (
        <p className="my-5 text-sm leading-6 text-muted-foreground">
          Commencez par les informations de la fiche. Après sa création, vous pourrez ajouter vos
          images et vos relations.
        </p>
      )}
      {sections.map(({ id: section }) => (
        <div
          key={section}
          role="tabpanel"
          id={`${id}-${section}-panel`}
          aria-labelledby={`${id}-${section}-tab`}
          hidden={active !== section}
          tabIndex={0}
          className="entry-workspace-panel"
        >
          {section === 'contenu' ? content : section === 'medias' ? media : relations}
        </div>
      ))}
      {publication && <div className="mt-5">{publication}</div>}
    </div>
  );
}
