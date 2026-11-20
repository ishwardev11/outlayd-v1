import Link from "next/link";
import { getFunds, getCategories } from "@/app/actions/ledger";
import { getLedgerPage, getLedgerStatusCounts, getExtractingCount } from "@/app/actions/aggregates";
import { getCashBook, getEntryOptions } from "@/app/actions/transactions";
import { LedgerClient } from "@/components/ledger/LedgerClient";
import { CashBook } from "@/components/ledger/CashBook";
import { UploadButton } from "@/components/ledger/UploadButton";
import { ExtractionPoller } from "@/components/ExtractionPoller";
import { parseLedgerFilters } from "@/utils/aggregate-types";
import { parseCashBookFilters } from "@/utils/cash-book";

export const dynamic = "force-dynamic";
// Uploads started from this page extract their data in the background (see processUpload), and that
// work counts towards this limit. 60s suits most receipts and invoices; raise it if your hosting plan
// allows longer functions and large PDFs still time out.
export const maxDuration = 60;

// Two views of the same money (spec 5.2): "Documents" is the review inbox (receipts and bills), and
// "Cash book" is every movement of cash, read from transactions only.
function Tabs({ active }: { active: "documents" | "cash" }) {
    const tab = (key: "documents" | "cash", href: string, label: string) => (
        <Link href={href} aria-current={active === key ? "page" : undefined}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${active === key
                ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-cyan-400"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900"}`}>
            {label}
        </Link>
    );
    return (
        <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-800 pb-2" aria-label="Ledger views">
            {tab("documents", "/ledger", "Documents")}
            {tab("cash", "/ledger?view=cash", "Cash book")}
        </nav>
    );
}

export default async function LedgerPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const sp = await searchParams;
    const view = (Array.isArray(sp.view) ? sp.view[0] : sp.view) === "cash" ? "cash" : "documents";

    if (view === "cash") {
        const filters = parseCashBookFilters(sp);
        const [book, options] = await Promise.all([getCashBook(filters), getEntryOptions()]);
        return (
            <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Ledger</h1>
                    <p className="text-gray-500 mt-2 dark:text-slate-400">Every payment in and out. Paid documents appear here automatically.</p>
                </div>
                <Tabs active="cash" />
                <CashBook rows={book.rows} total={book.total} page={book.page} pageSize={book.pageSize} filters={{ ...filters, page: book.page }} options={options} />
            </div>
        );
    }

    // Filters, search and the page number live in the URL; the database returns just one page.
    const filters = parseLedgerFilters(sp);

    const [pageData, counts, funds, categories, extractingCount] = await Promise.all([
        getLedgerPage(filters),
        getLedgerStatusCounts(),
        getFunds(),
        getCategories(),
        getExtractingCount()
    ]);

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            <ExtractionPoller count={extractingCount} />
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Ledger</h1>
                    <p className="text-gray-500 mt-2 dark:text-slate-400">Manage, review, and approve documents.</p>
                </div>
                <UploadButton />
            </div>
            <Tabs active="documents" />

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
