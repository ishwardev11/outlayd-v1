"use client";

import { useState } from "react";
import { KanbanFilters } from "@/components/ledger/KanbanFilters";
import { LedgerTable } from "@/components/ledger/LedgerTable";
import { ProcessingDrawer } from "@/components/ledger/ProcessingDrawer";

export default function LedgerPage() {
    const [selectedDocId, setSelectedDocId] = useState<string | undefined>();

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Ledger</h1>
                <p className="text-muted-foreground mt-2">Manage, review, and approve documents.</p>
            </div>

            <KanbanFilters />

            <LedgerTable onRowClick={setSelectedDocId} />

            <ProcessingDrawer
                isOpen={!!selectedDocId}
                onClose={() => setSelectedDocId(undefined)}
                documentId={selectedDocId}
            />
        </div>
    );
}
