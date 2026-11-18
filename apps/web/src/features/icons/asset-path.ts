import { lucideAssetVersion } from './version.generated';

export function iconAssetPath(name?: string | null) {
  return name && name.length <= 80 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)
    ? `/icons/lucide/${lucideAssetVersion}/${name}.svg`
    : null;
}
