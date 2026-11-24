import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listCategories, listCategoryFields } from '@nagi/database';
import { requireAdmin } from '@/features/auth/session';
import { sessionDatabase } from '@/lib/supabase/server';
import { AdminCategoryList, CategoryFields, CategoryRemoval, CategorySettings } from './admin';
import { Card } from '@nagi/ui';
import { PlaceImage } from '@/features/integrations/mapbox/place-image';
import { ImagePicker } from '@/features/images/components';

export async function AdminCategories() {
  await requireAdmin();
  return <AdminCategoryList categories={await listCategories(await sessionDatabase())} />;
}

export async function AdminCategory({ id }: { id?: string }) {
  await requireAdmin();
  const db = await sessionDatabase();
  const categories = await listCategories(db);
  const category = id ? categories.find((item) => item.id === id) : undefined;
  if (id && !category) notFound();
  const [fields, usage] = category
    ? await Promise.all([
        listCategoryFields(db, category.id),
        db
          .from('entries')
          .select('id', { count: 'exact', head: true })
          .eq('category_id', category.id),
      ])
    : [[], null];
  if (usage?.error)
    throw new Error('Impossible de vérifier les fiches de la catégorie.', { cause: usage.error });
  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <Link
          href="/admin/categories"
          className="text-sm font-medium text-primary-ink hover:underline"
        >
          ← Catégories
        </Link>
        <h1 className="display-title mt-3 break-words font-display">
          {category?.name ?? 'Ajouter une catégorie'}
        </h1>
      </header>
      <CategorySettings
        category={category}
        position={Math.min(2147483647, (categories.at(-1)?.position ?? -1) + 1)}
      />
      {category && (
        <>
          <Card className="space-y-4">
            <h2 className="text-lg font-bold">Photographie de couverture</h2>
            <PlaceImage
              photoReference={{ source: 'nagi', kind: 'category', id: category.id }}
              category={category.name}
              className="aspect-[16/7] rounded-2xl"
              credits="dialog"
            />
            <ImagePicker reference={{ source: 'nagi', kind: 'category', id: category.id }} />
          </Card>
          <CategoryFields categoryId={category.id} fields={fields} />
          <CategoryRemoval category={category} categories={categories} count={usage?.count ?? 0} />
        </>
      )}
    </div>
  );
}
