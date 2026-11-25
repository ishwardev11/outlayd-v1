import Link from "next/link";
import { CheckCircle2, Minus } from "lucide-react";
import { DOWNGRADE_NOTE, PLAN_COMPARISON, PRICES } from "@/utils/plan-comparison";

// The plan cards and the full comparison, from the one list in src/utils/plan-comparison.ts (checked
// against the app's plan rules by a unit test)
export function PlanCards({ highlight = "growth" }: { highlight?: "growth" | "nonprofit" }) {
    const card = (on: boolean) => `rounded-3xl p-8 flex flex-col relative ${on ? "bg-linear-to-b from-indigo-900/50 to-slate-900 border border-indigo-500/50 shadow-[0_0_50px_-12px_rgba(79,70,229,0.3)]" : "bg-slate-900/50 border border-white/10"}`;
    const item = (t: string, colour = "text-indigo-400") => (
        <li key={t} className="flex items-start gap-3 text-sm"><CheckCircle2 className={`w-5 h-5 shrink-0 ${colour}`} /><span>{t}</span></li>
    );
    return (
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto text-left">
            <div className={card(false)}>
                <h3 className="text-lg font-medium text-slate-300 mb-2">Free</h3>
                <div className="mb-6"><span className="text-4xl font-bold">RM{PRICES.free}</span><span className="text-slate-400">/month</span></div>
                <p className="text-sm text-slate-400 mb-8 border-b border-white/10 pb-8">Get your receipts and expenses in order.</p>
                <ul className="space-y-4 mb-8 flex-1">
                    {["1 user", "5 AI document readings a month", "Expenses, contacts and categories", "Cash book CSV and change history", "Sample financial statements"].map((t) => item(t))}
                </ul>
                <Link href="/signup" id="pricing-starter-btn" className="w-full py-3 px-4 rounded-xl border border-white/20 font-medium text-center hover:bg-white/5 transition-all active:scale-95 cursor-pointer">Start free</Link>
            </div>

            <div className={card(highlight === "growth")}>
                {highlight === "growth" && <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-indigo-500 text-white px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full">Most popular</div>}
                <h3 className="text-lg font-medium text-indigo-300 mb-2">Growth</h3>
                <div className="mb-6"><span className="text-4xl font-bold">RM{PRICES.growth}</span><span className="text-slate-400">/month</span></div>
                <p className="text-sm text-slate-400 mb-8 border-b border-white/10 pb-8">Your full books: money in and out, funds, invoices and financial statements.</p>
                <ul className="space-y-4 mb-8 flex-1">
                    {["Up to 5 users", "Unlimited AI document reading", "Money in, donor receipts and invoices", "Funds, accounts, assets and loans", "Financial statements with checks and PDFs", "Reconciliation and period locks"].map((t) => item(t))}
                </ul>
                <Link href="/signup" id="pricing-growth-btn" className="w-full py-3 px-4 rounded-xl bg-indigo-600 font-medium text-center hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/25 active:scale-95 cursor-pointer">Start free, upgrade in the app</Link>
            </div>

            <div className={highlight === "nonprofit" ? card(true) : "bg-slate-900/50 border border-emerald-500/30 rounded-3xl p-8 flex flex-col relative"}>
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-emerald-600 text-white px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full">For registered nonprofits</div>
                <h3 className="text-lg font-medium text-emerald-400 mb-2">Nonprofit</h3>
                <div className="mb-6"><span className="text-4xl font-bold">RM{PRICES.nonprofit}</span><span className="text-slate-400">/month</span></div>
                <p className="text-sm text-slate-400 mb-8 border-b border-white/10 pb-8">Everything in Growth, at a lower price for registered societies, charities and NGOs.</p>
                <ul className="space-y-4 mb-8 flex-1">
                    {["Everything in Growth", "Donor receipts, tax-exempt when your organisation is approved", "Statements for your AGM and annual return", "Direct onboarding with the founder"].map((t) => item(t, "text-emerald-400"))}
                </ul>
                <Link href="/contact?subject=Nonprofit%20Pricing%20Application" id="pricing-nonprofit-btn" className="w-full py-3 px-4 rounded-xl border border-emerald-500/40 text-emerald-300 font-medium text-center hover:bg-emerald-500/10 transition-all active:scale-95 cursor-pointer">Apply for nonprofit pricing</Link>
            </div>
        </div>
    );
}

export function PlanComparisonTable() {
    return (
        <div className="max-w-4xl mx-auto mt-16 text-left">
            <h3 className="text-xl font-bold mb-4 text-center">Compare the plans</h3>
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-slate-900/40">
                <table className="w-full min-w-[520px] text-sm" data-testid="plan-comparison">
                    <thead>
                        <tr className="border-b border-white/10 text-slate-300">
                            <th className="px-4 py-3 text-left font-medium">Feature</th>
                            <th className="px-4 py-3 text-left font-medium w-40">Free</th>
                            <th className="px-4 py-3 text-left font-medium w-48">Growth and Nonprofit</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {PLAN_COMPARISON.map((r) => (
                            <tr key={r.feature}>
                                <td className="px-4 py-3">
                                    <div className="text-slate-100">{r.feature}</div>
                                    {r.detail && <div className="text-xs text-slate-500">{r.detail}</div>}
                                </td>
                                <td className="px-4 py-3 text-slate-300">{r.free === "No" ? <Minus className="h-4 w-4 text-slate-600" aria-label="No" /> : r.free === "Yes" ? <CheckCircle2 className="h-4 w-4 text-indigo-400" aria-label="Yes" /> : r.free}</td>
                                <td className="px-4 py-3 text-slate-300">{r.paid === "Yes" ? <CheckCircle2 className="h-4 w-4 text-indigo-400" aria-label="Yes" /> : r.paid}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="mt-4 text-center text-xs text-slate-500">
                Month to month, cancel any time. Nonprofit pricing is for registered nonprofits: apply on our contact page and we send you a code for checkout. {DOWNGRADE_NOTE}
            </p>
        </div>
    );
}
