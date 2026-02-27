import { KanbanFilters } from "@/components/ledger/KanbanFilters";

export default function LedgerPage() {
    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Ledger</h1>
                <p className="text-muted-foreground mt-2">Manage, review, and approve documents.</p>
            </div>

            <KanbanFilters />

            {/* Ledger Table will go here */}
        </div>
    );
}
