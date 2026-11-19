import 'server-only';
import { revalidatePath, updateTag } from 'next/cache';
import { publishedCatalogTag, entryContentTag, relationTypesTag } from './queries';

export type CatalogResult = { ok: boolean; message: string; href?: string };

export function refreshCatalog(section: 'categories' | 'entries' | 'relations', id?: string) {
  updateTag(publishedCatalogTag);
  revalidatePath(`/admin/${section}`);
  if (id) revalidatePath(`/admin/${section}/${id}`);
  revalidatePath('/app/[guildId]/discover', 'layout');
  revalidatePath('/app/[guildId]/fiches/[entryId]/[slug]', 'page');
}

export function refreshRelations(entries: string[]) {
  for (const id of new Set(entries)) updateTag(entryContentTag(id));
  revalidatePath('/admin/relations');
  for (const id of new Set(entries)) {
    revalidatePath(`/admin/entries/${id}`);
    revalidatePath(`/admin/entries/${id}/preview`);
  }
}

export function refreshRelationTypes() {
  updateTag(relationTypesTag);
  revalidatePath('/admin/relations');
  revalidatePath('/admin/[section]/[destinationId]', 'page');
  revalidatePath('/admin/[section]/[destinationId]/preview', 'page');
}

export function catalogError(
  error: { code: string; message: string },
  fallback: string,
): CatalogResult {
  const messages: Record<string, string> = {
    catalog_field_in_use:
      'Ce champ contient des valeurs. Retirez-les des fiches concernées avant de le supprimer ou de changer son type.',
    catalog_reassign_fields:
      'Créez des champs de mêmes clés et de mêmes types dans la catégorie de destination pour conserver les valeurs.',
    catalog_order_changed: 'La liste a changé entre-temps. Rechargez la page et réessayez.',
    catalog_relation_type_in_use:
      'Ce type est utilisé. Vous pouvez modifier ses libellés, mais son sens et sa clé sont verrouillés.',
    catalog_relation_cycle: 'Cette relation formerait un cycle avec les liens existants.',
    catalog_relation_type_disabled: 'Ce type est désactivé. Choisissez un type actif.',
    catalog_relation_changed:
      'Cette relation ou ce type a changé. Rechargez la page avant de réessayer.',
    catalog_relation_key_immutable: 'La clé d’un type de relation est permanente.',
    catalog_relation_reassign:
      'Choisissez un type actif avec le même sens et la même règle hiérarchique.',
    catalog_relation_missing: 'Cette relation n’est plus disponible sur cette fiche.',
    catalog_media_changed: 'La galerie a changé entre-temps. Rechargez la page et réessayez.',
    catalog_media_limit: 'Vous pouvez ajouter jusqu’à 20 images à une fiche.',
    catalog_unknown_field:
      'Les champs de cette catégorie ont changé. Rechargez la fiche et réessayez.',
  };
  if (error.message.startsWith('catalog_required_field:')) {
    return {
      ok: false,
      message:
        'Une fiche publiée doit renseigner ce champ. Complétez les fiches concernées avant de poursuivre.',
    };
  }
  if (error.message.startsWith('catalog_invalid_field:')) {
    return {
      ok: false,
      message:
        'Cette opération rendrait une valeur existante invalide. Vérifiez les champs et les options des fiches concernées.',
    };
  }
  return {
    ok: false,
    message:
      messages[error.message] ??
      (error.code === '23505'
        ? 'Ce nom, cette clé ou ce lien est déjà utilisé.'
        : error.code === '23503'
          ? 'Des éléments liés empêchent cette opération. Vérifiez les dépendances.'
          : fallback),
  };
}
