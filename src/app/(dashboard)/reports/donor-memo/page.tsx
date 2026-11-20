import { createClient } from "@/utils/supabase/server";
import { getOrganizationId, getOrganizationTimezone } from "@/app/actions/document-utils";
import { todayInTimezone } from "@/utils/dates";
import { getOrganizationSettings, getSettingsFunds } from "@/app/actions/settings";
import { DonorMemoClient } from "@/components/reports/DonorMemoClient";
import { DonorMemoLocked } from "@/components/reports/DonorMemoLocked";
import { featureAllowed } from "@/utils/plan";

export const dynamic = "force-dynamic";

export default async function DonorMemoPage() {
    const supabase = await createClient();
    const organizationId = await getOrganizationId();

    // Paid plans, and organisations that have been on one (a memo of existing data)
    if (!(await featureAllowed(supabase, organizationId, "donor_memo", "read"))) {
        return (
            <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
                <DonorMemoLocked />
            </div>
        );
    }

    const [funds, orgSettings, timezone] = await Promise.all([
        getSettingsFunds(),
        getOrganizationSettings(),
        getOrganizationTimezone(),
    ]);

    return (
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <DonorMemoClient
                funds={funds ?? []}
                fiscalYearStart={Number(orgSettings?.fiscal_year_start) || 1}
                today={todayInTimezone(timezone)}
            />
        </div>
    );
}
