import { getDocuments } from "@/app/actions/ledger";
import { ReportsClient } from "@/components/reports/ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
    const documents = await getDocuments();

    return (
        <div className="p-3 sm:p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
            <ReportsClient documents={documents} />
        </div>
    );
}
