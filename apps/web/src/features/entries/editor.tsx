'use client';

import { useRef, useState } from 'react';
import { Bold, Heading2, Italic, Link2, List, ListOrdered } from 'lucide-react';
import { Button, Label } from '@nagi/ui';
import { CatalogTextarea } from '@/features/catalog/admin-form';
import { EntryRichText } from './rich-text';

const controls = [
  { label: 'Titre', icon: Heading2, prefix: '## ', suffix: '', example: 'Titre', line: true },
  { label: 'Gras', icon: Bold, prefix: '**', suffix: '**', example: 'texte' },
  { label: 'Italique', icon: Italic, prefix: '*', suffix: '*', example: 'texte' },
  { label: 'Liste à puces', icon: List, prefix: '- ', suffix: '', example: 'Élément', line: true },
  {
    label: 'Liste numérotée',
    icon: ListOrdered,
    prefix: '1. ',
    suffix: '',
    example: 'Élément',
    line: true,
  },
  {
    label: 'Lien',
    icon: Link2,
    prefix: '[',
    suffix: '](https://exemple.fr)',
    example: 'Texte du lien',
  },
] as const;

export function EntryEditor({ initial }: { initial?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initial ?? '');
  const [preview, setPreview] = useState(false);
  function format(control: (typeof controls)[number]) {
    const input = ref.current;
    if (!input) return;
    const { selectionStart: start, selectionEnd: end } = input;
    const lineBreak = 'line' in control && start > 0 && value[start - 1] !== '\n' ? '\n' : '';
    const selected = value.slice(start, end) || control.example;
    const next =
      value.slice(0, start) +
      lineBreak +
      control.prefix +
      selected +
      control.suffix +
      value.slice(end);
    if (next.length > 20000) return;
    setValue(next);
    requestAnimationFrame(() => {
      input.focus();
      const contentStart = start + lineBreak.length + control.prefix.length;
      input.setSelectionRange(contentStart, contentStart + selected.length);
    });
  }

  return (
    <div>
      <Label htmlFor="entry-description">Description</Label>
      <div className="overflow-hidden rounded-2xl border border-input bg-background">
        <div
          className="flex flex-wrap items-center gap-1 border-b border-border p-1.5"
          role="group"
          aria-label="Mise en forme de la description"
        >
          {controls.map((control) => (
            <Button
              key={control.label}
              type="button"
              variant="ghost"
              size="icon"
              aria-label={control.label}
              title={control.label}
              disabled={preview}
              data-form-change
              onClick={() => format(control)}
            >
              <control.icon className="size-4" />
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto"
            aria-pressed={preview}
            onClick={() => setPreview(!preview)}
          >
            {preview ? 'Reprendre l’édition' : 'Aperçu'}
          </Button>
        </div>
        <CatalogTextarea
          ref={ref}
          id="entry-description"
          name="description"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={20000}
          rows={8}
          className={
            preview
              ? 'hidden'
              : 'block resize-y rounded-none border-0 focus-visible:outline-offset-[-3px]'
          }
          placeholder="Décrivez ce lieu ou cette expérience. Séparez les paragraphes par une ligne vide."
        />
        {preview && (
          <div className="min-h-32 p-4">
            {value.trim() ? (
              <EntryRichText text={value} />
            ) : (
              <p className="text-sm text-muted-foreground">Aucune description à prévisualiser.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
