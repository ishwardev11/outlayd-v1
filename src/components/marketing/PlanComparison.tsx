import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { DOWNGRADE_NOTE, PLAN_COMPARISON, PRICES } from "@/utils/plan-comparison";

// The plan cards and the full comparison, from the one list in src/utils/plan-comparison.ts (checked
// against the app's plan rules by a unit test). Light look of the public pages.
const outline = "mt-auto flex h-11 items-center justify-center rounded-[14px] bg-white text-[15px] font-medium text-neutral-900 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)] transition-[background-color,transform] hover:bg-neutral-100 active:scale-[0.97]";
const solid = "mt-auto flex h-11 items-center justify-center rounded-[14px] bg-brand-600 text-[15px] font-medium text-white transition-[background-color,transform] hover:bg-brand-700 active:scale-[0.97]";

function Card({ name, price, blurb, points, featured, badge, cta }: {
    name: string; price: number; blurb: string; points: string[]; featured: boolean; badge?: string;
    cta: { label: string; href: string; id: string };
}) {
    return (
        <div className={`flex flex-col rounded-3xl bg-white p-7 ${featured ? "shadow-[inset_0_0_0_2px_var(--color-brand-600)]" : "border border-black/[0.08]"}`}>
            <div className="flex items-center justify-between gap-2">
                <h3 className="m-0 text-[17px] font-medium">{name}</h3>
                {badge && <span className="inline-flex h-6 items-center rounded-full bg-brand-50 px-2.5 text-xs font-medium text-brand-700">{badge}</span>}
            </div>
            <p className="mt-1 text-sm text-neutral-600">{blurb}</p>
            <div className="mt-6 flex items-baseline gap-1.5">
                <span className="mk-display text-[40px] leading-none">RM{price}</span>
                <span className="text-sm text-neutral-500">a month</span>
            </div>
            <ul className="m-0 mb-8 mt-6 grid list-none gap-3 p-0 text-sm">
                {points.map((t) => (
                    <li key={t} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" strokeWidth={1.75} aria-hidden="true" />{t}</li>
                ))}
            </ul>
            <Link href={cta.href} id={cta.id} className={featured ? solid : outline}>{cta.label}</Link>
        </div>
    );
}

export function PlanCards({ highlight = "growth" }: { highlight?: "growth" | "nonprofit" }) {
    return (
        <div className="mx-auto grid max-w-xl items-stretch gap-4 text-left lg:max-w-6xl lg:grid-cols-3">
            <Card
                name="Free" price={PRICES.free} blurb="Get your receipts and expenses in order" featured={false}
                points={["1 user", "5 AI document readings a month", "Expenses, contacts and categories", "Cash book CSV and change history", "Sample financial statements"]}
                cta={{ label: "Start free", href: "/signup", id: "pricing-starter-btn" }}
            />
            <Card
                name="Growth" price={PRICES.growth} blurb="Your full books: money in and out, funds, invoices and financial statements"
                featured={highlight === "growth"} badge={highlight === "growth" ? "Recommended" : undefined}
                points={["Up to 5 users", "Unlimited AI document reading", "Money in, donor receipts and invoices", "Funds, accounts, assets and loans", "Financial statements with checks and PDFs", "Reconciliation and period locks"]}
                cta={{ label: "Start free, upgrade in the app", href: "/signup", id: "pricing-growth-btn" }}
            />
            <Card
                name="Nonprofit" price={PRICES.nonprofit} blurb="Everything in Growth, at a lower price for registered societies, charities and NGOs"
                featured={highlight === "nonprofit"} badge="For registered nonprofits"
                points={["Everything in Growth", "Donor receipts, tax-exempt when your organisation is approved", "Signed statements for your committee and annual return", "Direct onboarding with the founder"]}
                cta={{ label: "Apply for nonprofit pricing", href: "/contact?subject=Nonprofit%20Pricing%20Application", id: "pricing-nonprofit-btn" }}
            />
        </div>
    );
}

export function PlanComparisonTable() {
    const yes = <Check className="h-4 w-4 text-brand-600" strokeWidth={1.75} aria-label="Yes" />;
    return (
        <div className="mx-auto mt-16 max-w-4xl text-left">
            <h3 className="mk-display mb-4 text-center text-[22px]">Compare the plans</h3>
            <div className="overflow-x-auto rounded-3xl border border-black/[0.08] bg-white">
                <table className="w-full min-w-[520px] text-sm" data-testid="plan-comparison">
                    <thead>
                        <tr className="border-b border-black/[0.08] text-neutral-600">
                            <th className="px-4 py-3 text-left font-medium">Feature</th>
                            <th className="w-40 px-4 py-3 text-left font-medium">Free</th>
                            <th className="w-48 px-4 py-3 text-left font-medium">Growth and Nonprofit</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.06]">
                        {PLAN_COMPARISON.map((r) => (
                            <tr key={r.feature}>
                                <td className="px-4 py-3">
                                    <div className="text-neutral-900">{r.feature}</div>
                                    {r.detail && <div className="text-xs text-neutral-500">{r.detail}</div>}
                                </td>
                                <td className="px-4 py-3 text-neutral-700">{r.free === "No" ? <Minus className="h-4 w-4 text-neutral-400" strokeWidth={1.75} aria-label="No" /> : r.free === "Yes" ? yes : r.free}</td>
                                <td className="px-4 py-3 text-neutral-700">{r.paid === "Yes" ? yes : r.paid}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="mt-4 text-center text-xs text-neutral-500">
                Month to month, cancel any time. Nonprofit pricing is for registered nonprofits: apply on our contact page and we send you a code for checkout. {DOWNGRADE_NOTE}
            </p>
        </div>
    );
}
