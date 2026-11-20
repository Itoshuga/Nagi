'use client';
import { useEffect, useState } from 'react';
import { CloudCheck, CloudUpload, CloudOff, TriangleAlert } from 'lucide-react';
import type { TripQueueState } from './mutation-queue';

export function TripSaveStatus({ state, onRetry }: { state: TripQueueState; onRetry: () => void }) {
  const [waiting, setWaiting] = useState(false);
  const saving = state.pending > 0;
  useEffect(() => {
    if (!saving) return;
    const timer = setTimeout(() => setWaiting(true), 180);
    return () => {
      clearTimeout(timer);
      setWaiting(false);
    };
  }, [saving]);
  const interrupted = !state.online;
  const failed = state.failed || !!state.error;
  const label = interrupted
    ? 'Connexion interrompue'
    : failed
      ? 'Modifications non enregistrées'
      : saving
        ? 'Enregistrement…'
        : 'Toutes les modifications sont enregistrées';
  const Icon = interrupted ? CloudOff : failed ? TriangleAlert : saving ? CloudUpload : CloudCheck;
  return (
    <span
      className="trip-save-status"
      role="status"
      aria-live="polite"
      data-save-state={interrupted ? 'offline' : failed ? 'failed' : saving ? 'saving' : 'saved'}
      title={label}
    >
      <Icon className={saving && !waiting ? 'invisible size-3.5' : 'size-3.5'} aria-hidden="true" />
      <span
        className={
          (!saving && !failed && !interrupted) || (saving && !waiting)
            ? 'sr-only'
            : 'trip-save-label'
        }
      >
        {label}
      </span>
      {state.failed && (
        <button type="button" onClick={onRetry}>
          Réessayer
        </button>
      )}
    </span>
  );
}
