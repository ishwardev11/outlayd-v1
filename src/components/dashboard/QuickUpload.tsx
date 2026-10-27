"use client";

import { useState, useRef, useEffect } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { processUpload } from "@/app/actions/ledger";
import { UpgradePaywallModal } from "@/components/ui/UpgradePaywallModal";

const UploadingStatus = () => {
    const [statusIndex, setStatusIndex] = useState(0);
    const statuses = [
        "Uploading securely...",
        "Scanning document...",
        "Extracting vendor & totals...",
        "Finalizing ledger..."
    ];

    useEffect(() => {
        const interval = setInterval(() => {
            setStatusIndex(prev => Math.min(prev + 1, statuses.length - 1));
        }, 1500);
        return () => clearInterval(interval);
    }, []);

    return (
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300 animate-pulse">
            {statuses[statusIndex]}
        </p>
    );
};

export function QuickUpload() {
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [showPaywall, setShowPaywall] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();

    useEffect(() => {
        const upgrade = searchParams.get("upgrade");
        const sessionId = searchParams.get("session_id");

        if (upgrade === "success") {
            setShowPaywall(false);
            
            // OPTIMISTIC UI UPDATE
            if (typeof window !== "undefined") {
                sessionStorage.setItem("optimistic_is_pro", "true");
                window.dispatchEvent(new Event("pro-upgrade-success"));
            }

            console.log("Upgrade success detected, verifying session...");
            
            if (sessionId) {
                // Verify session from client side to bypass webhook delays / missing local webhooks
                import("@/app/actions/settings").then((m) => {
                    m.verifyCheckoutSession(sessionId).then((res) => {
                        if (res.success) {
                            console.log("Session verified and organization upgraded successfully!");
                        } else {
                            console.warn("Session verification failed or already processed.");
                        }
                        router.refresh();
                    });
                });
            } else {
                router.refresh();
            }

            // Cleanly remove the parameter from the URL bar
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, [searchParams, router]);

    const handleUpload = async (file: File) => {
        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const response = await processUpload(formData);

            // Handle circuit breaker
            if (response && response.status === "error" && response.code === "LIMIT_REACHED") {
                setShowPaywall(true);
                return;
            }
        } catch (error: any) {
            console.error("Upload failed:", error);
            alert(`Failed to upload document: ${error.message || 'Unknown error'}`);
        } finally {
            setIsUploading(false);
        }
    };

    const onDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const onDragLeave = () => {
        setIsDragging(false);
    };

    const onDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleUpload(e.dataTransfer.files[0]);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleUpload(e.target.files[0]);
        }
        // Reset input so the same file could be selected again if needed
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    return (
        <Card className="h-full py-4 gap-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm flex flex-col relative overflow-hidden">
            <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*,application/pdf"
                onChange={handleFileChange}
            />
            {isUploading && (
                <div className="absolute inset-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center animate-in fade-in duration-200">
                    <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-2" />
                    <UploadingStatus />
                </div>
            )}
            <CardHeader className="py-0 px-5 shrink-0">
                <CardTitle className="text-sm font-semibold tracking-tight uppercase text-slate-500 dark:text-slate-400">Quick Upload</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 pb-2 pt-0 px-5 flex flex-col">
                <div
                    className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-4 text-center transition-colors cursor-pointer 
                        ${isDragging ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-400/50 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                    onDragOver={onDragOver}
                    onDragLeave={onDragLeave}
                    onDrop={onDrop}
                    onClick={() => fileInputRef.current?.click()}
                >
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center mb-2 transition-colors ${isDragging ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400' : 'bg-slate-100 text-slate-400 dark:bg-slate-800/80 dark:text-slate-500'}`}>
                        <UploadCloud className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Drop receipt here</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">or click to browse</p>
                </div>
            </CardContent>

            <UpgradePaywallModal
                isOpen={showPaywall}
                onClose={() => setShowPaywall(false)}
            />
        </Card>
    );
}
