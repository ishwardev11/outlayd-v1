import type { Metadata } from "next";
import { getCashBook, getEntryOptions } from "@/app/actions/transactions";
import { CashBook } from "@/components/ledger/CashBook";
import { parseCashBookFilters } from "@/utils/cash-book";

export const metadata: Metadata = { title: "Transactions" };

export const dynamic = "force-dynamic";

// Transactions (simplification step 4): the cash book, every movement of money in and out, read from
// transactions only. Paid uploads arrive here through the database mirror.
export default async function TransactionsPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const filters = parseCashBookFilters(await searchParams);
    const [book, options] = await Promise.all([getCashBook(filters), getEntryOptions()]);
    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Transactions</h1>
                <p className="text-gray-500 mt-2 dark:text-slate-400">Every payment in and out. Receipts you approve in the Inbox appear here automatically.</p>
            </div>
            <CashBook rows={book.rows} total={book.total} page={book.page} pageSize={book.pageSize} filters={{ ...filters, page: book.page }} options={options} />
        </div>
    );
}
