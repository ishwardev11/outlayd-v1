import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpenCheck, FileText, HeartHandshake, Landmark, ShieldCheck, Users } from "lucide-react";
import { SiteHeader, SiteFooter } from "@/components/marketing/site";
import { PlanCards, PlanComparisonTable } from "@/components/marketing/PlanComparison";

export const metadata: Metadata = {
    title: "Outlayd for nonprofits | Funds, donor receipts and statements ready to sign",
    description: "Bookkeeping for Malaysian societies, charities and NGOs: restricted funds, donor receipts, and signed financial statements, from RM49 a month.",
};

const FEATURES = [
    { icon: Landmark, title: "Every fund kept separate", text: "A fund for each grant, appeal or project, restricted or unrestricted. Every receipt, donation and invoice line belongs to one, each fund has its balance, and you are warned if a restricted fund is overspent. Move money between funds with a recorded transfer." },
    { icon: HeartHandshake, title: "Donations and donor receipts", text: "Record donations, grants, membership and fees. Issue numbered donation receipts with your letterhead; a voided receipt keeps its number. Tax-exempt receipts print your approval reference once your organisation is approved." },
    { icon: FileText, title: "Statements ready to sign", text: "Statement of Income and Expenditure, Receipts and Payments for smaller societies, Statement of Financial Position, Statement of Changes in Funds, and schedules of fixed assets, money owed and donations by fund. Compare with last year, or show one column per fund." },
    { icon: BookOpenCheck, title: "Checks before you submit", text: "A \"Ready to submit\" panel lists anything still uncategorised, an opening position not finished, accounts not reconciled or a restricted fund below zero, each with a link to fix it. Until the checks pass, the PDF is marked DRAFT." },
    { icon: ShieldCheck, title: "A year end that stays closed", text: "Reconcile each bank account at month-end, then lock the year so nothing in it can change. Unlocking needs an Admin and a reason, and the audit log records who changed what and when." },
    { icon: Users, title: "Your committee, with the right access", text: "Up to five people: the treasurer as Admin, a bookkeeper as Editor, and committee members as Viewers who can read the books and statements but not change them." },
];

const STEPS = [
    { title: "Set your starting point", text: "Your bank balances, what is owed and what you own on the first day of your financial year. Fund balances follow from it." },
    { title: "Record the year as it happens", text: "Upload receipts and bills, record donations and other income, and issue invoices, with a deposit and a receipt for every payment received. AI reads the paperwork and matches payment slips to invoices; you check and approve." },
    { title: "Reconcile each month", text: "Type in the closing balance from the bank statement and see that it agrees, with a note for anything not yet entered." },
    { title: "Sign and lock", text: "When the checks pass, download the signed statements and lock the year." },
];

const h2 = "mk-display m-0 text-[clamp(28px,3.4vw,36px)] leading-[1.1]";

export default function NonprofitsPage() {
    return (
        <div className="mk min-h-screen">
            <SiteHeader />
            <main className="pt-[72px]">
                <section className="mk-mesh px-6 pb-24 pt-24 text-center text-white">
                    <div className="mx-auto max-w-[880px]">
                        <p className="mk-rise m-0 text-[15px] text-white/85">For societies, charities and NGOs</p>
                        <h1 className="mk-display mk-rise mx-auto mt-4 max-w-[16em] text-[clamp(36px,5.6vw,64px)] leading-[1.05] tracking-[-0.035em] [animation-delay:60ms] [text-wrap:balance]">
                            Accounts your committee, donors and auditor can trust
                        </h1>
                        <p className="mk-rise mx-auto mt-6 max-w-[36em] text-lg leading-relaxed text-white/85 [animation-delay:120ms]">
                            Outlayd is bookkeeping for Malaysian nonprofits: receipts read by AI, donations with proper receipts, every fund kept
                            separate, and signed financial statements, without a spreadsheet.
                        </p>
                        <div className="mk-rise mt-8 flex flex-wrap justify-center gap-3 [animation-delay:180ms]">
                            <Link href="/signup" id="nonprofit-signup-btn" className="inline-flex h-[50px] items-center gap-2 rounded-[14px] bg-white px-6 text-[15px] font-medium text-brand-700 shadow-[0_1px_2px_rgba(20,12,90,0.24)] transition-[background-color,transform] hover:bg-brand-50 active:scale-[0.97]">
                                Start free <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                            </Link>
                            <Link href="/contact?subject=Nonprofit%20Pricing%20Application" id="nonprofit-apply-btn" className="inline-flex h-[50px] items-center rounded-[14px] bg-white/5 px-6 text-[15px] font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.32)] transition-[background-color,transform] hover:bg-white/15 active:scale-[0.97]">
                                Apply for nonprofit pricing
                            </Link>
                        </div>
                    </div>
                </section>

                <section className="mx-auto max-w-[1200px] px-6 py-24">
                    <h2 className={h2}>What a treasurer gets</h2>
                    <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {FEATURES.map((f) => (
                            <div key={f.title} className="rounded-3xl border border-black/[0.08] bg-white p-6">
                                <f.icon className="h-5 w-5 text-brand-600" strokeWidth={1.75} aria-hidden="true" />
                                <h3 className="mt-4 text-[17px] font-medium">{f.title}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{f.text}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="border-y border-black/[0.06] bg-white">
                    <div className="mx-auto max-w-[1200px] px-6 py-24">
                        <h2 className={h2}>From the first receipt to signed statements</h2>
                        <ol className="m-0 mt-10 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
                            {STEPS.map((s, i) => (
                                <li key={s.title} className="rounded-3xl bg-neutral-50 p-5">
                                    <div className="mk-display text-[28px] leading-none text-brand-600">{i + 1}</div>
                                    <h3 className="mt-3 text-[15px] font-medium">{s.title}</h3>
                                    <p className="mt-1 text-sm leading-relaxed text-neutral-600">{s.text}</p>
                                </li>
                            ))}
                        </ol>
                    </div>
                </section>

                <section id="pricing" className="mx-auto max-w-[1200px] scroll-mt-20 px-6 py-24">
                    <div className="mb-14 text-center">
                        <h2 className={`${h2} mx-auto`}>Nonprofit pricing</h2>
                        <p className="mx-auto mt-4 max-w-2xl text-[17px] text-neutral-600">Every Growth feature for RM49 a month, for registered nonprofits. Start on the free plan while we confirm your registration.</p>
                    </div>
                    <PlanCards highlight="nonprofit" />
                    <PlanComparisonTable />
                    <p className="mx-auto mt-8 max-w-2xl text-center text-xs text-neutral-500">
                        Outlayd keeps your books and prepares your statements from your records. Where your constitution or a funder requires an
                        audit, your auditor still signs them off; Outlayd gives them the ledger, the audit log and an export for their own software.
                    </p>
                </section>
            </main>
            <SiteFooter />
        </div>
    );
}
