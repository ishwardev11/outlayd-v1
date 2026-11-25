import type { Metadata } from "next";
import { getFunds, getCategories } from "@/app/actions/ledger";
import { getExtractingCount } from "@/app/actions/aggregates";
import { getInboxCounts, getInboxPage } from "@/app/actions/inbox";
import { InboxClient } from "@/components/inbox/InboxClient";
import { UploadButton } from "@/components/ledger/UploadButton";
import { ExtractionPoller } from "@/components/ExtractionPoller";
import { parseInboxFilters } from "@/utils/inbox";

export const metadata: Metadata = { title: "Inbox" };

export const dynamic = "force-dynamic";
// Uploads started from this page extract their data in the background (see processUpload), and that
// work counts towards this limit. 60s suits most receipts and invoices.
export const maxDuration = 60;

// The Inbox (simplification step 4): uploads still being read, waiting for review or flagged as
// possible duplicates. Approved receipts move to Transactions, unpaid bills to Bills & Invoices.
export default async function InboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const filters = parseInboxFilters(await searchParams);
    // The extracting count also hands over uploads whose reading never finished
    const extractingCount = await getExtractingCount();
    const [pageData, counts, funds, categories] = await Promise.all([
        getInboxPage(filters),
        getInboxCounts(),
        getFunds(),
        getCategories(),
    ]);

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            <ExtractionPoller count={extractingCount} />
            <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Inbox</h1>
                    <p className="text-gray-500 mt-2 dark:text-slate-400">Uploads waiting to be checked. Approve them and they move to Transactions or Bills &amp; Invoices.</p>
                </div>
                <UploadButton />
            </div>
            <InboxClient
                documents={pageData.documents}
                total={pageData.total}
                page={pageData.page}
                pageSize={pageData.pageSize}
                counts={counts}
                filters={{ ...filters, page: pageData.page }}
                funds={funds || []}
                categories={categories || []}
            />
        </div>
    );
}
