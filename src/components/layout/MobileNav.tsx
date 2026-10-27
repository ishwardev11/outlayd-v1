"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    Menu,
    X,
    LayoutDashboard,
    FileText,
    Users,
    BarChart3
} from "lucide-react";
import { Sidebar } from "./Sidebar";

export function MobileNav() {
    const [isOpen, setIsOpen] = useState(false);
    const pathname = usePathname();

    // Close drawer on path change
    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    // Prevent body scroll when drawer is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    const bottomTabs = [
        { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/ledger", label: "Ledger", icon: FileText },
        { href: "/vendors", label: "Vendors", icon: Users },
        { href: "/reports", label: "Reports", icon: BarChart3 },
    ];

    return (
        <>
            {/* Top Bar for Mobile */}
            <header className="md:hidden sticky top-0 z-40 w-full bg-white/90 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80 px-4 h-14 flex items-center justify-between">
                <Link href="/dashboard" className="flex items-center gap-2">
                    <span className="font-extrabold text-xl bg-linear-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                        Outlayd
                    </span>
                </Link>
                <button
                    type="button"
                    onClick={() => setIsOpen(true)}
                    className="p-2 -mr-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 active:scale-95 transition-all"
                    aria-label="Open Navigation Menu"
                    id="mobile-nav-toggle-btn"
                >
                    <Menu className="w-5 h-5" />
                </button>
            </header>

            {/* Slide-over Mobile Drawer Overlay */}
            {isOpen && (
                <div className="fixed inset-0 z-50 md:hidden flex">
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
                        onClick={() => setIsOpen(false)}
                        aria-hidden="true"
                    />

                    {/* Drawer Content */}
                    <div className="relative w-72 max-w-[85vw] h-full bg-white dark:bg-slate-950 shadow-2xl flex flex-col z-10 animate-in slide-in-from-left duration-300">
                        {/* Drawer Header with Close Button */}
                        <div className="p-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80">
                            <span className="font-extrabold text-xl bg-linear-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                                Outlayd
                            </span>
                            <button
                                type="button"
                                onClick={() => setIsOpen(false)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors"
                                aria-label="Close Navigation Menu"
                                id="mobile-nav-close-btn"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Navigation inside drawer */}
                        <div className="flex-1 overflow-y-auto">
                            <Sidebar
                                className="w-full h-full border-r-0 bg-transparent dark:bg-transparent shadow-none"
                                onNavigate={() => setIsOpen(false)}
                                hideLogo={true}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Bottom Navigation Bar */}
            <nav
                className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800/80 h-16 px-3 flex items-center justify-around shadow-lg"
                aria-label="Mobile Bottom Navigation"
                id="mobile-bottom-nav"
            >
                {bottomTabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = pathname === tab.href;

                    return (
                        <Link
                            key={tab.href}
                            href={tab.href}
                            prefetch
                            className={`flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-150 active:scale-95 ${
                                isActive
                                    ? "text-indigo-600 dark:text-cyan-400 font-semibold"
                                    : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
                            }`}
                        >
                            <div className="relative">
                                <Icon className="w-5 h-5" />
                                {isActive && (
                                    <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-indigo-600 dark:bg-cyan-400 rounded-full" />
                                )}
                            </div>
                            <span className="text-[11px] mt-1 leading-none tracking-tight">
                                {tab.label}
                            </span>
                        </Link>
                    );
                })}
            </nav>
        </>
    );
}
