"use client";

// The header and footer of the public pages, and smooth scrolling to a section of the landing page.
// Kept out of the landing page file because a Next.js page file may only export the page itself.
import Link from "next/link";
import { useState } from "react";
import { Menu, Receipt, X } from "lucide-react";

export function handleSmoothScroll(e: React.MouseEvent<HTMLAnchorElement>, targetId: string) {
    if (window.location.pathname !== '/') {
        return; // Let standard link navigation handle cross-page routing
    }
    
    e.preventDefault();
    const lenis = (window as Window & { lenis?: unknown }).lenis;
    if (lenis) {
        (lenis as { scrollTo: (target: string, options?: Record<string, unknown>) => void }).scrollTo(targetId, { offset: -80 });
    } else {
        const el = document.querySelector(targetId);
        if (el) {
            const y = el.getBoundingClientRect().top + window.scrollY - 80;
            window.scrollTo({ top: y, behavior: 'smooth' });
        }
    }
}

export function Navbar() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const handleMobileNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
        setMobileMenuOpen(false);
        handleSmoothScroll(e, targetId);
    };

    return (
        <header className="sticky top-2 sm:top-4 z-50 mx-auto max-w-6xl w-[calc(100%-1rem)] sm:w-[calc(100%-2rem)] border border-white/10 bg-slate-950/80 backdrop-blur-md rounded-2xl shadow-lg shadow-black/40">
            <div className="px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                        <Receipt className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
                    </div>
                    <span className="text-lg sm:text-xl font-bold tracking-tight">Outlayd</span>
                </Link>

                <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
                    <Link href="/#features" id="nav-link-services" onClick={(e) => handleSmoothScroll(e, '#features')} className="hover:text-white transition-colors">Features</Link>
                    <Link href="/#statements" id="nav-link-how-it-works" onClick={(e) => handleSmoothScroll(e, '#statements')} className="hover:text-white transition-colors">Statements</Link>
                    <Link href="/#pricing" id="nav-link-pricing" onClick={(e) => handleSmoothScroll(e, '#pricing')} className="hover:text-white transition-colors">Pricing</Link>
                    <Link href="/#faq" id="nav-link-faq" onClick={(e) => handleSmoothScroll(e, '#faq')} className="hover:text-white transition-colors">FAQ</Link>
                    <Link href="/nonprofits" id="nav-link-nonprofits" className="hover:text-white transition-colors">Nonprofits</Link>
                </nav>

                <div className="flex items-center gap-3">
                    <Link href="/login" id="nav-login-btn" className="text-sm font-medium text-slate-300 hover:text-white transition-colors hidden sm:block">
                        Log in
                    </Link>
                    <Link href="/signup" id="nav-signup-btn" className="bg-white text-slate-950 hover:bg-slate-200 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-colors cursor-pointer">
                        Get Started
                    </Link>

                    {/* Mobile Hamburger Button */}
                    <button
                        type="button"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="md:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                        aria-label="Toggle navigation menu"
                        id="marketing-mobile-menu-btn"
                    >
                        {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </button>
                </div>
            </div>

            {/* Mobile Dropdown Menu */}
            {mobileMenuOpen && (
                <div className="md:hidden border-t border-white/10 px-6 py-4 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
                    <Link href="/#features" onClick={(e) => handleMobileNavClick(e, '#features')} className="text-sm font-medium text-slate-300 hover:text-white py-1">Features</Link>
                    <Link href="/#statements" onClick={(e) => handleMobileNavClick(e, '#statements')} className="text-sm font-medium text-slate-300 hover:text-white py-1">Statements</Link>
                    <Link href="/#pricing" onClick={(e) => handleMobileNavClick(e, '#pricing')} className="text-sm font-medium text-slate-300 hover:text-white py-1">Pricing</Link>
                    <Link href="/#faq" onClick={(e) => handleMobileNavClick(e, '#faq')} className="text-sm font-medium text-slate-300 hover:text-white py-1">FAQ</Link>
                    <Link href="/nonprofits" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-slate-300 hover:text-white py-1">Nonprofits</Link>
                    <div className="pt-2 border-t border-white/10 flex flex-col gap-2">
                        <Link href="/login" onClick={() => setMobileMenuOpen(false)} className="text-sm font-medium text-slate-300 hover:text-white py-1">
                            Log in
                        </Link>
                    </div>
                </div>
            )}
        </header>
    );
}

export function Footer() {
    return (
        <footer className="border-t border-white/10 bg-slate-950 pt-16 pb-8 px-4">
            <div className="container mx-auto max-w-6xl">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8 mb-16">
                    <div className="md:col-span-1">
                        <Link href="/" className="flex items-center gap-2 mb-4 hover:opacity-80 transition-opacity">
                            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                                <Receipt className="h-5 w-5 text-white" />
                            </div>
                            <span className="text-xl font-bold tracking-tight">Outlayd</span>
                        </Link>
                        <p className="text-slate-400 text-sm max-w-xs mb-6">
                            Bookkeeping and financial statements for Malaysian nonprofits and small businesses.
                        </p>

                    </div>

                    <div className="grid grid-cols-2 gap-8 md:col-span-2 md:ml-auto md:w-3/4 lg:w-2/3">
                        <div>
                            <h4 className="font-semibold mb-4 text-slate-200">Quick Links</h4>
                            <ul className="space-y-3 text-sm text-slate-400">
                                <li><Link href="/#features" onClick={(e) => handleSmoothScroll(e, '#features')} className="hover:text-white transition-colors">Features</Link></li>
                                <li><Link href="/#pricing" onClick={(e) => handleSmoothScroll(e, '#pricing')} className="hover:text-white transition-colors">Pricing</Link></li>
                                <li><Link href="/nonprofits" className="hover:text-white transition-colors">For nonprofits</Link></li>
                                <li><Link href="/contact" className="hover:text-white transition-colors">Contact</Link></li>
                            </ul>
                        </div>

                        <div>
                            <h4 className="font-semibold mb-4 text-slate-200">Legal</h4>
                            <ul className="space-y-3 text-sm text-slate-400">
                                <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                                <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link></li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div className="pt-8 border-t border-white/10 text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-slate-500">
                    <p>© {new Date().getFullYear()} Outlayd. All rights reserved.</p>
                    <div className="flex gap-6">
                        <Link href="/privacy" className="hover:text-white">Privacy</Link>
                        <Link href="/terms" className="hover:text-white">Terms</Link>
                    </div>
                </div>
            </div>
        </footer>
    );
}
