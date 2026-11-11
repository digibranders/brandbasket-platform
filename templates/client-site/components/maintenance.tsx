import { maintenanceMarkup, type MaintenanceDetails } from "@/lib/maintenance-page";

/**
 * Shown in place of the whole website while its plan has ended. It says only that the site is under maintenance: the
 * visitors are the business's customers, so nothing mentions a plan or payment. The markup is shared with the proxy's
 * plain-HTML answer (lib/maintenance-page.ts), and every value in it is escaped there.
 */
export function Maintenance(details: MaintenanceDetails) {
  return <div dangerouslySetInnerHTML={{ __html: maintenanceMarkup(details) }} />;
}
