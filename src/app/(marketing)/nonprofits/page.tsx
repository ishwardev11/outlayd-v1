import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, FileText, HeartHandshake, Landmark, ShieldCheck, Users } from "lucide-react";
import { Navbar, Footer } from "@/components/marketing/SiteChrome";
import { PlanCards, PlanComparisonTable } from "@/components/marketing/PlanComparison";

export const metadata: Metadata = {
    title: "Outlayd for nonprofits | Funds, donor receipts and AGM-ready statements",
    description: "Bookkeeping for Malaysian societies, charities and NGOs: restricted funds, donor receipts, and the statements you present at your AGM, from RM49 a month.",
};

const FEATURES = [
    { icon: Landmark, title: "Every fund kept separate", text: "A fund for each grant, appeal or project, restricted or unrestricted. Every receipt, donation and invoice line belongs to one, each fund has its balance, and you are warned if a restricted fund is overspent. Move money between funds with a recorded transfer." },
    { icon: HeartHandshake, title: "Donations and donor receipts", text: "Record donations, grants, membership and fees. Issue numbered donation receipts with your letterhead; a voided receipt keeps its number. Tax-exempt receipts print your approval reference once your organisation is approved." },
    { icon: FileText, title: "The statements for your AGM", text: "Statement of Income and Expenditure, Receipts and Payments for smaller societies, Statement of Financial Position, Statement of Changes in Funds, and schedules of fixed assets, money owed and donations by fund. Compare with last year, or show one column per fund." },
    { icon: BookOpenCheck, title: "Checks before you submit", text: "A \"Ready to submit\" panel lists anything still uncategorised, an opening position not finished, accounts not reconciled or a restricted fund below zero, each with a link to fix it. Until the checks pass, the PDF is marked DRAFT." },
    { icon: ShieldCheck, title: "A year end that stays closed", text: "Reconcile each bank account at month-end, then lock the year so nothing in it can change. Unlocking needs an Admin and a reason, and the audit log records who changed what and when." },
    { icon: Users, title: "Your committee, with the right access", text: "Up to five people: the treasurer as Admin, a bookkeeper as Editor, and committee members as Viewers who can read the books and statements but not change them." },
];

const STEPS = [
    { title: "Set your starting point", text: "Your bank balances, what is owed and what you own on the first day of your financial year. Fund balances follow from it." },
    { title: "Record the year as it happens", text: "Upload receipts and bills, record donations and other income, and issue invoices. AI reads the paperwork; you check and approve." },
    { title: "Reconcile each month", text: "Type in the closing balance from the bank statement and see that it agrees, with a note for anything not yet entered." },
    { title: "Present and lock", text: "When the checks pass, download the signed statements for your AGM and lock the year." },
];

export default function NonprofitsPage() {
    return (
        <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30">
            <Navbar />
            <main>
                <section className="relative pt-14 pb-16 sm:pt-20 sm:pb-24 px-4 sm:px-6 overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-emerald-900/30 via-slate-950 to-slate-950 -z-10" />
                    <div className="container mx-auto max-w-4xl text-center">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs sm:text-sm font-medium mb-6">
                            For societies, charities and NGOs
                        </div>
                        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 break-words">
                            Accounts your committee, donors and auditor <span className="text-transparent bg-clip-text bg-linear-to-r from-emerald-400 to-cyan-400">can trust.</span>
                        </h1>
                        <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto mb-8">
                            Outlayd is bookkeeping for Malaysian nonprofits: receipts read by AI, donations with proper receipts, every fund kept
                            separate, and the statements you present at your AGM, without a spreadsheet.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <Link href="/signup" id="nonprofit-signup-btn" className="inline-flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-full font-medium transition-all active:scale-95">
                                Start free <ArrowRight className="w-4 h-4" />
                            </Link>
                            <Link href="/contact?subject=Nonprofit%20Pricing%20Application" id="nonprofit-apply-btn" className="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-6 py-3 rounded-full font-medium transition-all active:scale-95">
                                Apply for nonprofit pricing
                            </Link>
                        </div>
                    </div>
                </section>

                <section className="py-16 px-4 border-y border-white/5 bg-slate-900/30">
                    <div className="container mx-auto max-w-6xl">
                        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-10">What a treasurer gets</h2>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {FEATURES.map((f) => (
                                <div key={f.title} className="rounded-2xl border border-white/10 bg-slate-950 p-6">
                                    <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-4"><f.icon className="w-5 h-5" /></div>
                                    <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                                    <p className="text-sm text-slate-400 leading-relaxed">{f.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="py-16 px-4">
                    <div className="container mx-auto max-w-5xl">
                        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-center mb-10">From the first receipt to your AGM</h2>
                        <ol className="grid gap-4 md:grid-cols-4">
                            {STEPS.map((s, i) => (
                                <li key={s.title} className="rounded-2xl border border-white/10 bg-slate-900/40 p-5">
                                    <div className="text-2xl font-bold text-indigo-400 mb-2">0{i + 1}</div>
                                    <h3 className="font-semibold mb-1">{s.title}</h3>
                                    <p className="text-sm text-slate-400">{s.text}</p>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>

                <section id="pricing" className="py-16 sm:py-24 px-4 border-t border-white/5">
                    <div className="container mx-auto max-w-6xl">
                        <div className="text-center mb-14">
                            <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-4">Nonprofit pricing</h2>
                            <p className="text-slate-400 text-lg max-w-2xl mx-auto">Every Growth feature for RM49 a month, for registered nonprofits. Start on the free plan while we confirm your registration.</p>
                        </div>
                        <PlanCards highlight="nonprofit" />
                        <PlanComparisonTable />
                        <p className="mt-8 text-center text-xs text-slate-500 max-w-2xl mx-auto">
                            Outlayd keeps your books and prepares your statements from your records. Where your constitution or a funder requires an
                            audit, your auditor still signs them off; Outlayd gives them the ledger, the audit log and an export for their own software.
                        </p>
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    );
}
