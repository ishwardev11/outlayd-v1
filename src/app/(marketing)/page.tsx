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
    Star,
    Sparkles,
    Database,
    Triangle,
    Atom
} from "lucide-react";
import { useState } from "react";
import { PlaygroundDemo } from "@/components/marketing/PlaygroundDemo";

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
                <TestimonialsSection />
                <FAQSection />
                <CTASection />
            </main>
            <Footer />
        </div>
    );
}

export function Navbar() {
    return (
        <header className="sticky top-4 z-50 mx-auto max-w-6xl w-[calc(100%-2rem)] border border-white/10 bg-slate-950/80 backdrop-blur-md rounded-2xl shadow-lg shadow-black/40">
            <div className="px-6 h-16 flex items-center justify-between">
                <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                    <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
                        <Receipt className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-xl font-bold tracking-tight">Outlayd</span>
                </Link>

                <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-300">
                    <Link href="/#services" id="nav-link-services" onClick={(e) => handleSmoothScroll(e, '#services')} className="hover:text-white transition-colors">Services</Link>
                    <Link href="/#how-it-works" id="nav-link-how-it-works" onClick={(e) => handleSmoothScroll(e, '#how-it-works')} className="hover:text-white transition-colors">How it works</Link>
                    <Link href="/#testimonials" id="nav-link-testimonials" onClick={(e) => handleSmoothScroll(e, '#testimonials')} className="hover:text-white transition-colors">Testimonials</Link>
                    <Link href="/#pricing" id="nav-link-pricing" onClick={(e) => handleSmoothScroll(e, '#pricing')} className="hover:text-white transition-colors">Pricing</Link>
                    <Link href="/#faq" id="nav-link-faq" onClick={(e) => handleSmoothScroll(e, '#faq')} className="hover:text-white transition-colors">FAQ</Link>
                </nav>

                <div className="flex items-center gap-4">
                    <Link href="/login" id="nav-login-btn" className="text-sm font-medium text-slate-300 hover:text-white transition-colors hidden sm:block">
                        Log in
                    </Link>
                    <Link href="/signup" id="nav-signup-btn" className="bg-white text-slate-950 hover:bg-slate-200 px-4 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer">
                        Get Started
                    </Link>
                </div>
            </div>
        </header>
    );
}

function HeroSection() {
    return (
        <section className="relative pt-16 pb-20 lg:pt-24 lg:pb-32 overflow-hidden px-4">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-indigo-900/40 via-slate-950 to-slate-950 -z-10" />

            <div className="container mx-auto max-w-6xl">
                <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
                    <motion.div
                        initial="hidden"
                        animate="visible"
                        variants={staggerContainer}
                        className="text-center lg:text-left"
                    >
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-medium mb-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out fill-mode-both">
                            <span className="flex h-2 w-2 rounded-full bg-indigo-500"></span>
                            Join 1,000+ growing businesses
                        </div>

                        <h1 className="text-5xl lg:text-7xl font-bold tracking-tight mb-6 leading-[1.1] animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 ease-out fill-mode-both">
                            Stop typing out receipts. <br /><span className="text-transparent bg-clip-text bg-linear-to-r from-indigo-400 to-cyan-400">Automate your business accounts payable.</span>
                        </h1>

                        <p className="text-lg text-slate-400 mb-8 max-w-xl mx-auto lg:mx-0 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 ease-out fill-mode-both">
                            Outlayd uses AI to instantly extract data from your invoices and receipts, turning messy paperwork into a real-time, tax-ready ledger.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start animate-in fade-in slide-in-from-bottom-8 duration-700 delay-500 ease-out fill-mode-both">
                            <Link href="/signup" id="hero-signup-btn" className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-full font-medium transition-all shadow-[0_0_40px_-10px_rgba(79,70,229,0.5)] active:scale-95 cursor-pointer">
                                Automate Your Ledger
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                            <Link href="/#pricing" id="hero-pricing-btn" onClick={(e) => handleSmoothScroll(e, '#pricing')} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 text-white border border-white/10 px-8 py-4 rounded-full font-medium transition-all active:scale-95 cursor-pointer">
                                View Pricing
                            </Link>
                        </div>
                    </motion.div>

                    <div className="w-full lg:max-w-none">
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
        <section className="py-10 border-y border-white/5 bg-white/2">
            <div className="container mx-auto px-4 text-center">
                <p className="text-sm font-medium text-slate-400 mb-8 uppercase tracking-widest">Powered by enterprise infrastructure</p>
                <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
                    {techStack.map((tech, i) => (
                        <div key={i} className="flex items-center gap-2 text-slate-300 hover:text-white transition-colors duration-300">
                            {tech.icon}
                            <span className="text-lg font-bold tracking-tighter">{tech.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function BenefitsSection() {
    return (
        <section id="services" className="py-24 px-4">
            <div className="container mx-auto max-w-6xl">
                <div className="text-center mb-16">
                    <h2 className="text-3xl lg:text-5xl font-bold tracking-tight mb-4">Everything your business needs</h2>
                    <p className="text-slate-400 text-lg max-w-2xl mx-auto">Focus on growth while we handle the busywork of expense tracking, vendor management, and approvals.</p>
                </div>

                <div className="grid md:grid-cols-3 gap-4">
                    {/* Bento Box 1 - Large */}
                    <motion.div
                        initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn}
                        className="md:col-span-2 bg-linear-to-br from-slate-900 to-slate-950 border border-white/10 rounded-3xl p-8 relative overflow-hidden group transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg"
                    >
                        <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:scale-110 transition-transform duration-700">
                            <Zap className="w-32 h-32 text-indigo-500" />
                        </div>
                        <div className="relative z-10 w-full h-full flex flex-col justify-between">
                            <div className="mb-24">
                                <h3 className="text-2xl font-bold mb-2">Instant AI Data Entry</h3>
                                <p className="text-slate-400 max-w-sm">Drop a PDF invoice or a messy receipt. Our AI instantly extracts the vendor, date, and line-item amounts so you can focus on growing your business, not data entry.</p>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-slate-900/80 border border-white/10 rounded-xl backdrop-blur-md">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                                        <Receipt className="w-5 h-5 text-indigo-400" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium">Uber Ride</div>
                                        <div className="text-xs text-slate-400">Travel • Oct 24</div>
                                    </div>
                                </div>
                                <div className="text-emerald-400 font-medium font-mono">$42.50</div>
                            </div>
                        </div>
                    </motion.div>

                    {/* Bento Box 2 */}
                    <motion.div
                        initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn}
                        className="bg-linear-to-br from-slate-900 to-slate-950 border border-white/10 rounded-3xl p-8 relative overflow-hidden transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg"
                    >
                        <div className="h-full flex flex-col">
                            <div className="h-12 w-12 bg-emerald-500/10 text-emerald-400 rounded-xl flex items-center justify-center mb-6">
                                <ShieldCheck className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold mb-2">Full Procurement Pipeline</h3>
                            <p className="text-slate-400 text-sm flex-1">Built for growing teams. Upgrade to Pro to manage multi-step vendor quotes, generate purchase orders, and route approvals.</p>
                        </div>
                    </motion.div>

                    {/* Bento Box 3 */}
                    <motion.div
                        initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn}
                        className="bg-linear-to-br from-slate-900 to-slate-950 border border-white/10 rounded-3xl p-8 relative overflow-hidden transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg"
                    >
                        <div className="h-full flex flex-col">
                            <div className="h-12 w-12 bg-cyan-500/10 text-cyan-400 rounded-xl flex items-center justify-center mb-6">
                                <LineChart className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold mb-2">Real-time Expense Tracking</h3>
                            <p className="text-slate-400 text-sm flex-1">Track your cash flow instantly. Automatically categorize spend by client project, marketing channel, or retail store operations.</p>
                        </div>
                    </motion.div>

                    {/* Bento Box 4 - Medium */}
                    <motion.div
                        initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn}
                        className="md:col-span-2 bg-linear-to-br from-slate-900 to-slate-950 border border-white/10 rounded-3xl p-8 relative overflow-hidden transition-all duration-300 ease-out hover:-translate-y-1 hover:shadow-lg group"
                    >
                        <div className="flex flex-col md:flex-row h-full gap-8">
                            <div className="flex-1 flex flex-col justify-center">
                                <div className="h-12 w-12 bg-amber-500/10 text-amber-400 rounded-xl flex items-center justify-center mb-6">
                                    <CreditCard className="w-6 h-6" />
                                </div>
                                <h3 className="text-xl font-bold mb-2">Vendor Directory</h3>
                                <p className="text-slate-400 text-sm">Manage all your vendors in one place. Track outstanding balances, categorize expenses natively, and streamline your entire procurement process.</p>
                            </div>
                            <div className="flex-1 flex items-center justify-center">
                                <div className="w-full max-w-[280px] bg-slate-900 rounded-xl border border-white/20 p-4 shadow-xl rotate-[-5deg] hover:rotate-0 transition-transform duration-500 flex flex-col gap-3">
                                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-indigo-500 flex items-center justify-center text-xs font-bold">OC</div>
                                            <span className="text-sm font-medium">Office Corp</span>
                                        </div>
                                        <div className="text-amber-400 text-xs font-mono">$1,250.00</div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-bold">TC</div>
                                            <span className="text-sm font-medium">Tech Center</span>
                                        </div>
                                        <div className="text-slate-400 text-xs font-mono">$0.00</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>

                </div>
            </div>
        </section>
    );
}

function HowItWorksSection() {
    const steps = [
        {
            num: "01",
            title: "Upload & Extract",
            desc: "Simply drag and drop or upload receipts. Our AI handles data entry and vendor matching instantly."
        },
        {
            num: "02",
            title: "Review & Categorize",
            desc: "Review extracted data and assign expenses to the correct project or category. Approve with one click."
        },
        {
            num: "03",
            title: "Report & Procure",
            desc: "Generate comprehensive operational reports and manage your procurement pipeline smoothly."
        }
    ];

    return (
        <section id="how-it-works" className="py-24 px-4 bg-slate-900/50 border-y border-white/5">
            <div className="container mx-auto max-w-5xl">
                <div className="text-center mb-16">
                    <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">How it works?</h2>
                    <p className="text-slate-400 text-lg">From receipt to reconciliation in three simple steps.</p>
                </div>

                <div className="grid md:grid-cols-3 gap-8 relative">
                    {/* Connector Line */}
                    <div className="hidden md:block absolute top-[45px] left-[15%] right-[15%] h-[2px] bg-linear-to-r from-transparent via-indigo-500/50 to-transparent" />

                    {steps.map((step, i) => (
                        <motion.div
                            key={i}
                            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeIn}
                            className="relative text-center"
                        >
                            <div className="w-24 h-24 mx-auto bg-slate-950 border border-white/10 rounded-2xl flex items-center justify-center text-3xl font-bold text-indigo-400 shadow-xl mb-6 relative z-10">
                                {step.num}
                            </div>
                            <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                            <p className="text-slate-400 text-sm">{step.desc}</p>
                        </motion.div>
                    ))}
                </div>
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
                    <p className="text-slate-400 text-lg">Start for free, upgrade when you need more power.</p>
                </div>

                <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                    {/* Basic */}
                    <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-8 flex flex-col mt-4 md:mt-8">
                        <h3 className="text-lg font-medium text-slate-300 mb-2">Starter</h3>
                        <div className="mb-6">
                            <span className="text-4xl font-bold">$0</span>
                            <span className="text-slate-400">/month</span>
                        </div>
                        <p className="text-sm text-slate-400 mb-8 border-b border-white/10 pb-8">Perfect for small businesses and agencies just getting started.</p>
                        <ul className="space-y-4 mb-8 flex-1">
                            {['Up to 5 users', 'AI Document Extraction (5/mo)', 'Digital Agencies & SaaS', 'Vendor Directory'].map((feature, i) => (
                                <li key={i} className="flex items-start gap-3 text-sm">
                                    <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0" />
                                    <span>{feature}</span>
                                </li>
                            ))}
                        </ul>
                        <Link href="/signup" id="pricing-starter-btn" className="w-full py-3 px-4 rounded-xl border border-white/20 font-medium text-center hover:bg-white/5 transition-all active:scale-95 cursor-pointer">
                            Get Started
                        </Link>
                    </div>

                    {/* Pro */}
                    <div className="bg-linear-to-b from-indigo-900/50 to-slate-900 border border-indigo-500/50 rounded-3xl p-8 flex flex-col relative shadow-[0_0_50px_-12px_rgba(79,70,229,0.3)]">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-500 text-white px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full">
                            Most Popular
                        </div>
                        <h3 className="text-lg font-medium text-indigo-300 mb-2">Growth</h3>
                        <div className="mb-6">
                            <span className="text-4xl font-bold">$20</span>
                            <span className="text-slate-400">/month</span>
                        </div>
                        <p className="text-sm text-slate-400 mb-8 border-b border-white/10 pb-8">For growing e-commerce and SaaS brands that need robust expense tracking.</p>
                        <ul className="space-y-4 mb-8 flex-1">
                            {['Up to 20 users', 'Unlimited AI Extraction', 'E-Commerce Brands', 'Exportable Board Reports', 'Custom category allocation'].map((feature, i) => (
                                <li key={i} className="flex items-start gap-3 text-sm">
                                    <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0" />
                                    <span>{feature}</span>
                                </li>
                            ))}
                        </ul>
                        <Link href="/signup" id="pricing-growth-btn" className="w-full py-3 px-4 rounded-xl bg-indigo-600 font-medium text-center hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/25 active:scale-95 cursor-pointer">
                            Get Started
                        </Link>
                    </div>

                    {/* Scale */}
                    <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-8 flex flex-col mt-4 md:mt-8">
                        <h3 className="text-lg font-medium text-slate-300 mb-2">Enterprise</h3>
                        <div className="mb-6">
                            <span className="text-4xl font-bold">Custom</span>
                        </div>
                        <p className="text-sm text-slate-400 mb-8 border-b border-white/10 pb-8">Contact us for details. Advanced controls and dedicated support for multi-location retail operations.</p>
                        <ul className="space-y-4 mb-8 flex-1">
                            {['Unlimited users', 'Retail Operations', 'Custom ERP integrations', 'Dedicated Account Manager', 'SAML SSO'].map((feature, i) => (
                                <li key={i} className="flex items-start gap-3 text-sm">
                                    <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0" />
                                    <span>{feature}</span>
                                </li>
                            ))}
                        </ul>
                        <Link href="#contact" id="pricing-enterprise-btn" className="w-full py-3 px-4 rounded-xl border border-white/20 font-medium text-center hover:bg-white/5 transition-all active:scale-95 cursor-pointer">
                            Contact Sales
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}

function TestimonialsSection() {
    const reviews = [
        { text: "Outlayd cut our month-end close prep from 5 days to 4 hours. Tracking spending across different client projects is finally easy.", author: "Sarah J.", role: "Director, Digital Agency", image: "/sarah.png" },
        { text: "Our staff actually doesn't hate submitting expenses anymore. The vendor directory and AI extraction are basically magic.", author: "Mark T.", role: "Operations, E-Commerce Brand", image: "/mark.png" },
        { text: "The procurement pipeline saved me personally about 4 hours a week. Best software we've adopted this year.", author: "Elena R.", role: "Finance Manager, Retail Chain", image: "/elena.png" }
    ];

    return (
        <section id="testimonials" className="py-24 px-4 bg-slate-900/30 border-y border-white/5">
            <div className="container mx-auto max-w-6xl text-center">
                <h2 className="text-3xl font-bold mb-12">Loved by finance teams worldwide</h2>

                <div className="grid md:grid-cols-3 gap-6">
                    {reviews.map((r, i) => (
                        <div key={i} className="bg-slate-950 border border-white/10 p-6 rounded-2xl text-left">
                            <div className="flex gap-1 mb-4">
                                {[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
                            </div>
                            <p className="text-slate-300 mb-6 text-sm leading-relaxed">&ldquo;{r.text}&rdquo;</p>
                            <div className="flex items-center gap-3">
                                {r.image ? (
                                    <img src={r.image} alt={r.author} className="w-10 h-10 rounded-full object-cover object-top border border-white/10" />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-slate-800 border border-white/10" />
                                )}
                                <div>
                                    <div className="text-sm font-medium">{r.author}</div>
                                    <div className="text-xs text-slate-500">{r.role}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

function FAQSection() {
    const faqs = [
        { q: "How exact is the AI receipt extraction?", a: "Our AI extracts data with 99.5% accuracy. It handles multiple currencies, messy handwriting, and complex multi-page invoices with line items." },
        { q: "Can I generate reports for my board of directors?", a: "Yes, our reporting tools allow you to filter expenses by exact dates, funds, and statuses, giving you ready-to-present data in seconds." },
        { q: "How does the vendor directory work?", a: "It auto-tracks every vendor from your uploaded documents, calculating total outstanding balances automatically without manual entry." },
        { q: "What's the cancellation policy?", a: "You can cancel your subscription at any time. We don't believe in long-term lock-in contracts for growing businesses." }
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
                        <h2 className="text-3xl lg:text-5xl font-bold mb-6">Ready to regain control of your finance operations?</h2>
                        <p className="text-indigo-100 text-lg md:text-xl max-w-2xl mx-auto mb-10">
                            Join thousands of modern companies who have automated their entire expense reporting workflow.
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
                            The intelligent ledger and spend management platform that growing businesses actually love to use.
                        </p>

                    </div>

                    <div className="grid grid-cols-2 gap-8 md:col-span-2 md:ml-auto md:w-3/4 lg:w-2/3">
                        <div>
                            <h4 className="font-semibold mb-4 text-slate-200">Quick Links</h4>
                            <ul className="space-y-3 text-sm text-slate-400">
                                <li><Link href="/#services" onClick={(e) => handleSmoothScroll(e, '#services')} className="hover:text-white transition-colors">Features</Link></li>
                                <li><Link href="/#pricing" onClick={(e) => handleSmoothScroll(e, '#pricing')} className="hover:text-white transition-colors">Pricing</Link></li>
                                <li><a href="mailto:founder@outlayd.com" className="hover:text-white transition-colors">Contact</a></li>
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
