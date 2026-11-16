import { getFunds, getCategories } from "@/app/actions/ledger";
import { getLedgerPage, getLedgerStatusCounts, getExtractingCount } from "@/app/actions/aggregates";
import { LedgerClient } from "@/components/ledger/LedgerClient";
import { UploadButton } from "@/components/ledger/UploadButton";
import { ExtractionPoller } from "@/components/ExtractionPoller";
import { parseLedgerFilters } from "@/utils/aggregate-types";

export const dynamic = "force-dynamic";
// Uploads started from this page extract their data in the background (see processUpload), and that
// work counts towards this limit. 60s suits most receipts and invoices; raise it if your hosting plan
// allows longer functions and large PDFs still time out.
export const maxDuration = 60;

export default async function LedgerPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    // Filters, search and the page number live in the URL; the database returns just one page.
    const filters = parseLedgerFilters(await searchParams);

    const [pageData, counts, funds, categories, extractingCount] = await Promise.all([
        getLedgerPage(filters),
        getLedgerStatusCounts(),
        getFunds(),
        getCategories(),
        getExtractingCount()
    ]);

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            <ExtractionPoller active={extractingCount > 0} />
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Ledger</h1>
                    <p className="text-gray-500 mt-2 dark:text-slate-400">Manage, review, and approve documents.</p>
                </div>
                <UploadButton />
            </div>

            <LedgerClient
                documents={pageData.documents}
                total={pageData.total}
                page={pageData.page}
                pageSize={pageData.pageSize}
                counts={counts}
                filters={filters}
                funds={funds || []}
                categories={categories || []}
            />
        </div>
    );
}
