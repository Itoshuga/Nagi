'use client';

import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowRight, ArrowLeftRight } from 'lucide-react';
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

export function InverseRelationPreview({
  current,
  target,
  type,
  direction,
}: {
  current: string;
  target?: string;
  type?: SemanticRelationType;
  direction: RelationDirection;
}) {
  const reduced = useReducedMotion();
  const label = type ? relationLabel(type, direction === 'forward' ? 'inverse' : 'forward') : '';
  const sentenceLabel = label.slice(0, 1).toLocaleLowerCase('fr') + label.slice(1);
  return (
    <AnimatePresence initial={false}>
      {target && type && (
        <motion.div
          className="relation-inverse-note"
          key="inverse"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: reduced ? 0 : 0.16, ease: 'easeOut' }}
        >
          <div aria-live="polite">
            <ArrowLeftRight className="size-3.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="relation-inverse-caption">Relation inverse automatique</p>
              <p className="relation-inverse-sentence">
                {target} {sentenceLabel} {current}.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
