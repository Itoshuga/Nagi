import type { ReactNode } from 'react';
import { safeCatalogUrl } from '@nagi/shared';

function inline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const tokens = /\[([^\]\r\n]+)\]\(([^\s)]+)\)|\*\*([^*\r\n]+)\*\*|\*([^*\r\n]+)\*/g;
  let offset = 0;
  for (const token of text.matchAll(tokens)) {
    const index = token.index ?? 0;
    parts.push(text.slice(offset, index));
    const [match, label, href, bold, italic] = token;
    const url = href ? safeCatalogUrl(href) : null;
    parts.push(
      url ? (
        <a
          key={index}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary-ink underline underline-offset-4"
        >
          {label}
        </a>
      ) : bold ? (
        <strong key={index}>{bold}</strong>
      ) : italic ? (
        <em key={index}>{italic}</em>
      ) : (
        match
      ),
    );
    offset = index + match.length;
  }
  parts.push(text.slice(offset));
  return parts;
}

type Block = { kind: 'p' | 'h2' | 'h3' | 'ul' | 'ol'; lines: string[] };

function blocks(text: string) {
  const items: Block[] = [];
  let merge = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) {
      merge = false;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const unordered = /^[-*]\s+(.+)$/.exec(line);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(line);
    const kind = heading
      ? heading[1]?.length === 3
        ? 'h3'
        : 'h2'
      : unordered
        ? 'ul'
        : ordered
          ? 'ol'
          : 'p';
    const value = heading?.[2] ?? unordered?.[1] ?? ordered?.[1] ?? line;
    const last = items.at(-1);
    if (merge && last?.kind === kind && !heading) last.lines.push(value);
    else items.push({ kind, lines: [value] });
    merge = !heading;
  }
  return items;
}

export function EntryRichText({ text }: { text: string }) {
  return (
    <div className="space-y-4 break-words text-sm leading-7 text-foreground sm:text-base">
      {blocks(text).map(({ kind, lines }, index) => {
        const Tag = kind;
        if (kind === 'ul' || kind === 'ol')
          return (
            <Tag key={index} className={kind === 'ul' ? 'list-disc pl-6' : 'list-decimal pl-6'}>
              {lines.map((line, i) => (
                <li key={i}>{inline(line)}</li>
              ))}
            </Tag>
          );
        return (
          <Tag
            key={index}
            className={
              kind === 'h2'
                ? 'pt-2 text-2xl font-bold'
                : kind === 'h3'
                  ? 'pt-1 text-xl font-bold'
                  : 'whitespace-pre-line'
            }
          >
            {inline(lines.join('\n'))}
          </Tag>
        );
      })}
    </div>
  );
}
