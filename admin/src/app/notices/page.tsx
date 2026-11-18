import { AdminBanner } from '@admin/components/AdminBanner';
import { AdminShell } from '@admin/components/AdminShell';
import { NoticesScreen } from './NoticesScreen';

export default function NoticesPage() {
  return <><AdminBanner title="Notices" /><AdminShell><NoticesScreen /></AdminShell></>;
}
