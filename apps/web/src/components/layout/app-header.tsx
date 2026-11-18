import type { Role } from '@nagi/shared';
import { Logo } from '@/components/shared/logo';
import { UserMenu } from './user-menu';
import './app-header.css';

export function AppHeader({
  viewer,
  context,
  navigation,
  mobileNavigation,
  feedback,
  guildId,
}: {
  viewer: { username?: string; display_name: string; avatar_url: string | null; role: Role };
  context?: React.ReactNode;
  navigation?: React.ReactNode;
  mobileNavigation?: React.ReactNode;
  feedback?: React.ReactNode;
  guildId?: string;
}) {
  return (
    <>
      <header className="app-header">
        <div className="app-container app-header-inner">
          <div className="app-header-start">
            <Logo href="/app" variant="app" />
            {context && (
              <>
                <span className="app-header-divider" aria-hidden="true" />
                <div className="app-header-context">{context}</div>
              </>
            )}
          </div>
          {navigation && (
            <nav aria-label="Navigation de l’espace" className="app-header-navigation">
              {navigation}
            </nav>
          )}
          <div className="app-header-account">
            <UserMenu viewer={viewer} variant="app" {...(guildId ? { guildId } : {})} />
          </div>
        </div>
      </header>
      {mobileNavigation}
      {feedback}
    </>
  );
}
