import { getInvoicesPage } from "@/app/actions/invoices";
import { getEntryOptions } from "@/app/actions/transactions";
import { InvoicesClient } from "@/components/invoices/InvoicesClient";
import { parseInvoiceFilters } from "@/utils/invoices";

export const dynamic = "force-dynamic";

// Invoices (spec 5.4). Everyone in the organisation can read them (free plans see the bills from their
// uploads); creating and changing invoices needs Admin or Editor on a paid plan, checked again in the database.
export default async function InvoicesPage({
    searchParams,
}: {
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const filters = parseInvoiceFilters(await searchParams);
    const [data, options] = await Promise.all([getInvoicesPage(filters), getEntryOptions()]);
    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
            <InvoicesClient data={data} filters={filters} options={options} />
        </div>
    );
}
