import type { Metadata } from "next";
import { getDocuments, getVendors, getCategories } from "@/app/actions/ledger";
import { VendorsClient } from "@/components/vendors/VendorsClient";
import type { PayeeListItem } from "@/utils/payee-types";
import type { CategoryRow, SplitRow } from "@/utils/row-types";

// The document fields this page reads. Money columns arrive from the database as numbers.
interface PayeeDoc {
    vendor_id: string | null;
    status: string | null;
    amount: number | null;
    document_date: string | null;
    created_at: string;
    category_id: string | null;
    splits: (SplitRow | null)[] | null;
}

// The payee fields this page reads
interface PayeeRow {
    id: string;
    name: string;
    payee_type: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    registration_number: string | null;
    notes: string | null;
    archived_at: string | null;
    is_system: boolean | null;
    default_category_id: string | null;
}

export const metadata: Metadata = { title: "Contacts" };

export const dynamic = "force-dynamic";

export default async function VendorsPage() {
    const documents = (await getDocuments()) as PayeeDoc[];
    const vendors = (await getVendors()) as PayeeRow[];
    const categories = (await getCategories()) as CategoryRow[];

    const categoriesMap = new Map(categories.map((c) => [c.id, c.name]));

    const vendorsList: PayeeListItem[] = vendors.map((v) => {
        const vendorDocs = documents.filter((d) => d.vendor_id === v.id);

        const totalPaid = vendorDocs.filter((d) => d.status === 'paid').reduce((sum: number, d) => sum + (d.amount || 0), 0);
        const totalUnpaid = vendorDocs.filter((d) => d.status === 'needs_review' || d.status === 'awaiting_payment').reduce((sum: number, d) => sum + (d.amount || 0), 0);

        let lastActivity = "—";
        if (vendorDocs.length > 0) {
            const sortedDocs = [...vendorDocs].sort((a, b) => new Date(b.document_date || b.created_at).getTime() - new Date(a.document_date || a.created_at).getTime());
            lastActivity = sortedDocs[0].document_date || "—";
        }

        // Calculate most frequent category from past documents for smart suggestion
        const categoryCounts = new Map<string, number>();
        for (const doc of vendorDocs) {
            if (doc.category_id) {
                categoryCounts.set(doc.category_id, (categoryCounts.get(doc.category_id) || 0) + 1);
            }
            if (doc.splits && Array.isArray(doc.splits)) {
                for (const split of doc.splits) {
                    if (split?.category_id) {
                        categoryCounts.set(split.category_id, (categoryCounts.get(split.category_id) || 0) + 1);
                    }
                }
            }
        }

        let suggestedCategoryId: string | null = null;
        let maxCount = 0;
        for (const [catId, count] of categoryCounts.entries()) {
            if (count > maxCount) {
                maxCount = count;
                suggestedCategoryId = catId;
            }
        }

        return {
            id: v.id,
            name: v.name,
            payee_type: v.payee_type || "vendor",
            email: v.email || null,
            phone: v.phone || null,
            address: v.address || null,
            registration_number: v.registration_number || null,
            notes: v.notes || null,
            archived_at: v.archived_at || null,
            is_system: !!v.is_system,
            default_category_id: v.default_category_id || null,
            suggestedCategoryId,
            suggestedCategoryName: suggestedCategoryId ? categoriesMap.get(suggestedCategoryId) || null : null,
            totalPaid,
            totalUnpaid,
            docCount: vendorDocs.length,
            lastActivity,
            topCategory: v.default_category_id ? categoriesMap.get(v.default_category_id) || "Configured" : null
        };
    }).sort((a, b) => b.totalPaid + b.totalUnpaid - (a.totalPaid + a.totalUnpaid));

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8 animate-in fade-in">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Contacts</h1>
                    <p className="text-gray-500 dark:text-slate-400 mt-2 text-lg">Everyone money comes from or goes to: suppliers, donors, members, grantors and others. Track spend and resolve duplicates.</p>
                </div>
            </div>

            <VendorsClient vendorsList={vendorsList} categories={categories} />
        </div>
    );
}
