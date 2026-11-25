"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownLeft, Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { processUpload } from "@/app/actions/ledger";
import { UpgradePaywallModal } from "@/components/ui/UpgradePaywallModal";
import { useRole } from "@/components/RoleProvider";
import { errorMessage } from "@/utils/row-types";

// The dashboard's upload (dashboard redesign): an "Upload receipt" button in the page header, and the
// whole dashboard accepts a dropped photo or PDF. Same server action and rules as before
// (processUpload: Admin or Editor only, the plan's upload limit, 10 MB, images and PDFs). Viewers get
// neither the button nor the drop zone.

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

interface UploadContext {
    canUpload: boolean;
    uploading: boolean;
    pick: () => void;
}
const Ctx = createContext<UploadContext>({ canUpload: false, uploading: false, pick: () => {} });

const STATUSES = ["Uploading securely...", "Scanning document...", "Extracting payee & totals...", "Finishing up..."];

function UploadingStatus() {
    const [i, setI] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setI((n) => Math.min(n + 1, STATUSES.length - 1)), 1500);
        return () => clearInterval(t);
    }, []);
    return <span>{STATUSES[i]}</span>;
}

// Back from Stripe checkout (?upgrade=success&session_id=...): verify the session and refresh. This
// used to live in the Quick upload card.
function useUpgradeReturn() {
    const router = useRouter();
    const searchParams = useSearchParams();
    useEffect(() => {
        if (searchParams.get("upgrade") !== "success") return;
        const sessionId = searchParams.get("session_id");
        sessionStorage.setItem("optimistic_is_pro", "true");
        window.dispatchEvent(new Event("pro-upgrade-success"));
        if (sessionId) {
            import("@/app/actions/settings").then((m) => m.verifyCheckoutSession(sessionId).then((res) => {
                if (!res.success) console.warn("Session verification failed or already processed.");
                router.refresh();
            }));
        } else {
            router.refresh();
        }
        window.history.replaceState({}, document.title, window.location.pathname);
    }, [searchParams, router]);
}

export function DashboardDropZone({ children }: { children: ReactNode }) {
    const { isAdmin, isEditor } = useRole();
    const canUpload = isAdmin || isEditor;
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [showPaywall, setShowPaywall] = useState(false);
    const depth = useRef(0);
    useUpgradeReturn();

    const upload = useCallback(async (file: File) => {
        if (!canUpload || uploading) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await processUpload(formData);
            if (res && res.status === "error" && res.code === "LIMIT_REACHED") {
                setShowPaywall(true);
                return;
            }
            router.refresh();
        } catch (error) {
            console.error("Upload failed:", error);
            alert(`Failed to upload document: ${errorMessage(error) || "Unknown error"}`);
        } finally {
            setUploading(false);
        }
    }, [canUpload, uploading, router]);

    const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

    return (
        <Ctx.Provider value={{ canUpload, uploading, pick: () => inputRef.current?.click() }}>
            <div
                className="relative"
                onDragEnter={(e) => { if (!canUpload || !hasFiles(e)) return; e.preventDefault(); depth.current++; setDragging(true); }}
                onDragOver={(e) => { if (!canUpload || !hasFiles(e)) return; e.preventDefault(); }}
                onDragLeave={() => { if (!canUpload) return; depth.current = Math.max(0, depth.current - 1); if (depth.current === 0) setDragging(false); }}
                onDrop={(e) => {
                    if (!canUpload) return;
                    e.preventDefault();
                    depth.current = 0;
                    setDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) upload(file);
                }}
            >
                {canUpload && (
                    <input ref={inputRef} type="file" className="hidden" accept={ACCEPT} data-testid="upload-input"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
                )}
                {children}
                {(dragging || uploading) && (
                    <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-brand-50/80 dark:bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-150" data-testid="drop-overlay">
                        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-brand-400 bg-white dark:bg-slate-800 px-10 py-8 text-center shadow-lg">
                            {uploading ? <Loader2 className="h-8 w-8 animate-spin text-brand-500" /> : <UploadCloud className="h-8 w-8 text-brand-500" />}
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                {uploading ? <UploadingStatus /> : "Drop your receipt or bill to upload it"}
                            </p>
                            {!uploading && <p className="text-xs text-slate-500 dark:text-slate-400">Photo or PDF, up to 10 MB</p>}
                        </div>
                    </div>
                )}
                <UpgradePaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} />
            </div>
        </Ctx.Provider>
    );
}

/** Lets other parts of the dashboard (Getting started, empty states) open the same file picker. */
export const useDashboardUpload = () => useContext(Ctx);

/**
 * Upload receipt and Record money in, used in the header and in the empty Recent activity card. Nothing
 * for Viewers; "Record money in" only where income can be recorded (paid plans).
 */
export function DashboardActions({ canRecordIncome, place = "header" }: { canRecordIncome: boolean; place?: "header" | "empty" }) {
    const { canUpload, uploading, pick } = useContext(Ctx);
    if (!canUpload) return null;
    const suffix = place === "header" ? "" : `-${place}`;
    return (
        <div className={`flex flex-wrap gap-2 ${place === "empty" ? "justify-center" : ""}`}>
            {canRecordIncome && (
                <Button asChild variant="outline">
                    <Link href="/transactions?new=money_in" data-testid={`record-money-in${suffix}`}>
                        <ArrowDownLeft className="h-4 w-4 mr-1.5" />Record money in
                    </Link>
                </Button>
            )}
            <Button onClick={pick} disabled={uploading} className="bg-brand-600 hover:bg-brand-700 text-white" data-testid={`upload-receipt${suffix}`}>
                {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <UploadCloud className="h-4 w-4 mr-1.5" />}Upload receipt
            </Button>
        </div>
    );
}
