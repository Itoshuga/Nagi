import type { ReactNode } from 'react';

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-panel">
      <header className="settings-section-heading">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      <div className="settings-fields">{children}</div>
    </section>
  );
}
