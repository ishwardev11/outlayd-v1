"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { getDocumentAuditLog } from "@/app/actions/audit";
import { type AuditEntry, auditActionLabel, auditActorLabel } from "@/utils/audit";

// Who approved, paid or changed this document, shown at the bottom of the Review drawer.
// Renders nothing for a document that has no approval history yet.
export function DocumentHistory({ documentId }: { documentId: string }) {
    const [entries, setEntries] = useState<AuditEntry[] | null>(null);

    // A different document clears the old history straight away, before its own history loads
    const [loadedFor, setLoadedFor] = useState(documentId);
    if (documentId !== loadedFor) {
        setLoadedFor(documentId);
        setEntries(null);
    }

    useEffect(() => {
        let cancelled = false;
        getDocumentAuditLog(documentId)
            .then((rows) => { if (!cancelled) setEntries(rows); })
            .catch(() => { if (!cancelled) setEntries([]); });
        return () => { cancelled = true; };
    }, [documentId]);

    if (!entries || entries.length === 0) return null;

    return (
        <div className="pt-4 border-t border-[#f1f5f9] dark:border-slate-800">
            <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
                <History className="w-3.5 h-3.5" />
                History
            </div>
            <ul className="space-y-1.5 text-[13px] text-slate-700 dark:text-slate-300">
                {entries.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium">{auditActionLabel(e.action)}</span>
                        <span>by {auditActorLabel(e)}</span>
                        <span className="text-slate-400 dark:text-slate-500">
                            {new Date(e.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
