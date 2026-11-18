import { redirect } from 'next/navigation';
import { profileHref } from '@nagi/shared';
import { requireViewer } from '@/features/auth/session';
import { authorizedProfile } from '@/features/profiles/server';
export default async function MyProfile() {
  const viewer = await requireViewer();
  const profile = await authorizedProfile(viewer.id);
  redirect(profileHref(profile?.username ?? viewer.username));
}
