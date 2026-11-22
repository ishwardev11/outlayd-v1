import { redirect } from "next/navigation";
import { getOpeningPosition } from "@/app/actions/balance";
import { OpeningPositionWizard } from "@/components/settings/OpeningPositionWizard";

export const dynamic = "force-dynamic";

// Opening Position wizard (spec 5.6)
export default async function OpeningPositionPage() {
    const data = await getOpeningPosition();
    if (!data) redirect("/onboarding");
    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
            <OpeningPositionWizard key={`${data.startDate}-${data.completedAt}-${data.netAssets}`} data={data} />
        </div>
    );
}
