import { requireViewer } from '@/features/auth/session';
import '../../spaces.css';
export const dynamic = 'force-dynamic';
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireViewer();
  return <div className="nagi-space">{children}</div>;
}
