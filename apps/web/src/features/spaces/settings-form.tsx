'use client';
import { useActionState, useState } from 'react';
import { ShieldCheck, Users } from 'lucide-react';
import { cn } from '@nagi/ui';
import { SettingsSection } from '@/features/settings/section';
import { SettingsSavebar } from '@/features/settings/savebar';
import { saveGuildSettings } from './actions';

export function SettingsForm({
  guildId,
  membersCanCreate,
  canManage,
}: {
  guildId: string;
  membersCanCreate: boolean;
  canManage: boolean;
}) {
  const [enabled, setEnabled] = useState(membersCanCreate);
  const [feedbackVisible, setFeedbackVisible] = useState(true);
  const [state, action, pending] = useActionState(saveGuildSettings.bind(null, guildId), {
    error: '',
  });
  return (
    <form
      action={action}
      aria-busy={pending}
      onSubmit={(event) => {
        if (!canManage) event.preventDefault();
        setFeedbackVisible(true);
      }}
    >
      <SettingsSection
        title="Créer, puis partir ensemble"
        description={
          canManage
            ? 'Choisissez qui peut lancer un nouveau voyage dans cet espace.'
            : 'Les administrateurs Discord de cet espace gèrent ces règles.'
        }
      >
        <fieldset disabled={pending || !canManage} className="min-w-0">
          <legend className="settings-legend">Qui peut créer un voyage ?</legend>
          <div className="settings-permissions">
            {[
              {
                value: true,
                title: 'Tous les membres',
                description: 'Chaque membre du serveur peut créer un voyage pour le groupe.',
                icon: Users,
              },
              {
                value: false,
                title: 'Les administrateurs',
                description: 'La création est réservée aux administrateurs Discord de cet espace.',
                icon: ShieldCheck,
              },
            ].map(({ value, title, description, icon: Icon }) => (
              <label
                key={String(value)}
                className={cn('settings-permission', enabled === value && 'is-selected')}
              >
                <input
                  type="radio"
                  name="members_can_create_trips"
                  value={value ? 'on' : 'off'}
                  checked={enabled === value}
                  onChange={() => {
                    setEnabled(value);
                    setFeedbackVisible(false);
                  }}
                />
                <Icon className="size-5" aria-hidden="true" />
                <strong>{title}</strong>
                <span>{description}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="settings-note">
          <ShieldCheck className="size-4" aria-hidden="true" />
          <span>
            Tous les membres conservent l’accès aux voyages communs. Les organisateurs de chaque
            voyage choisissent qui peut modifier son itinéraire.
          </span>
        </p>
        {!canManage && (
          <p className="settings-help">
            Ces permissions sont affichées en lecture seule pour votre compte.
          </p>
        )}
      </SettingsSection>
      {canManage && (
        <SettingsSavebar
          dirty={enabled !== membersCanCreate}
          pending={pending}
          error={feedbackVisible ? state.error : ''}
          onReset={() => {
            setEnabled(membersCanCreate);
            setFeedbackVisible(false);
          }}
        />
      )}
    </form>
  );
}
