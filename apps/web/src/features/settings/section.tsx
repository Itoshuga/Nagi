import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
  danger = false,
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <section className={`settings-section${danger ? ' settings-danger' : ''}`}>
      <header className="settings-section-heading">
        <span className="settings-section-icon">
          <Icon className="size-5" aria-hidden="true" strokeWidth={1.6} />
        </span>
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </header>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}
