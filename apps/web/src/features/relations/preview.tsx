import { ArrowRight } from 'lucide-react';
import { relationLabel, type RelationDirection, type SemanticRelationType } from '@nagi/shared';

export function RelationPreview({
  current,
  other,
  type,
  direction = 'forward',
}: {
  current: string;
  other?: string;
  type?: SemanticRelationType;
  direction?: RelationDirection;
}) {
  const target = other || 'Fiche associée';
  return (
    <div className="relation-preview" aria-live="polite">
      <p className="entry-dialog-label mb-4">Ce qui apparaîtra sur les deux fiches</p>
      {[
        { from: current, to: target, direction },
        {
          from: target,
          to: current,
          direction: direction === 'forward' ? ('inverse' as const) : ('forward' as const),
        },
      ].map((row, i) => (
        <div className="relation-preview-reading" key={i}>
          <p className="text-[10px] text-muted-foreground">Depuis {row.from}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-6">
            <strong className="break-words">{row.from}</strong>
            <ArrowRight className="size-3 shrink-0" aria-hidden="true" />
            <span className="font-semibold text-primary-ink">
              {type ? relationLabel(type, row.direction) : 'Choisissez un lien'}
            </span>
            <ArrowRight className="size-3 shrink-0" aria-hidden="true" />
            <strong className="break-words">{row.to}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}
