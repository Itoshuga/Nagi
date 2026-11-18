import { cn } from '@nagi/ui';
import { iconAssetPath } from './asset-path';

export function FieldIcon({ name, className }: { name?: string | null; className?: string }) {
  const src = iconAssetPath(name);
  if (!src) return null;
  return (
    <span
      aria-hidden="true"
      data-icon={name}
      className={cn('inline-block size-4 shrink-0 bg-current', className)}
      style={{
        maskImage: `url("${src}")`,
        WebkitMaskImage: `url("${src}")`,
        maskSize: 'contain',
        maskRepeat: 'no-repeat',
        maskPosition: 'center',
      }}
    />
  );
}
