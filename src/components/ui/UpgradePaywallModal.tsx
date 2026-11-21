"use client";

import { useState } from "react";
import { useIsClient } from "@/lib/use-is-client";
import { createPortal } from "react-dom";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import type { User } from "@supabase/supabase-js";

type PaywallContext = "upload_limit" | "team_limit" | "donor_memo" | "accounting_export" | "bank_statements" | "financial_statements";

interface UpgradePaywallModalProps {
    isOpen: boolean;
    onClose: () => void;
    onUpgrade?: () => void;
    context?: PaywallContext;
}

const COPY: Record<PaywallContext, { heading: string; subtext: string }> = {
    upload_limit: {
        heading: "You've reached your free limit!",
        subtext:
            "Your organization has successfully processed 5 free documents. To keep automating your ledger and generating audit-ready reports, upgrade to our Growth Tier.",
    },
    donor_memo: {
        heading: "The Donor & Audit Memo is a Growth Feature",
        subtext:
            "Generate signed-off fund reports for donors, boards and auditors, with automatic checks for missing receipts and out-of-period spending. Upgrade to Outlayd Growth to unlock it.",
    },
    accounting_export: {
        heading: "The Accounting Export is a Growth Feature",
        subtext:
            "Download approved documents as a CSV your accountant or accounting software can import, with account codes per category. Upgrade to Outlayd Growth to unlock it.",
    },
    bank_statements: {
        heading: "Bank Statement Import is a Growth Feature",
        subtext:
            "Upload a bank statement PDF, match each payment to an approved invoice or receipt, and see which payments have no paperwork. Upgrade to Outlayd Growth to unlock it.",
    },
    financial_statements: {
        heading: "Financial Statements are a Growth Feature",
        subtext:
            "Produce your Statement of Income and Expenditure (or Profit and Loss) from your records, by fund and against last year, ready for your AGM and auditor. Upgrade to Outlayd Growth to unlock it.",
    },
    team_limit: {
        heading: "Collaborate with your whole team",
        subtext:
            "Your Free Tier limit is 1 user. Upgrade to the Growth Tier to unlock up to 5 member seats, real-time collaboration, and custom permissions.",
    },
};

export function UpgradePaywallModal({ isOpen, onClose, onUpgrade, context = "upload_limit" }: UpgradePaywallModalProps) {
    const [isLoading, setIsLoading] = useState(false);
    const mounted = useIsClient();

    if (!isOpen) return null;
    if (!mounted) return null;

    const { heading, subtext } = COPY[context];

    const handleCheckout = async () => {
        setIsLoading(true);
        try {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            const getActiveOrgId = (u: User | null) => {
                if (typeof document === "undefined") return u?.user_metadata?.organization_id;
                const cookies = document.cookie.split("; ");
                const activeOrgCookie = cookies.find((row) => row.trim().startsWith("active_org_id="));
                if (activeOrgCookie) return activeOrgCookie.split("=")[1];
                return u?.user_metadata?.organization_id;
            };
            const orgId = getActiveOrgId(user) || null;

            const response = await fetch('/api/create-checkout-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orgId }),
            });

            const data = await response.json();

            if (data.url) {
                window.location.href = data.url;
            } else {
                alert(data.error || "Failed to create checkout session");
            }
        } catch (error) {
            console.error("Checkout error:", error);
            alert("Something went wrong");
        } finally {
            setIsLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Modal Card */}
            <div className="relative w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-8 animate-in zoom-in-95 duration-200">
                {/* Icon */}
                <div className="mx-auto w-16 h-16 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/20 rounded-full flex items-center justify-center mb-6">
                    <LockKeyhole className="w-8 h-8" />
                </div>

                {/* Header & Subtext */}
                <div className="text-center mb-8">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                        {heading}
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
                        {subtext}
                    </p>
                </div>

                {/* Value Props */}
                <div className="space-y-4 mb-8">
                    <div className="flex items-start">
                        <CheckCircle2 className="w-5 h-5 text-indigo-500 shrink-0 mr-3 mt-0.5" />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Unlimited AI receipt &amp; invoice extraction
                        </span>
                    </div>
                    <div className="flex items-start">
                        <CheckCircle2 className="w-5 h-5 text-indigo-500 shrink-0 mr-3 mt-0.5" />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                            Advanced board-ready PDF reporting
                        </span>
                    </div>
                </div>

                {/* Call to Action */}
                <div className="flex flex-col gap-3">
                    <button
                        disabled={isLoading}
                        onClick={onUpgrade || handleCheckout}
                        className={`w-full font-semibold py-3 px-4 rounded-xl transition-colors shadow-sm disabled:opacity-75 disabled:cursor-not-allowed cursor-pointer ${
                            context === "team_limit"
                                ? "bg-amber-500 hover:bg-amber-600 text-slate-950 dark:bg-amber-500 dark:hover:bg-amber-600 dark:text-slate-950 shadow-amber-500/10"
                                : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/10"
                        }`}
                    >
                        {isLoading ? "Redirecting..." : "Upgrade to Growth — RM89/mo"}
                    </button>
                    <button
                        onClick={onClose}
                        className="w-full bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium py-3 px-4 rounded-xl transition-colors cursor-pointer"
                    >
                        Maybe later
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
