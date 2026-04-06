"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import {
    LayoutDashboard,
    FileText,
    Users,
    BarChart3,
    Settings,
    Gavel,
    LogOut,
    HelpCircle,
    X,
    ChevronDown,
    Lock,
} from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { createClient } from "@/utils/supabase/client";
import { UpgradePaywallModal } from "@/components/ui/UpgradePaywallModal";

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [openAccordion, setOpenAccordion] = useState<number | null>(null);
    const [isPro, setIsPro] = useState<boolean | null>(null);
    const [showPaywall, setShowPaywall] = useState(false);

    // Helper to get active organization ID, including dev override
    const getActiveOrgId = (user: any) => {
        if (typeof document === "undefined") return user?.user_metadata?.organization_id;

        const cookies = document.cookie.split("; ");
        const devOrgCookie = cookies.find((row) => row.trim().startsWith("dev_org_id="));
        const devOrgId = devOrgCookie ? devOrgCookie.split("=")[1] : null;

        if (devOrgId) {
            if (devOrgId === "11111111-1111-1111-1111-111111111111")
                return "00000000-0000-0000-0000-000000000000";
            return devOrgId;
        }

        return user?.user_metadata?.organization_id;
    };

    useEffect(() => {
        // Fast optimistic path
        if (typeof window !== "undefined" && sessionStorage.getItem("optimistic_is_pro") === "true") {
            setIsPro(true);
        }

        const handleOptimisticUpdate = () => setIsPro(true);
        if (typeof window !== "undefined") {
            window.addEventListener("pro-upgrade-success", handleOptimisticUpdate);
        }

        const fetchSubscriptionStatus = async () => {
            try {
                const supabase = createClient();
                const {
                    data: { user },
                } = await supabase.auth.getUser();
                if (!user) return;

                const orgId = getActiveOrgId(user);
                if (!orgId) {
                    setIsPro(false);
                    return;
                }

                const { data: org, error } = await supabase
                    .from("organizations")
                    .select("subscription_status")
                    .eq("id", orgId)
                    .single();

                if (error) throw error;
                setIsPro(org?.subscription_status === "pro");
                
                if (org?.subscription_status === "pro" && typeof window !== "undefined") {
                    sessionStorage.setItem("optimistic_is_pro", "true");
                }
            } catch (err) {
                console.error("Failed to fetch subscription status:", err);
                setIsPro(false);
            }
        };

        fetchSubscriptionStatus();

        return () => {
            if (typeof window !== "undefined") {
                window.removeEventListener("pro-upgrade-success", handleOptimisticUpdate);
            }
        };
    }, [pathname]); // Re-fetch on navigation to ensure status is fresh after upgrade

    const handleProcurementClick = () => {
        if (isPro === null) return; // Still loading
        if (isPro) {
            router.push("/procurement");
        } else {
            setShowPaywall(true);
        }
    };

    const faqs = [
        { q: "How do I change categories?", a: "Go to Settings > Categories to add, edit, or delete the industry categories available in your ledger." },
        { q: "How do I invite team members?", a: "Navigate to Settings > Organization to invite new members via email and assign them roles." },
        { q: "What do the AI confidence scores mean?", a: "The confidence score indicates how certain the AI is about the extracted data. Scores below 90% are flagged as 'Needs Review'." }
    ];

    return (
        <div className="w-64 bg-white dark:bg-slate-900 border-r border-gray-200 dark:border-slate-800 h-screen p-4 flex flex-col text-gray-900 dark:text-gray-100">
            <div className="mb-8 tracking-tight flex items-baseline">
                <span className="font-extrabold text-slate-900 dark:text-white text-2xl">Spend</span>
                <span className="font-light text-cyan-600 dark:text-cyan-400 text-2xl">Sync</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400 text-xl ml-1.5">AI</span>
            </div>

            <nav className="flex-1 space-y-2">
                <Link href="/dashboard" prefetch className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${pathname === '/dashboard' ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-cyan-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'}`}>
                    <LayoutDashboard size={20} />
                    <span>Dashboard</span>
                </Link>
                <Link href="/ledger" prefetch className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${pathname === '/ledger' ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-cyan-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'}`}>
                    <FileText size={20} />
                    <span>Ledger</span>
                </Link>
                <Link href="/vendors" prefetch className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${pathname === '/vendors' ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-cyan-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'}`}>
                    <Users size={20} />
                    <span>Vendors</span>
                </Link>
                <Link href="/reports" prefetch className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${pathname === '/reports' ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-cyan-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'}`}>
                    <BarChart3 size={20} />
                    <span>Reports</span>
                </Link>

                {/* Procurement — gated for free users. Uses a button (not Link) to guarantee no HTML navigation occurs */}
                <button
                    type="button"
                    onClick={handleProcurementClick}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors w-full text-left group ${pathname === '/procurement' ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-cyan-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'}`}
                >
                    <Gavel size={20} />
                    <span className="flex-1">Procurement</span>
                    {/* Lock + Pro badge */}
                    {isPro === false && (
                        <span className="ml-auto bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide flex items-center gap-1 shrink-0 animate-in fade-in duration-300 transition-transform group-hover:scale-110 group-hover:-rotate-3">
                            <Lock size={9} strokeWidth={2.5} />
                            Pro
                        </span>
                    )}
                </button>
            </nav>

            <div className="mt-auto flex flex-col gap-2">
                <button
                    onClick={() => setIsHelpOpen(true)}
                    className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white w-full text-left"
                >
                    <HelpCircle size={20} />
                    <span>Help &amp; Support</span>
                </button>
                <Link href="/settings" className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${pathname === '/settings' ? 'bg-indigo-50 dark:bg-slate-800 text-indigo-700 dark:text-cyan-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'}`}>
                    <Settings size={20} />
                    <span>Settings</span>
                </Link>
                <form action={signOutAction} className="w-full">
                    <button type="submit" className="flex items-center gap-3 px-3 py-2 rounded-md transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white w-full text-left">
                        <LogOut size={20} />
                        <span>Sign Out</span>
                    </button>
                </form>
            </div>

            {/* Help & Support Drawer */}
            {isHelpOpen && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-80 h-full bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 shadow-xl flex flex-col animate-in slide-in-from-right-full duration-300">
                        <div className="p-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white">
                            <h2 className="font-semibold flex items-center gap-2">
                                <HelpCircle size={18} className="text-indigo-500" />
                                Help &amp; Support
                            </h2>
                            <button type="button" onClick={() => setIsHelpOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-left">
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Common questions to help you get started with SpendSync.</p>

                            {faqs.map((faq, idx) => (
                                <div key={idx} className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => setOpenAccordion(openAccordion === idx ? null : idx)}
                                        className="w-full text-left px-4 py-3 bg-slate-50 dark:bg-slate-900 flex items-center justify-between"
                                    >
                                        <span className="text-sm font-medium text-slate-900 dark:text-white pr-2">{faq.q}</span>
                                        <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform duration-300 ${openAccordion === idx ? 'rotate-180' : ''}`} />
                                    </button>
                                    <div className={`grid transition-all duration-300 ease-in-out ${openAccordion === idx ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                                        <div className="overflow-hidden">
                                            <div className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
                                                {faq.a}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
                            <button type="button" className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md transition-colors">
                                Contact Support
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Procurement Paywall Modal */}
            <UpgradePaywallModal
                isOpen={showPaywall}
                onClose={() => setShowPaywall(false)}
                context="procurement"
            />
        </div>
    );
}
