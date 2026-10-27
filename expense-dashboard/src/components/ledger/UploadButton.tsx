"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { processUpload } from "@/app/actions/ledger";
import { UpgradePaywallModal } from "@/components/ui/UpgradePaywallModal";
import { useRole } from "@/components/RoleProvider";

export function UploadButton() {
    const [isUploading, setIsUploading] = useState(false);
    const [showPaywall, setShowPaywall] = useState(false);
    const { isViewer } = useRole();
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);

            // Call the robust server action
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
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
    };

    return (
        <>
            <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileChange}
            />
            
            <Button
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isViewer}
                title={isViewer ? "Viewers cannot upload documents" : ""}
            >
                {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {isUploading ? "Processing..." : "Upload Document"}
            </Button>
            <UpgradePaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} />
        </>
    );
}
