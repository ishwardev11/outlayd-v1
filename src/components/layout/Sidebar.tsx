"use client";


import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
    LayoutDashboard,
    FileText,
    Inbox,
    Users,
    BarChart3,
    Settings,
    HelpCircle,
    X,
    ChevronDown,
    Lock,
    Landmark,
    ReceiptText,
    type LucideIcon,
} from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import type { User } from "@supabase/supabase-js";
import { WorkspaceSwitcher } from "@/components/layout/WorkspaceSwitcher";
import { ProfileMenu } from "@/components/layout/ProfileMenu";
import { NAV_ITEMS, activeNav, showLockBadge, type NavId, type NavItem } from "@/utils/nav";
import { HELP_FAQ } from "@/utils/help-faq";

const ICONS: Record<NavId, LucideIcon> = {
    dashboard: LayoutDashboard,
    inbox: Inbox,
    transactions: FileText,
    invoices: ReceiptText,
    contacts: Users,
    reports: BarChart3,
    bank: Landmark,
    settings: Settings,
};

interface SidebarProps {
    className?: string;
    onNavigate?: () => void;
    hideLogo?: boolean;
}

export function Sidebar({ className = "", onNavigate, hideLogo = false }: SidebarProps = {}) {
    const pathname = usePathname();
    const [isHelpOpen, setIsHelpOpen] = useState(false);
    const [openAccordion, setOpenAccordion] = useState<number | null>(null);
    const [isPro, setIsPro] = useState<boolean | null>(null);
    const [hasBeenPaid, setHasBeenPaid] = useState(false);

    // Helper to get the active organization ID
    const getActiveOrgId = (user: User | null) => {
        if (typeof document === "undefined") return user?.user_metadata?.organization_id;

        const cookies = document.cookie.split("; ");
        const activeOrgCookie = cookies.find((row) => row.trim().startsWith("active_org_id="));
        const activeOrgId = activeOrgCookie ? activeOrgCookie.split("=")[1] : null;
        if (activeOrgId) return activeOrgId;

        return user?.user_metadata?.organization_id;
    };

    useEffect(() => {
        // Fast optimistic path
        if (typeof window !== "undefined" && sessionStorage.getItem("optimistic_is_pro") === "true") {
            // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage only exists in the browser; reading it during render would not match the server HTML
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

                // The database's plan answer (same rule as every server check and row-level security)
                const { data: planRows, error } = await supabase.rpc("org_plan_state", { p_org: orgId });

                if (error) throw error;
                const planRow = (Array.isArray(planRows) ? planRows[0] : planRows) as { paid?: boolean; has_been_paid?: boolean } | null;
                const isOrgPro = planRow?.paid === true;
                setIsPro(isOrgPro);
                setHasBeenPaid(planRow?.has_been_paid === true);
                
                if (isOrgPro && typeof window !== "undefined") {
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

    const active = activeNav(pathname);
    // One link, one style: the active item is highlighted, and a page that is only a locked screen on
    // the free plan carries the same lock badge as every other locked item
    const navLink = (item: NavItem) => {
        const Icon = ICONS[item.id];
        return (
            <Link key={item.id} id={`sidebar-link-${item.id}`} href={item.href} prefetch={item.id !== "settings"} onClick={() => onNavigate?.()}
                aria-current={active === item.id ? "page" : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 active:scale-[0.97] cursor-pointer ${active === item.id ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-cyan-400 font-semibold' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white'}`}>
                <Icon size={20} />
                <span className="flex-1">{item.label}</span>
                {showLockBadge(item, { paid: isPro, hasBeenPaid }) && (
                    <span className="ml-auto bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide flex items-center gap-1 shrink-0" title="Part of the Growth and Nonprofit plans" data-testid="nav-lock">
                        <Lock size={9} strokeWidth={2.5} />
                        Pro
                    </span>
                )}
            </Link>
        );
    };

    return (
        <div className={`w-52 bg-white/85 dark:bg-slate-950/70 border-r border-slate-200 dark:border-slate-800/80 h-screen p-4 flex flex-col text-slate-900 dark:text-slate-100 backdrop-blur-md ${className}`}>
            {!hideLogo && (
                <div className="mb-8 tracking-tight flex items-baseline">
                    <span className="font-extrabold text-2xl bg-linear-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">Outlayd</span>
                </div>
            )}

            <WorkspaceSwitcher />
            {/* The navigation (simplification step 8): one list in src/utils/nav.ts, shown the same way in
                the phone menu. Settings sits at the bottom, above the profile menu. */}
            <nav className="flex-1 space-y-2">
                {NAV_ITEMS.filter((item) => item.id !== "settings").map(navLink)}
            </nav>

            <div className="mt-auto flex flex-col gap-2">
                {navLink(NAV_ITEMS.find((item) => item.id === "settings")!)}
                {/* The signed-in person's own things: account, theme, text size, help, sign out (step 6) */}
                <ProfileMenu onHelp={() => setIsHelpOpen(true)} onNavigate={onNavigate} />
            </div>

            {/* Help & Support Drawer */}
            {isHelpOpen && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-80 h-full bg-white/90 dark:bg-slate-950/85 border-l border-slate-200 dark:border-slate-800/80 shadow-2xl flex flex-col animate-in slide-in-from-right-full duration-300 backdrop-blur-md">
                        <div className="p-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 text-slate-900 dark:text-white">
                            <h2 className="font-semibold flex items-center gap-2">
                                <HelpCircle size={18} className="text-indigo-500" />
                                Help &amp; Support
                            </h2>
                            <button id="close-help-btn" type="button" onClick={() => setIsHelpOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors cursor-pointer">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-left" data-lenis-prevent="true">
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Common questions to help you get started with Outlayd.</p>

                            {HELP_FAQ.map((faq, idx) => (
                                <div key={idx} className="border border-slate-250 dark:border-slate-800/80 rounded-xl overflow-hidden shadow-sm">
                                    <button
                                        type="button"
                                        onClick={() => setOpenAccordion(openAccordion === idx ? null : idx)}
                                        className="w-full text-left px-4 py-3 bg-slate-50/50 dark:bg-slate-900/60 flex items-center justify-between text-slate-900 dark:text-white hover:bg-slate-100/50 dark:hover:bg-slate-900/80 transition-colors cursor-pointer"
                                    >
                                        <span className="text-sm font-medium pr-2">{faq.q}</span>
                                        <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform duration-300 ${openAccordion === idx ? 'rotate-180' : ''}`} />
                                    </button>
                                    <div className={`grid transition-all duration-300 ease-in-out ${openAccordion === idx ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                                        <div className="overflow-hidden">
                                            <div className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400 bg-white/80 dark:bg-slate-950/40 border-t border-slate-200 dark:border-slate-800/80">
                                                {faq.a}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-4 border-t border-slate-200 dark:border-slate-800/80">
                            <Link
                                href="/contact"
                                onClick={() => setIsHelpOpen(false)}
                                id="contact-support-btn"
                                className="block w-full text-center py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-all duration-200 active:scale-[0.98] cursor-pointer"
                            >
                                Contact Support
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
