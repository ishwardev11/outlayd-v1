import { getAssetsPage } from "@/app/actions/balance";
import { getEntryOptions } from "@/app/actions/transactions";
import { AssetsClient } from "@/components/assets/AssetsClient";

export const dynamic = "force-dynamic";

// Assets & Liabilities (spec 3.6). Everyone in the organisation can read them; adding and recording
// needs Admin or Editor on a paid plan, checked again in the database.
export default async function AssetsPage() {
    const [data, options] = await Promise.all([getAssetsPage(), getEntryOptions()]);
    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            <AssetsClient data={data} options={options} />
        </div>
    );
}
