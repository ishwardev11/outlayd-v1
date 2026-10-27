import { getDocuments, getVendors, getCategories } from "@/app/actions/ledger";
import { VendorsClient } from "@/components/vendors/VendorsClient";

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
    const documents = await getDocuments();
    const vendors = await getVendors();
    const categories = await getCategories();

    const categoriesMap = new Map(categories.map((c: any) => [c.id, c.name]));

    const vendorsList = vendors.map((v: any) => {
        const vendorDocs = documents.filter((d: any) => d.vendor_id === v.id);

        const totalPaid = vendorDocs.filter((d: any) => d.status === 'paid').reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
        const totalUnpaid = vendorDocs.filter((d: any) => d.status === 'needs_review' || d.status === 'awaiting_payment').reduce((sum: number, d: any) => sum + (d.amount || 0), 0);

        let lastActivity = "—";
        if (vendorDocs.length > 0) {
            const sortedDocs = [...vendorDocs].sort((a, b) => new Date(b.document_date || b.created_at).getTime() - new Date(a.document_date || a.created_at).getTime());
            lastActivity = sortedDocs[0].document_date || "—";
        }

        return {
            id: v.id,
            name: v.name,
            totalPaid,
            totalUnpaid,
            docCount: vendorDocs.length,
            lastActivity,
            topCategory: v.default_category_id ? categoriesMap.get(v.default_category_id) || "Configured" : null
        };
    }).sort((a: any, b: any) => b.totalPaid + b.totalUnpaid - (a.totalPaid + a.totalUnpaid));

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Vendors Directory</h1>
                    <p className="text-gray-500 dark:text-slate-400 mt-2 text-lg">Manage your business partnerships, track spend, and resolve duplicate entities.</p>
                </div>
            </div>

            <VendorsClient vendorsList={vendorsList} />
        </div>
    );
}
