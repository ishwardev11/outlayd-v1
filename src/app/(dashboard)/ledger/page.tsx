import { getDocuments, getFunds, getCategories } from "@/app/actions/ledger";
import { LedgerClient } from "@/components/ledger/LedgerClient";
import { UploadButton } from "@/components/ledger/UploadButton";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
    const [documents, funds, categories] = await Promise.all([
        getDocuments(),
        getFunds(),
        getCategories()
    ]);

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Ledger</h1>
                    <p className="text-gray-500 mt-2 dark:text-slate-400">Manage, review, and approve documents.</p>
                </div>
                <UploadButton />
            </div>

            <LedgerClient
                documents={documents || []}
                funds={funds || []}
                categories={categories || []}
            />
        </div>
    );
}
