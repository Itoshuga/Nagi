'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { Alert, Button, LoadingState } from '@nagi/ui';
import type { CatalogCategory } from '@nagi/database';
import { loadEntryPanel } from './actions';
import type { RelationEntry } from '@/features/relations/entry-search';

const AdminGallery = dynamic(() =>
  import('@/features/media/gallery-admin').then((module) => module.AdminGallery),
);
const AdminEntryRelations = dynamic(() =>
  import('@/features/relations/admin').then((module) => module.AdminEntryRelations),
);

export function DeferredEntryPanel({
  kind,
  current,
  categories,
  maxFileSize,
  refreshKey,
}: {
  kind: 'medias' | 'relations';
  current: RelationEntry;
  categories: CatalogCategory[];
  maxFileSize: number;
  refreshKey: string;
}) {
  const { id: entryId } = current;
  const [data, setData] = useState<Awaited<ReturnType<typeof loadEntryPanel>>>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    loadEntryPanel(entryId, kind).then(
      (result) => {
        if (!cancelled) {
          setData(result);
          setError(false);
        }
      },
      () => {
        if (!cancelled) setError(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [entryId, kind, refreshKey, attempt]);
  if (error)
    return (
      <Alert role="alert">
        Chargement indisponible.{' '}
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setError(false);
            setAttempt((value) => value + 1);
          }}
        >
          Réessayer
        </Button>
      </Alert>
    );
  if (!data) return <LoadingState />;
  if (data.kind === 'medias')
    return (
      <AdminGallery
        entryId={entryId}
        media={data.media}
        cover={data.cover}
        maxFileSize={maxFileSize}
      />
    );
  return (
    <AdminEntryRelations
      current={current}
      categories={categories}
      relations={data.relations}
      types={data.types}
    />
  );
}
