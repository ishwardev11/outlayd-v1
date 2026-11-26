// The public landing page. Light look (Inter text, Geist headings, the logo's indigo), SME-first copy with
// nonprofit support alongside. Sample data throughout is a made-up company, Studio Rimba Sdn Bhd, and its
// figures agree with each other (the statement's funds match the funds example, net assets equal total funds).
import Link from "next/link";
import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { SiteFooter, SiteHeader, ScrollLink } from "@/components/marketing/site";
import { HeroDashboard } from "@/components/marketing/HeroDashboard";
import { FeatureTabs } from "@/components/marketing/FeatureTabs";
import { LandingFaq } from "@/components/marketing/LandingFaq";
import { PRICES } from "@/utils/plan-comparison";

const NONPROFIT_APPLY = "/contact?subject=Nonprofit%20Pricing%20Application";

const h2 = "mk-display m-0 text-[clamp(30px,3.6vw,40px)] leading-[1.1]";
const btnLight = "inline-flex h-[50px] items-center gap-2 rounded-[14px] bg-white px-6 text-[15px] font-medium text-brand-700 shadow-[0_1px_2px_rgba(20,12,90,0.24)] transition-[background-color,transform] hover:bg-brand-50 active:scale-[0.97]";
const btnGhostLight = "inline-flex h-[50px] items-center rounded-[14px] bg-white/5 px-6 text-[15px] font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.32)] transition-[background-color,transform] hover:bg-white/15 active:scale-[0.97]";
const btnOutline = "inline-flex h-11 items-center justify-center rounded-[14px] bg-white px-5 text-[15px] font-medium text-neutral-900 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)] transition-[background-color,transform] hover:bg-neutral-100 active:scale-[0.97]";

export default function LandingPage() {
    return (
        <div className="mk min-h-screen">
            <SiteHeader tone="brand" />
            <main>
                <Hero />
                <Numbers />
                <section id="features" className="mx-auto max-w-[1200px] scroll-mt-20 px-6 pb-[120px]">
                    <h2 className={`${h2} max-w-[18em]`}>Your whole year of books, in one place</h2>
                    <p className="mt-4 max-w-[36em] text-[17px] leading-normal text-neutral-600">
                        Everything an owner, bookkeeper or treasurer handles through the year, with checks that it all adds up.
                    </p>
                    <FeatureTabs />
                </section>
                <Statements />
                <Pricing />
                <section id="faq" className="mx-auto flex max-w-[1200px] scroll-mt-20 flex-wrap gap-12 px-6 pb-[120px]">
                    <div className="min-w-0 max-w-[360px] flex-[1_1_280px]">
                        <h2 className={h2}>Questions owners and treasurers ask</h2>
                        <p className="mt-4 text-[15px] text-neutral-600">
                            Something else? <Link href="/contact" className="text-brand-700 underline underline-offset-2 hover:text-brand-800">Send us a message</Link> and we reply within 24 to 48 hours.
                        </p>
                    </div>
                    <LandingFaq />
                </section>
                <Closing />
            </main>
            <SiteFooter />
        </div>
    );
}

function Hero() {
    return (
        <section id="top" className="mk-mesh relative overflow-hidden pt-[72px] text-white">
            <div className="mx-auto max-w-[880px] px-6 pt-24 text-center [@media(max-height:500px)]:pt-10">
                <ScrollLink to="pricing" className="mk-rise inline-flex h-9 max-w-full items-center gap-2 rounded-full bg-white/10 px-3 text-[13px] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.2)] hover:bg-white/15">
                    <span className="truncate">Early access is open for Malaysian small businesses and nonprofits</span>
                    <ChevronRight className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
                </ScrollLink>
                <h1 className="mk-display mk-rise mx-auto mt-6 max-w-[16em] text-[clamp(40px,6.4vw,72px)] leading-[1.04] tracking-[-0.035em] [animation-delay:60ms] [text-wrap:balance]">
                    From the first receipt to statements that are ready to sign
                </h1>
                <p className="mk-rise mx-auto mt-6 max-w-[36em] text-lg leading-relaxed text-white/85 [animation-delay:120ms]">
                    Snap a receipt and Outlayd reads it into your books. Send invoices, see who still owes you, and produce the Profit and
                    Loss your accountant, bank or auditor asks for, without a spreadsheet. Running a nonprofit? Funds and donor receipts are
                    built in too.
                </p>
                <div className="mk-rise mt-8 flex flex-wrap justify-center gap-3 [animation-delay:180ms]">
                    <Link href="/signup" id="hero-signup-btn" className={btnLight}>
                        Start free <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    </Link>
                    <ScrollLink to="statements" id="hero-statements-btn" className={btnGhostLight}>See a sample statement</ScrollLink>
                </div>
            </div>
            <div className="mx-auto mt-12 max-h-[600px] max-w-[1152px] overflow-hidden px-6 sm:max-h-none md:mt-[72px]">
                <HeroDashboard />
            </div>
            <div aria-hidden="true" className="relative -mt-40 h-40 bg-linear-to-b from-transparent to-[#fafafa]" />
        </section>
    );
}

const NUMBERS = [
    { value: "4", unit: null, label: "Financial statements from one set of records" },
    { value: "2", unit: " min", label: "To set up your company or organisation" },
    { value: "300", unit: null, label: "AI help a month on Growth, on top of unlimited receipt reading" },
    { value: String(PRICES.growth), unit: "RM", label: "A month for the Growth plan, with every statement" },
];

function Numbers() {
    return (
        <section aria-label="Outlayd in numbers" className="mx-auto max-w-[1200px] px-6 pb-24 pt-12">
            <dl className="m-0 grid grid-cols-1 border-y border-black/[0.08] sm:grid-cols-2 lg:grid-cols-4">
                {NUMBERS.map((n, i) => (
                    <div key={n.label} className={`flex flex-col-reverse px-6 py-8 ${i < NUMBERS.length - 1 ? "lg:border-r lg:border-black/[0.06]" : ""}`}>
                        <dt className="mt-3 text-[15px]">{n.label}</dt>
                        <dd className="mk-display m-0 text-[56px] leading-none tracking-[-0.035em]">
                            {n.unit === "RM" && <span className="text-[28px] text-neutral-500">RM</span>}
                            {n.value}
                            {n.unit && n.unit !== "RM" && <span className="text-[28px] text-neutral-500">{n.unit}</span>}
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}

const CHECKS = ["Net assets equal the total of the funds", "Every bank account is reconciled", "Nothing in a locked year has changed"];

function Statements() {
    const line = "text-neutral-600";
    const total = "border-t border-neutral-900 pt-2 font-medium";
    return (
        <section id="statements" className="scroll-mt-20 border-y border-black/[0.06] bg-white">
            <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-16 px-6 py-[120px]">
                <div className="min-w-0 flex-[1_1_400px]">
                    <h2 className={`${h2} max-w-[14em]`}>Statements that are ready to sign</h2>
                    <p className="mt-4 max-w-[32em] text-[17px] leading-relaxed text-neutral-600">
                        Profit and Loss for a business, or Income and Expenditure for a nonprofit, plus Receipts and Payments, Financial Position
                        and Changes in Funds, straight from your records. Checks show what to fix first, and the PDF carries your letterhead and
                        signatures.
                    </p>
                    <ul className="m-0 mt-8 grid list-none gap-3 p-0 text-[15px]">
                        {CHECKS.map((c) => (
                            <li key={c} className="flex items-center gap-3">
                                <Check className="h-5 w-5 shrink-0 text-green-700" strokeWidth={1.75} aria-hidden="true" />{c}
                            </li>
                        ))}
                    </ul>
                    <Link href="/signup" id="statements-signup-btn" className={`${btnOutline} mt-8`}>Start free and open the sample</Link>
                </div>

                <div className="min-w-0 flex-[1_1_440px] rounded-3xl bg-linear-to-br from-brand-600 to-brand-900 px-6 py-12 sm:px-8">
                    <div role="img" aria-label="A signed Statement of Financial Position for Studio Rimba Sdn Bhd, with all checks passed" className="mx-auto max-w-[420px] -rotate-[1.5deg] rounded-md bg-white p-6 text-[13px] leading-5 text-neutral-900 shadow-[0_32px_64px_-24px_rgba(10,4,60,0.6)] sm:p-9">
                        <div className="flex items-start justify-between gap-3 border-b-2 border-neutral-900 pb-4">
                            <div>
                                <div className="text-[15px] font-medium">Studio Rimba Sdn Bhd</div>
                                <div className="text-neutral-500">Private limited company</div>
                            </div>
                        </div>
                        <div className="mt-5 text-[15px] font-medium">Statement of Financial Position</div>
                        <div className="text-neutral-500">As at 31 December 2026, in RM</div>
                        <div className="mt-4 grid grid-cols-[1fr_auto] gap-y-2">
                            <span className="font-medium">Assets</span><span />
                            <span className={line}>Office equipment</span><span>12,400.00</span>
                            <span className={line}>Maybank current account</span><span>38,215.60</span>
                            <span className={line}>Owed to you</span><span>1,200.00</span>
                            <span className="border-t border-black/20 pt-1">Total assets</span><span className="border-t border-black/20 pt-1">51,815.60</span>
                            <span className="pt-2 font-medium">Liabilities</span><span />
                            <span className={line}>Bills to pay</span><span>2,640.00</span>
                            <span className={total}>Net assets</span><span className={`${total} border-b-[3px] border-b-neutral-900 [border-bottom-style:double]`}>49,175.60</span>
                            <span className="pt-3 font-medium">Funds</span><span />
                            <span className={line}>Digitalisation grant (restricted)</span><span>4,650.00</span>
                            <span className={line}>General Fund</span><span>33,525.60</span>
                            <span className={line}>Office renovation</span><span>11,000.00</span>
                            <span className={total}>Total funds</span><span className={`${total} border-b-[3px] border-b-neutral-900 [border-bottom-style:double]`}>49,175.60</span>
                        </div>
                        <div className="mt-9 grid grid-cols-2 gap-6 text-xs text-neutral-500">
                            <div className="border-t border-black/30 pt-1">Aiman Rashid, Director</div>
                            <div className="border-t border-black/30 pt-1">Tan Mei Ling, Director</div>
                        </div>
                        <div aria-hidden="true" className="mt-6 flex justify-end">
                            <div className="mk-mono -rotate-6 rounded-[10px] border-2 border-brand-600/80 px-3 py-2 text-center text-xs leading-4 text-brand-700 mix-blend-multiply">
                                <div className="text-sm font-medium leading-5">All checks passed</div>
                                <div>26 Nov 2026</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}

const PLANS = [
    {
        name: "Free", price: PRICES.free, blurb: "To try Outlayd with your own receipts",
        points: ["AI reads 5 receipts and bills a month", "Record spending against funds you already have", "A sample of every statement"],
        cta: { label: "Start free", href: "/signup", id: "pricing-starter-btn" }, featured: false,
    },
    {
        name: "Growth", price: PRICES.growth, blurb: "For small businesses keeping full books",
        points: ["Unlimited receipt and bill reading", "AI help up to 300 times a month for invoices, payment slips and categories", "All four statements as signed PDFs", "Create a fund for each grant, project or pot of money"],
        cta: { label: "Start free, upgrade in the app", href: "/signup", id: "pricing-growth-btn" }, featured: true,
    },
    {
        name: "Nonprofit", price: PRICES.nonprofit, blurb: "For registered societies, charities and NGOs",
        points: ["Every Growth feature", "Numbered donor receipts, tax-exempt ones once approved", "Apply on our contact page and we send you a code"],
        cta: { label: "Apply for the nonprofit price", href: NONPROFIT_APPLY, id: "pricing-nonprofit-btn" }, featured: false,
    },
];

function Pricing() {
    return (
        <section id="pricing" className="mx-auto max-w-[1200px] scroll-mt-20 px-6 py-[120px]">
            <div className="text-center">
                <h2 className={`${h2} mx-auto max-w-[16em]`}>Start free, upgrade when you need your full books</h2>
                <p className="mx-auto mt-4 max-w-[34em] text-[17px] text-neutral-600">
                    Month to month, cancel any time. If you stop paying, nothing is deleted: you can still view and export everything.
                </p>
            </div>
            <div className="mx-auto mt-14 grid max-w-xl items-stretch gap-4 lg:max-w-none lg:grid-cols-3">
                {PLANS.map((p) => (
                    <div key={p.name} className={`flex flex-col rounded-3xl bg-white p-7 ${p.featured ? "shadow-[inset_0_0_0_2px_var(--color-brand-600)]" : "border border-black/[0.08]"}`}>
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="m-0 text-[17px] font-medium">{p.name}</h3>
                            {p.featured && <span className="inline-flex h-6 items-center rounded-full bg-brand-50 px-2.5 text-xs font-medium text-brand-700">Recommended</span>}
                        </div>
                        <p className="mt-1 text-sm text-neutral-600">{p.blurb}</p>
                        <div className="mt-6 flex items-baseline gap-1.5">
                            <span className="mk-display text-[40px] leading-none">RM{p.price}</span>
                            <span className="text-sm text-neutral-500">a month</span>
                        </div>
                        <ul className="m-0 mb-8 mt-6 grid list-none gap-3 p-0 text-sm">
                            {p.points.map((pt) => (
                                <li key={pt} className="flex gap-2">
                                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" strokeWidth={1.75} aria-hidden="true" />{pt}
                                </li>
                            ))}
                        </ul>
                        <Link
                            href={p.cta.href}
                            id={p.cta.id}
                            className={p.featured
                                ? "mt-auto flex h-11 items-center justify-center rounded-[14px] bg-brand-600 text-[15px] font-medium text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.97]"
                                : `${btnOutline} mt-auto`}
                        >
                            {p.cta.label}
                        </Link>
                    </div>
                ))}
            </div>
        </section>
    );
}

const SETUP = [
    { title: "Company added", detail: "Sdn Bhd, financial year from January" },
    { title: "First receipt read", detail: "Kedai Cetak Maju, RM350.00, Marketing" },
    { title: "First statement ready", detail: "Profit and Loss, all checks passed" },
];

function Closing() {
    return (
        <section className="mx-auto max-w-[1200px] px-6 pb-[120px]">
            <div className="mk-mesh flex flex-wrap items-center gap-12 rounded-[32px] p-[clamp(32px,6vw,72px)] text-white">
                <div className="min-w-0 flex-[1_1_380px]">
                    <h2 className="mk-display m-0 max-w-[12em] text-[clamp(30px,4.2vw,52px)] leading-[1.06] tracking-[-0.035em]">
                        Ready for a year end without the spreadsheet?
                    </h2>
                    <ul className="m-0 mt-6 grid list-none gap-3 p-0 text-[15px] text-white/90">
                        {["No credit card needed", "Set up in about 2 minutes", "Early customers onboard with the founder"].map((t) => (
                            <li key={t} className="flex items-center gap-3"><Check className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} aria-hidden="true" />{t}</li>
                        ))}
                    </ul>
                    <div className="mt-8 flex flex-wrap gap-3">
                        <Link href="/signup" id="cta-signup-btn" className={btnLight}>Start free</Link>
                        <Link href="/contact?subject=Talk%20to%20the%20founder" id="cta-contact-btn" className={btnGhostLight}>Talk to the founder</Link>
                    </div>
                </div>
                <div aria-hidden="true" className="min-w-0 max-w-[420px] flex-[1_1_320px] rounded-3xl bg-white p-6 text-neutral-900 shadow-[0_32px_64px_-24px_rgba(10,4,60,0.5)]">
                    <div className="text-[15px] font-medium">Setting up your books</div>
                    <div className="text-[13px] text-neutral-600">Studio Rimba Sdn Bhd</div>
                    <div className="mt-5 h-1 overflow-hidden rounded-full bg-neutral-100"><div className="mk-fill h-1 rounded-full bg-brand-600" /></div>
                    <div className="mt-5 grid gap-3">
                        {SETUP.map((s, i) => (
                            <div key={s.title} className="mk-rise flex items-center gap-3 rounded-2xl bg-neutral-50 p-3" style={{ animationDelay: `${300 + i * 700}ms` }}>
                                <span className="mk-tick flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600" style={{ animationDelay: `${700 + i * 700}ms` }}>
                                    <Check className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium">{s.title}</span>
                                    <span className="block text-[13px] text-neutral-600">{s.detail}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
