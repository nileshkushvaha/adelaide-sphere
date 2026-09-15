import { fetchServiceAlerts } from '@/lib/api';
import { ServiceAlertBanner } from './service-alert-banner';

/**
 * The alert region above the public header (SRS 1.2 ALRT 002/004).
 *
 * Server-rendered: which alerts qualify, in what order, is decided by the API,
 * so nothing here can show an alert outside its window. The region is always
 * present in the markup even when empty, so a later alert does not push the page
 * down and cost a layout shift (NFR 001); it simply has nothing inside it.
 */
export async function ServiceAlertBar() {
  const alerts = await fetchServiceAlerts();
  if (alerts.length === 0) return null;
  return (
    <div className="ms-alert-region">
      {alerts.map((alert) => (
        <ServiceAlertBanner key={`${alert.id}:${alert.contentVersion}`} alert={alert} />
      ))}
    </div>
  );
}
