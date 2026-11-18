import { notFound, redirect } from 'next/navigation';
import { profileHandleInput, profileHref } from '@nagi/shared';
import { requireViewer } from '@/features/auth/session';
import { authorizedProfile, profileServices, profileBannerUrl } from '@/features/profiles/server';
import { SocialProfilePage } from '@/features/profiles/profile';

export const metadata = { title: 'Profil Nagi', robots: { index: false, follow: false } };
export default async function Profile({ params }: { params: Promise<{ handle: string }> }) {
  const viewer = await requireViewer();
  const rawHandle = (await params).handle;
  const handle = profileHandleInput.safeParse(rawHandle);
  if (!handle.success) notFound();
  const target = await profileServices().store.resolve(handle.data);
  if (!target) notFound();
  const profile = await authorizedProfile(target.id);
  if (!profile) notFound();
  if (handle.data !== profile.username.toLowerCase()) redirect(profileHref(profile.username));
  return (
    <SocialProfilePage
      key={profile.id}
      profile={profile}
      own={profile.id === viewer.id}
      banner={profileBannerUrl(profile.id, profile.customization.banner_path)}
    />
  );
}
