"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
    ArrowRight,
    CheckCircle2,
    ChevronDown,
    CreditCard,
    LineChart,
    Receipt,
    ShieldCheck,
    Zap,
    Sparkles,
    Database,
    Triangle,
    Atom,
    HeartHandshake,
    FileText
} from "lucide-react";
import { useState } from "react";
import { PlaygroundDemo } from "@/components/marketing/PlaygroundDemo";
import { PlanCards, PlanComparisonTable } from "@/components/marketing/PlanComparison";
import { Footer, Navbar, handleSmoothScroll } from "@/components/marketing/SiteChrome";

// Animation Variants
const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

export default function LandingPage() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30">
            <Navbar />
            <main>
                <HeroSection />
                <PartnersSection />
                <BenefitsSection />
                <HowItWorksSection />
                <PricingSection />
                <WhyOutlaydSection />
                <FAQSection />
                <CTASection />
            </main>
            <Footer />
        </div>
    );
}

function HeroSection() {
    return (
        <section className="relative pt-10 pb-14 sm:pt-16 sm:pb-20 lg:pt-24 lg:pb-32 overflow-hidden px-4 sm:px-6">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-indigo-900/40 via-slate-950 to-slate-950 -z-10" />

            <div className="container mx-auto max-w-6xl w-full">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-8 items-center min-w-0">
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={staggerContainer}
                        className="text-center lg:text-left w-full min-w-0"
                    >
                        <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-1.5 sm:gap-2 mx-auto px-2.5 sm:px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-[10px] sm:text-sm font-medium mb-5 sm:mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out fill-mode-both">
                            <span className="flex h-2 w-2 shrink-0 rounded-full bg-indigo-500 animate-pulse"></span>
                            <span className="min-w-0">For Malaysian nonprofits &amp; small businesses • Early access open</span>
                        </div>

                        <h1 className="w-full min-w-0 text-[clamp(1.75rem,7vw,2rem)] leading-[1.15] sm:text-4xl md:text-5xl lg:text-7xl font-bold tracking-tight mb-4 sm:mb-6 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 ease-out fill-mode-both break-words">
                            Bookkeeping and financial statements <span className="text-transparent bg-clip-text bg-linear-to-r from-indigo-400 to-cyan-400">for nonprofits and small businesses.</span>
                        </h1>

                        <p className="w-full min-w-0 text-sm sm:text-base lg:text-lg text-slate-400 mb-6 sm:mb-8 max-w-xl mx-auto lg:mx-0 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 ease-out fill-mode-both break-words">
                            Snap a receipt and Outlayd&apos;s AI fills in the details. Record donations and invoices, keep every fund separate, and produce the statements your donors and auditor ask for, without a spreadsheet.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center gap-2.5 sm:gap-4 justify-center lg:justify-start animate-in fade-in slide-in-from-bottom-8 duration-700 delay-500 ease-out fill-mode-both w-full">
                            <Link href="/signup" id="hero-signup-btn" className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 sm:px-8 py-2.5 sm:py-4 rounded-full text-sm sm:text-base font-medium transition-all shadow-[0_0_40px_-10px_rgba(79,70,229,0.5)] active:scale-95 cursor-pointer">
                                Start free
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                            <Link href="/#pricing" id="hero-pricing-btn" onClick={(e) => handleSmoothScroll(e, '#pricing')} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 px-5 sm:px-8 py-2.5 sm:py-4 rounded-full text-sm sm:text-base font-medium transition-all active:scale-95 cursor-pointer">
                                View Pricing
                            </Link>
                        </div>
                    </motion.div>

                    <div className="w-full min-w-0 lg:max-w-none">
                        <PlaygroundDemo />
                    </div>
                </div>
            </div>
        </section>
    );
}

function PartnersSection() {
    const techStack = [
        { name: "Google Gemini", icon: <Sparkles className="w-5 h-5 text-indigo-400" /> },
        { name: "Stripe", icon: <CreditCard className="w-5 h-5 text-indigo-400" /> },
        { name: "Supabase", icon: <Database className="w-5 h-5 text-indigo-400" /> },
        { name: "Vercel", icon: <Triangle className="w-4 h-4 text-indigo-400 fill-current" /> },
        { name: "React", icon: <Atom className="w-5 h-5 text-indigo-400" /> },
    ];

    return (
        <section className="py-6 sm:py-10 border-y border-white/5 bg-white/2">
            <div className="container mx-auto px-3 sm:px-4 text-center">
                <p className="text-xs sm:text-sm font-medium text-slate-400 mb-6 sm:mb-8 uppercase tracking-widest">Built on modern, reliable infrastructure</p>
                <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-8 md:gap-16 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                    {techStack.map((tech, i) => (
                        <div key={i} className="flex items-center gap-1.5 sm:gap-2 text-slate-300 hover:text-white transition-colors duration-300">
                            <div className="w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center">{tech.icon}</div>
                            <span className="text-base sm:text-lg font-bold tracking-tighter">{tech.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function BenefitsSection() {
    const box = "bg-linear-to-br from-slate-900 to-slate-950 border border-white/10 rounded-3xl p-6 sm:p-8 relative overflow-hidden transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg";
    const icon = (colour: string, el: React.ReactNode) => <div className={`h-12 w-12 rounded-xl flex items-center justify-center mb-6 ${colour}`}>{el}</div>;
    return (
        <section id="services" className="py-16 sm:py-24 px-3 sm:px-4">
            <div className="container mx-auto max-w-6xl">
                <div className="text-center mb-10 sm:mb-16">
                    <h2 className="text-2xl sm:text-3xl lg:text-5xl font-bold tracking-tight mb-3 sm:mb-4">Your whole year of books, in one place</h2>
                    <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto">From the first receipt to the statements you present at your AGM, with checks that everything adds up.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
                    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn} className={`md:col-span-2 group ${box}`}>
                        <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:scale-110 transition-transform duration-700">
                            <Zap className="w-32 h-32 text-indigo-500" />
                        </div>
                        <div className="relative z-10 w-full h-full flex flex-col justify-between">
                            <div className="mb-24">
                                <h3 className="text-2xl font-bold mb-2">AI reads your receipts and bills</h3>
                                <p className="text-slate-400 max-w-sm">Drop a PDF invoice or a photo of a receipt. Outlayd reads the payee, date, amount and lines, flags duplicates, and you check and approve it.</p>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-slate-900/80 border border-white/10 rounded-xl backdrop-blur-md">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                                        <Receipt className="w-5 h-5 text-indigo-400" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium">Kedai Cetak Maju</div>
                                        <div className="text-xs text-slate-400">Printing • Education Fund</div>
                                    </div>
                                </div>
                                <div className="text-emerald-400 font-medium font-mono">RM350.00</div>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn} className={box}>
                        {icon("bg-emerald-500/10 text-emerald-400", <HeartHandshake className="w-6 h-6" />)}
                        <h3 className="text-xl font-bold mb-2">Money in and donor receipts</h3>
                        <p className="text-slate-400 text-sm">Record donations, grants and fees, split across funds, and issue numbered donation receipts, tax-exempt ones too once your organisation is approved.</p>
                    </motion.div>

                    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn} className={box}>
                        {icon("bg-cyan-500/10 text-cyan-400", <LineChart className="w-6 h-6" />)}
                        <h3 className="text-xl font-bold mb-2">Funds kept separate</h3>
                        <p className="text-slate-400 text-sm">A fund for each grant or appeal, restricted or not, with its balance always up to date and a warning if a restricted fund is overspent.</p>
                    </motion.div>

                    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn} className={`md:col-span-2 group ${box}`}>
                        <div className="flex flex-col md:flex-row h-full gap-8">
                            <div className="flex-1 flex flex-col justify-center">
                                {icon("bg-amber-500/10 text-amber-400", <FileText className="w-6 h-6" />)}
                                <h3 className="text-xl font-bold mb-2">Financial statements, ready to sign</h3>
                                <p className="text-slate-400 text-sm">Income and Expenditure (or Profit and Loss), Receipts and Payments, Financial Position and Changes in Funds, straight from your records. Checks show what to fix first; the PDF has your letterhead and signatures.</p>
                            </div>
                            <div className="flex-1 flex items-center justify-center">
                                <div className="w-full max-w-70 bg-white text-slate-800 rounded-xl p-4 shadow-xl rotate-[-3deg] group-hover:rotate-0 transition-transform duration-500 text-xs font-mono">
                                    <div className="text-center font-sans font-bold text-sm mb-2">Income and Expenditure</div>
                                    {[["Donations", "30,500.00"], ["Grants", "8,000.00"], ["Programme", "(14,400.00)"], ["Administration", "(9,690.00)"]].map(([l, v]) => (
                                        <div key={l} className="flex justify-between py-0.5"><span className="font-sans">{l}</span><span>{v}</span></div>
                                    ))}
                                    <div className="flex justify-between border-t-2 border-double border-slate-400 mt-1 pt-1 font-bold"><span className="font-sans">Surplus</span><span>7,810.00</span></div>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn} className={box}>
                        {icon("bg-violet-500/10 text-violet-400", <CreditCard className="w-6 h-6" />)}
                        <h3 className="text-xl font-bold mb-2">Bills and invoices</h3>
                        <p className="text-slate-400 text-sm">Bills you approve become money you owe; invoices you issue carry your letterhead. Part-payments, and a list of what is overdue.</p>
                    </motion.div>

                    <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn} className={`md:col-span-2 ${box}`}>
                        {icon("bg-rose-500/10 text-rose-400", <ShieldCheck className="w-6 h-6" />)}
                        <h3 className="text-xl font-bold mb-2">A year end your auditor will like</h3>
                        <p className="text-slate-400 text-sm">Reconcile each bank account at month-end, lock a finished year so nothing in it can change, and see who changed what, when and why in the audit log. Assets and loans are included, with depreciation worked out for you.</p>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}

function HowItWorksSection() {
    // Small, static pictures of what each step looks like in the app (no video to keep up to date)
    const field = (label: string, value: string, highlight = false) => (
        <div className="flex items-center justify-between gap-3 py-1.5 border-b border-white/5 last:border-0">
            <span className="text-slate-500">{label}</span>
            <span className={highlight ? "font-mono text-emerald-400" : "text-slate-200"}>{value}</span>
        </div>
    );
    const steps: { num: string; title: string; desc: string; picture: React.ReactNode }[] = [
        {
            num: "01",
            title: "Upload a receipt or bill",
            desc: "Drop a PDF or snap a photo. Outlayd's AI reads the payee, date, amount and lines, and warns you if it looks like a duplicate.",
            picture: (
                <div className="text-xs">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="h-8 w-8 rounded-lg bg-indigo-500/20 flex items-center justify-center"><Receipt className="w-4 h-4 text-indigo-400" /></div>
                        <span className="text-slate-300 font-medium">receipt-kedai-cetak.jpg</span>
                        <span className="ml-auto rounded-full bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 text-[10px] text-indigo-300">Checks passed (97%)</span>
                    </div>
                    {field("Payee", "Kedai Cetak Maju")}
                    {field("Date", "12 Nov 2026")}
                    {field("Amount", "RM350.00", true)}
                </div>
            ),
        },
        {
            num: "02",
            title: "Check it and approve",
            desc: "Choose the category and the fund it belongs to, then approve. Unpaid bills wait in Bills & Invoices until you record the payment.",
            picture: (
                <div className="text-xs">
                    {field("Category", "Printing")}
                    {field("Fund", "Education Fund (restricted)")}
                    {field("Document type", "Invoice (Unpaid)")}
                    <div className="mt-3 flex justify-end gap-2">
                        <span className="rounded-md border border-white/10 px-2.5 py-1 text-slate-400">Cancel</span>
                        <span className="rounded-md bg-indigo-600 px-2.5 py-1 font-medium text-white">Approve</span>
                    </div>
                </div>
            ),
        },
        {
            num: "03",
            title: "Record money in",
            desc: "Donations, grants and fees go into the cash book against their fund, with a numbered donor receipt as a PDF if you need one.",
            picture: (
                <div className="text-xs">
                    <div className="flex items-center justify-between py-1.5 border-b border-white/5">
                        <span className="text-slate-200">Dewan Komuniti appeal</span>
                        <span className="font-mono text-emerald-400">+RM2,000.00</span>
                    </div>
                    {field("Category", "General donations")}
                    {field("Fund", "Building Fund")}
                    <div className="mt-3 flex items-center gap-2 text-slate-300">
                        <FileText className="w-4 h-4 text-emerald-400" />Donation receipt no. 42 issued
                    </div>
                </div>
            ),
        },
        {
            num: "04",
            title: "Produce your statements",
            desc: "Income and Expenditure, Receipts and Payments, Financial Position and Changes in Funds. Checks show what to fix first; then download signed PDFs and lock the year.",
            picture: (
                <div className="text-xs">
                    <div className="mb-2 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1.5 text-emerald-300">
                        <CheckCircle2 className="w-4 h-4" />Ready to submit: every check passes
                    </div>
                    {["Nothing is Uncategorised", "Assets less liabilities equal the funds", "Every account is reconciled"].map((t) => (
                        <div key={t} className="flex items-center gap-2 py-1 text-slate-300"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />{t}</div>
                    ))}
                    <div className="mt-3 flex justify-end gap-2">
                        <span className="rounded-md border border-white/10 px-2.5 py-1 text-slate-300">Export PDF</span>
                        <span className="rounded-md bg-indigo-600 px-2.5 py-1 font-medium text-white">Lock the period</span>
                    </div>
                </div>
            ),
        },
    ];

    return (
        <section id="how-it-works" className="py-16 sm:py-24 px-3 sm:px-4 bg-slate-900/50 border-y border-white/5">
            <div className="container mx-auto max-w-6xl">
                <div className="text-center mb-10 sm:mb-12 lg:mb-16">
                    <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">How it works</h2>
                    <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto">
                        From a photo of a receipt to signed statements for your AGM, in four steps.
                    </p>
                </div>

                <ol className="grid gap-4 sm:gap-6 md:grid-cols-2" data-testid="how-it-works-steps">
                    {steps.map((step) => (
                        <motion.li
                            key={step.num}
                            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn}
                            className="rounded-3xl border border-white/10 bg-slate-950 p-5 sm:p-6 flex flex-col"
                        >
                            <div className="flex items-start gap-4 mb-5">
                                <div className="w-12 h-12 shrink-0 bg-slate-900 border border-white/10 rounded-xl flex items-center justify-center text-lg font-bold text-indigo-400">
                                    {step.num}
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold mb-1">{step.title}</h3>
                                    <p className="text-slate-400 text-sm">{step.desc}</p>
                                </div>
                            </div>
                            <div className="mt-auto rounded-2xl border border-white/10 bg-slate-900/70 p-4" aria-hidden="true">
                                {step.picture}
                            </div>
                        </motion.li>
                    ))}
                </ol>
            </div>
        </section>
    );
}

function PricingSection() {
    return (
        <section id="pricing" className="py-24 px-4">
            <div className="container mx-auto max-w-6xl">
                <div className="text-center mb-16">
                    <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">Simple, transparent pricing</h2>
                    <p className="text-slate-400 text-lg">Start free. Upgrade inside the app when you need your full books. Month to month, cancel any time.</p>
                </div>
                <PlanCards />
                <PlanComparisonTable />
            </div>
        </section>
    );
}

function WhyOutlaydSection() {
    return (
        <section id="why-outlayd" className="py-24 px-4 bg-slate-900/30 border-y border-white/5">
            <div className="container mx-auto max-w-4xl text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-medium mb-6">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    Why We Built Outlayd
                </div>
                <h2 className="text-3xl lg:text-4xl font-bold mb-6 tracking-tight">
                    Built out of real expense chaos, for organizations that value clarity.
                </h2>
                <p className="text-slate-300 text-lg leading-relaxed max-w-2xl mx-auto mb-10">
                    We built Outlayd after watching growing SMEs and non-profits drown in paper receipts, manual data entry, and month-end reconciliation headaches. Instead of bloated enterprise software, we built a focused tool that turns receipts into a clean ledger and the ledger into statements you can sign.
                </p>
                <div className="grid sm:grid-cols-3 gap-6 text-left">
                    <div className="bg-slate-950 border border-white/10 p-6 rounded-2xl">
                        <div className="text-indigo-400 font-semibold mb-2">100% Honest &amp; Transparent</div>
                        <p className="text-sm text-slate-400 leading-relaxed">No hidden fees, high enterprise lock-ins, or bloated tier structures you don&apos;t need.</p>
                    </div>
                    <div className="bg-slate-950 border border-white/10 p-6 rounded-2xl">
                        <div className="text-indigo-400 font-semibold mb-2">Built for SMEs &amp; Nonprofits</div>
                        <p className="text-sm text-slate-400 leading-relaxed">Designed specifically for lean teams that need fast, hassle-free bookkeeping without accounting friction.</p>
                    </div>
                    <div className="bg-slate-950 border border-white/10 p-6 rounded-2xl">
                        <div className="text-indigo-400 font-semibold mb-2">Direct Founder Onboarding</div>
                        <p className="text-sm text-slate-400 leading-relaxed">Early customers get direct access to our core team to help shape the feature roadmap.</p>
                    </div>
                </div>
            </div>
        </section>
    );
}

function FAQSection() {
    const faqs = [
        { q: "What statements can Outlayd produce?", a: "On the Growth and Nonprofit plans: the Statement of Income and Expenditure (Profit and Loss for a business), Receipts and Payments, the Statement of Financial Position, the Statement of Changes in Funds, and schedules for fixed assets, money owed and donations. Each comes with checks that it adds up, and as a PDF with your letterhead and signatures. Free plans can look at a sample." },
        { q: "How accurate is the AI reading?", a: "It reads most printed receipts and invoices well, including foreign currencies and multi-page invoices with line items. Nothing counts until someone in your team has checked and approved it." },
        { q: "Can I keep grants and restricted funds separate?", a: "Yes. Every receipt, donation and invoice line belongs to a fund, each fund has its own balance, and the statements show restricted and unrestricted funds separately. Creating funds is part of the Growth and Nonprofit plans." },
        { q: "Do I still need an accountant or auditor?", a: "Outlayd keeps your books and prepares the statements; if your constitution or a funder needs them audited, your auditor still signs them off. It gives them a clean ledger, an audit log of every change, and an export for their own software." },
        { q: "What happens if I stop paying?", a: "Nothing is deleted. Paid features become read-only, and you can still view and export everything you recorded. You can cancel any time; there are no contracts." },
        { q: "Is there a discount for nonprofits?", a: "Yes. Registered societies, charities and NGOs get every Growth feature for RM49 a month instead of RM89. Apply on our contact page and we send you a code to use at checkout." }
    ];

    return (
        <section id="faq" className="py-24 px-4">
            <div className="container mx-auto max-w-3xl">
                <div className="text-center mb-12">
                    <h2 className="text-3xl font-bold">Frequently Asked Questions</h2>
                </div>

                <div className="space-y-4">
                    {faqs.map((faq, i) => (
                        <FAQItem key={i} question={faq.q} answer={faq.a} />
                    ))}
                </div>
            </div>
        </section>
    );
}

function FAQItem({ question, answer }: { question: string, answer: string }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="border border-white/10 rounded-2xl bg-slate-900/30 overflow-hidden transition-colors hover:bg-slate-900/40">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full p-6 text-left flex items-center justify-between focus:outline-none cursor-pointer"
            >
                <span className="font-medium text-slate-200">{question}</span>
                <ChevronDown className={`w-5 h-5 text-slate-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                    <div className="px-6 pb-6 text-sm text-slate-400">
                        {answer}
                    </div>
                </div>
            </div>
        </div>
    );
}

function CTASection() {
    return (
        <section className="py-24 px-4">
            <div className="container mx-auto max-w-5xl">
                <div className="relative rounded-3xl overflow-hidden">
                    <div className="absolute inset-0 bg-linear-to-br from-indigo-600 to-violet-800" />
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-20 mix-blend-overlay" />

                    <div className="relative z-10 p-12 lg:p-20 text-center">
                        <h2 className="text-3xl lg:text-5xl font-bold mb-6">Ready for a year end without the spreadsheet?</h2>
                        <p className="text-indigo-100 text-lg md:text-xl max-w-2xl mx-auto mb-10">
                            Start with your receipts today. Your statements build themselves as you go.
                        </p>
                        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                            <Link href="/signup" id="cta-signup-btn" className="w-full sm:w-auto bg-white text-indigo-900 font-bold px-8 py-4 rounded-full transition-all active:scale-95 hover:bg-slate-100 cursor-pointer">
                                Get Started Now
                            </Link>
                        </div>
                        <p className="text-indigo-200/70 text-sm mt-6">No credit card required. Setup takes 2 minutes.</p>
                    </div>
                </div>
            </div>
        </section>
    );
}
