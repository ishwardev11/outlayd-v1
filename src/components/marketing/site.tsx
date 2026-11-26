"use client";

// Header and footer of the public pages (landing, contact, privacy, terms), in the light look of the landing page.
// The landing page uses tone="brand": the header starts see-through over the indigo hero and turns white once you
// scroll. Every other page uses tone="light". The header is fixed, so pages leave 72px at the top for it.
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { handleSmoothScroll } from "@/components/marketing/SiteChrome";

const SECTIONS = [
    { id: "features", label: "Features" },
    { id: "statements", label: "Statements" },
    { id: "pricing", label: "Pricing" },
    { id: "faq", label: "Questions" },
] as const;

// A link to a section of the landing page that scrolls smoothly when already on it (server pages can use it).
export function ScrollLink({ to, className, id, children }: { to: string; className?: string; id?: string; children: React.ReactNode }) {
    return (
        <Link href={`/#${to}`} id={id} onClick={(e) => handleSmoothScroll(e, `#${to}`)} className={className}>
            {children}
        </Link>
    );
}

export function Logo({ size = 32, light = false }: { size?: number; light?: boolean }) {
    return (
        <span className={`mk-display inline-flex shrink-0 items-center gap-2.5 whitespace-nowrap text-lg ${light ? "text-white" : "text-neutral-900"}`}>
            <Image
                src="/outlayd-logo.webp"
                alt=""
                width={size}
                height={size}
                className={`rounded-lg ${light ? "ring-1 ring-white/30" : ""}`}
            />
            Outlayd
        </span>
    );
}

export function SiteHeader({ tone = "light" }: { tone?: "brand" | "light" }) {
    const [scrolled, setScrolled] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        if (tone !== "brand") return;
        const onScroll = () => setScrolled(window.scrollY > 24);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, [tone]);

    const solid = tone === "light" || scrolled || open;
    const link = solid
        ? "text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100"
        : "text-white/90 hover:text-white hover:bg-white/10";

    const go = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
        setOpen(false);
        handleSmoothScroll(e, `#${id}`);
    };

    return (
        <header
            className={`fixed inset-x-0 top-0 z-50 transition-colors duration-200 ${solid ? "border-b border-black/[0.06] bg-white/90 backdrop-blur-md" : "border-b border-transparent bg-transparent"}`}
        >
            <nav aria-label="Main" className="mx-auto flex h-[72px] max-w-[1200px] items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
                <Link href="/" aria-label="Outlayd home" className="rounded-lg">
                    <Logo light={!solid} />
                </Link>

                <div className="hidden items-center gap-1 lg:flex">
                    {SECTIONS.map((s) => (
                        <Link key={s.id} href={`/#${s.id}`} id={`nav-link-${s.id}`} onClick={(e) => go(e, s.id)} className={`inline-flex h-9 items-center rounded-[10px] px-3 text-sm transition-colors ${link}`}>
                            {s.label}
                        </Link>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <Link href="/login" id="nav-login-btn" className={`hidden h-9 items-center whitespace-nowrap rounded-[10px] px-3 text-sm transition-colors sm:inline-flex ${link}`}>
                        Log in
                    </Link>
                    <Link
                        href="/signup"
                        id="nav-signup-btn"
                        className={`inline-flex h-9 items-center whitespace-nowrap rounded-[14px] px-4 text-sm font-medium transition-[background-color,transform] active:scale-[0.97] ${solid ? "bg-brand-600 text-white hover:bg-brand-700" : "bg-white text-brand-700 hover:bg-brand-50"}`}
                    >
                        Start free
                    </Link>
                    <button
                        type="button"
                        onClick={() => setOpen(!open)}
                        aria-expanded={open}
                        aria-label={open ? "Close menu" : "Open menu"}
                        id="marketing-mobile-menu-btn"
                        className={`inline-flex h-11 w-11 items-center justify-center rounded-[14px] lg:hidden ${solid ? "text-neutral-700 hover:bg-neutral-100" : "text-white hover:bg-white/10"}`}
                    >
                        {open ? <X className="h-5 w-5" strokeWidth={1.75} /> : <Menu className="h-5 w-5" strokeWidth={1.75} />}
                    </button>
                </div>
            </nav>

            {open && (
                <div className="border-t border-black/[0.06] bg-white px-6 py-3 lg:hidden">
                    <div className="flex flex-col">
                        {SECTIONS.map((s) => (
                            <Link key={s.id} href={`/#${s.id}`} onClick={(e) => go(e, s.id)} className="flex h-11 items-center text-[15px] text-neutral-700 hover:text-neutral-900">
                                {s.label}
                            </Link>
                        ))}
                        <Link href="/login" onClick={() => setOpen(false)} className="mt-1 flex h-11 items-center border-t border-black/[0.06] text-[15px] text-neutral-700 hover:text-neutral-900">Log in</Link>
                    </div>
                </div>
            )}
        </header>
    );
}

export function SiteFooter() {
    const col = "grid content-start gap-1";
    const item = "py-1.5 text-neutral-600 underline-offset-4 transition-colors hover:text-brand-700 hover:underline";
    return (
        <footer className="overflow-hidden border-t border-black/[0.08] bg-white">
            <div className="mx-auto max-w-[1200px] px-6 pt-16">
                <div className="flex flex-wrap justify-between gap-12">
                    <div className="max-w-xs">
                        <Link href="/" aria-label="Outlayd home" className="rounded-lg"><Logo size={28} /></Link>
                        <p className="mt-4 text-sm leading-relaxed text-neutral-600">
                            Bookkeeping and financial statements for Malaysian small businesses and nonprofits.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-16 text-sm">
                        <div className={col}>
                            <h2 className="m-0 pb-2 text-[13px] font-medium text-neutral-900">Product</h2>
                            <Link href="/#features" onClick={(e) => handleSmoothScroll(e, "#features")} className={item}>Features</Link>
                            <Link href="/#statements" onClick={(e) => handleSmoothScroll(e, "#statements")} className={item}>Statements</Link>
                            <Link href="/#pricing" onClick={(e) => handleSmoothScroll(e, "#pricing")} className={item}>Pricing</Link>
                        </div>
                        <div className={col}>
                            <h2 className="m-0 pb-2 text-[13px] font-medium text-neutral-900">Company</h2>
                            <Link href="/nonprofits" className={item}>For nonprofits</Link>
                            <Link href="/contact" className={item}>Contact</Link>
                        </div>
                        <div className={col}>
                            <h2 className="m-0 pb-2 text-[13px] font-medium text-neutral-900">Legal</h2>
                            <Link href="/privacy" className={item}>Privacy Policy</Link>
                            <Link href="/terms" className={item}>Terms of Service</Link>
                        </div>
                    </div>
                </div>
                <div className="mt-12 border-t border-black/[0.06] pt-6 text-[13px] text-neutral-500">
                    © {new Date().getFullYear()} Outlayd. Made in Malaysia.
                </div>
                <div aria-hidden="true" className="mk-display mk-wordmark mt-2 whitespace-nowrap text-center text-[clamp(64px,14vw,190px)] leading-[0.8] tracking-[-0.06em] text-brand-50">
                    Outlayd
                </div>
            </div>
        </footer>
    );
}
