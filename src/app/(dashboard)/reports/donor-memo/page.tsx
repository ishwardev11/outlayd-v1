import { createClient } from "@/utils/supabase/server";
import { getOrganizationId } from "@/app/actions/document-utils";
import { getOrganizationSettings, getSettingsFunds } from "@/app/actions/settings";
import { DonorMemoClient } from "@/components/reports/DonorMemoClient";
import { DonorMemoLocked } from "@/components/reports/DonorMemoLocked";

export const dynamic = "force-dynamic";

export default async function DonorMemoPage() {
    const supabase = await createClient();
    const organizationId = await getOrganizationId();

    // Paid plans only (same rule as Procurement)
    const { data: plan } = await supabase
        .from("organizations")
        .select("subscription_status, subscription_tier")
        .eq("id", organizationId)
        .maybeSingle();
    const isPro = plan?.subscription_status === "pro" || plan?.subscription_tier === "growth";

    if (!isPro) {
        return (
            <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
                <DonorMemoLocked />
            </div>
        );
    }

    const [funds, orgSettings] = await Promise.all([
        getSettingsFunds(),
        getOrganizationSettings(),
    ]);

    return (
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <DonorMemoClient
                funds={funds ?? []}
                fiscalYearStart={Number(orgSettings?.fiscal_year_start) || 1}
            />
        </div>
    );
}
