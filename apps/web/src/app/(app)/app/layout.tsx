import { requireViewer } from '@/features/auth/session';
import { TripMutationScope } from '@/features/trips/mutation-scope';
import '../../spaces.css';
export const dynamic = 'force-dynamic';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  return (
    <TripMutationScope key={viewer.id}>
      <div className="nagi-space">{children}</div>
    </TripMutationScope>
  );
}
