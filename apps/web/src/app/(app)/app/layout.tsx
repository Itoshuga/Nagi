import { requireViewer } from '@/features/auth/session';
import { TripMutationScope } from '@/features/trips/mutation-scope';
import { ImageResolverProvider } from '@/features/images/components';
import '../../spaces.css';
export const dynamic = 'force-dynamic';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  return (
    <TripMutationScope key={viewer.id}>
      <ImageResolverProvider url="/api/images">
        <div className="nagi-space">{children}</div>
      </ImageResolverProvider>
    </TripMutationScope>
  );
}
