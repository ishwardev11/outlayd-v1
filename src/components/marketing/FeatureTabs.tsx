"use client";

// Landing page features: pick a job on the left and the sample screen on the right follows it.
// Sample data matches the hero dashboard (Studio Rimba Sdn Bhd). Arrow keys move between tabs.
import { useRef, useState } from "react";
import { Banknote, ChartColumn, FileText, Lock, Receipt, type LucideIcon } from "lucide-react";

type Feature = { key: string; icon: LucideIcon; title: string; text: string };

const FEATURES: Feature[] = [
    { key: "receipt", icon: Receipt, title: "AI reads your receipts and bills", text: "Drop a PDF invoice or a photo of a receipt. Outlayd reads the payee, date, amount and lines, flags duplicates, and you check and approve it." },
    { key: "invoice", icon: FileText, title: "Invoices and bills", text: "Send invoices on your letterhead, take a deposit with its receipt, and see what is still to come in and what is overdue. Bills you approve become money you owe." },
    { key: "money", icon: Banknote, title: "Money in, from sales to donations", text: "Record sales, fees, grants and donations in your cash book. Nonprofits can issue numbered donation receipts, tax-exempt ones too once approved." },
    { key: "funds", icon: ChartColumn, title: "Funds kept separate", text: "Keep each grant, appeal or pot of money in its own fund, with its balance always up to date and a warning if a restricted fund is overspent." },
    { key: "lock", icon: Lock, title: "A year end your auditor will like", text: "Reconcile each bank account at month end, lock a finished year, and see who changed what, when and why in the audit log." },
];

const card = "rounded-[20px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_16px_40px_-16px_rgba(36,23,143,0.24)]";

export function FeatureTabs() {
    const [current, setCurrent] = useState(0);
    const tabs = useRef<(HTMLButtonElement | null)[]>([]);

    const onKeyDown = (e: React.KeyboardEvent, i: number) => {
        const next = e.key === "ArrowDown" || e.key === "ArrowRight" ? i + 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? i - 1 : null;
        if (next === null) return;
        e.preventDefault();
        const n = (next + FEATURES.length) % FEATURES.length;
        setCurrent(n);
        tabs.current[n]?.focus();
    };

    const active = FEATURES[current];

    return (
        <>
        {/* Phones, tablets and small windows: each feature opens in place with its picture right under it */}
        <div className="mt-10 grid gap-2 lg:hidden">
            {FEATURES.map((f, i) => {
                const on = i === current;
                const Icon = f.icon;
                return (
                    <div key={f.key} className={`rounded-[20px] ${on ? "bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)]" : ""}`}>
                        <button
                            type="button"
                            aria-expanded={on}
                            aria-controls={`feature-mobile-${f.key}`}
                            onClick={() => setCurrent(i)}
                            className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-[20px] p-4 text-left text-[15px] font-medium text-neutral-900"
                        >
                            <Icon className={`h-5 w-5 shrink-0 ${on ? "text-brand-600" : "text-neutral-500"}`} strokeWidth={1.75} aria-hidden="true" />
                            {f.title}
                        </button>
                        {on && (
                            <div id={`feature-mobile-${f.key}`} className="px-3 pb-3 sm:px-4 sm:pb-4">
                                <p className="m-0 text-sm leading-normal text-neutral-600">{f.text}</p>
                                <div className="mt-4 flex justify-center overflow-hidden rounded-2xl bg-brand-50 p-3 sm:p-6">
                                    <Visual k={f.key} />
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>

        {/* Laptops and up: tabs on the left, the picture beside them */}
        <div className="mt-12 hidden items-stretch gap-6 lg:flex">
            <div role="tablist" aria-label="Features" aria-orientation="vertical" className="grid w-[380px] shrink-0 content-start gap-1">
                {FEATURES.map((f, i) => {
                    const on = i === current;
                    const Icon = f.icon;
                    return (
                        <button
                            key={f.key}
                            ref={(el) => { tabs.current[i] = el; }}
                            role="tab"
                            id={`feature-tab-${f.key}`}
                            aria-selected={on}
                            aria-controls="feature-panel"
                            tabIndex={on ? 0 : -1}
                            onClick={() => setCurrent(i)}
                            onKeyDown={(e) => onKeyDown(e, i)}
                            className={`w-full cursor-pointer rounded-[20px] p-4 text-left transition-colors ${on ? "bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)]" : "hover:bg-neutral-100"}`}
                        >
                            <span className="flex items-center gap-3 text-[15px] font-medium text-neutral-900">
                                <Icon className={`h-5 w-5 shrink-0 ${on ? "text-brand-600" : "text-neutral-500"}`} strokeWidth={1.75} aria-hidden="true" />
                                {f.title}
                            </span>
                            {on && <span className="mt-2 block pl-8 text-sm leading-normal text-neutral-600">{f.text}</span>}
                        </button>
                    );
                })}
            </div>

            <div
                id="feature-panel"
                role="tabpanel"
                aria-labelledby={`feature-tab-${active.key}`}
                className="flex min-h-[440px] min-w-0 flex-1 items-center justify-center rounded-3xl bg-brand-50 p-8"
            >
                <Visual k={active.key} />
            </div>
        </div>
        </>
    );
}

function Visual({ k }: { k: string }) {
    if (k === "receipt") return <ReceiptVisual />;
    if (k === "invoice") return <InvoicesVisual />;
    if (k === "money") return <MoneyInVisual />;
    if (k === "funds") return <FundsVisual />;
    return <YearEndVisual />;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
    return (
        <>
            <dt className="py-2 text-neutral-600">{label}</dt>
            <dd className={`m-0 py-2 text-right ${strong ? "font-medium" : ""}`}>{value}</dd>
        </>
    );
}

function ReceiptVisual() {
    return (
        <div className="flex w-full flex-wrap items-center justify-center gap-6">
            <div role="img" aria-label="Printed receipt from Kedai Cetak Maju for RM350.00" className="mk-mono w-[200px] -rotate-[4deg] rounded bg-[#fffdf8] px-4 py-5 text-xs leading-5 text-zinc-700 shadow-[0_12px_32px_-8px_rgba(36,23,143,0.24)]">
                <div className="text-center font-medium">KEDAI CETAK MAJU</div>
                <div className="text-center text-zinc-500">Jalan Ipoh, Kuala Lumpur</div>
                <div className="my-3 border-t border-dashed border-black/25" />
                <div className="flex justify-between"><span>Flyers A5 x500</span><span>220.00</span></div>
                <div className="flex justify-between"><span>Banner 2m</span><span>130.00</span></div>
                <div className="my-3 border-t border-dashed border-black/25" />
                <div className="flex justify-between font-medium"><span>TOTAL RM</span><span>350.00</span></div>
                <div className="mt-2 text-center text-zinc-500">12/11/2026 14:32</div>
            </div>
            <div className={`${card} max-w-[320px] flex-[1_1_260px]`}>
                <div className="flex items-center justify-between border-b border-black/[0.06] p-4">
                    <span className="text-sm font-medium">New bill</span>
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">Read from receipt</span>
                </div>
                <dl className="m-0 grid grid-cols-[auto_1fr] px-4 pb-2 pt-1 text-sm">
                    <Row label="Payee" value="Kedai Cetak Maju" />
                    <Row label="Date" value="12 Nov 2026" />
                    <Row label="Category" value="Marketing" />
                    <Row label="Status" value="To pay" />
                    <Row label="Amount" value="RM350.00" strong />
                </dl>
                <div className="flex gap-2 px-2 pb-2 text-sm">
                    <span className="flex h-9 flex-1 items-center justify-center rounded-xl shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]">Edit</span>
                    <span className="flex h-9 flex-1 items-center justify-center rounded-xl bg-brand-600 font-medium text-white">Approve</span>
                </div>
            </div>
        </div>
    );
}

const INVOICES = [
    { who: "Maju Jaya Hardware", ref: "INV-0118, due 14 Nov", status: "Overdue", amount: "RM4,200.00", tone: "bg-amber-100 text-amber-800" },
    { who: "Klinik Sentosa", ref: "INV-0121, due 21 Nov", status: "Overdue", amount: "RM3,850.00", tone: "bg-amber-100 text-amber-800" },
    { who: "Kedai Cetak Maju", ref: "Bill, 12 Nov", status: "To pay", amount: "RM350.00", tone: "bg-neutral-100 text-neutral-700" },
    { who: "Kopi Corner Bangsar", ref: "INV-0116, paid 18 Nov", status: "Paid", amount: "RM2,600.00", tone: "bg-green-100 text-green-800" },
];

function InvoicesVisual() {
    return (
        <div className={`${card} w-full max-w-[460px] p-2`}>
            <div className="px-3 pb-2 pt-3 text-[15px] font-medium">Bills and invoices</div>
            {INVOICES.map((iv) => (
                <div key={iv.who} className="flex items-start gap-3 rounded-xl p-3 text-sm">
                    <span className="min-w-0 flex-1">
                        <span className="block font-medium">{iv.who}</span>
                        <span className="block text-[13px] text-neutral-600">{iv.ref}</span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row-reverse sm:items-center sm:gap-3">
                        <span className="text-right sm:w-[92px]">{iv.amount}</span>
                        <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ${iv.tone}`}>{iv.status}</span>
                    </span>
                </div>
            ))}
        </div>
    );
}

function MoneyInVisual() {
    return (
        <div role="img" aria-label="A numbered official receipt for a RM4,200.00 payment" className={`${card} w-full max-w-[400px] p-5 text-sm sm:p-7`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="font-medium">Studio Rimba Sdn Bhd</div>
                    <div className="text-[13px] text-neutral-600">Official receipt</div>
                </div>
                <span className="mk-mono text-[13px] text-neutral-600">OR-0042</span>
            </div>
            <div className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                <span className="text-neutral-600">Received from</span><span className="text-right">Maju Jaya Hardware</span>
                <span className="text-neutral-600">Date</span><span className="text-right">24 Nov 2026</span>
                <span className="text-neutral-600">For</span><span className="text-right">Invoice INV-0118</span>
            </div>
            <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-4 border-t border-black/[0.08] pt-4">
                <span className="text-neutral-600">Amount</span>
                <span className="mk-display text-[28px] tracking-[-0.02em]">RM4,200.00</span>
            </div>
            <div className="mt-5 rounded-xl bg-neutral-100 p-3 text-[13px] text-neutral-600">
                Running a nonprofit? The same screen issues numbered donation receipts, tax-exempt ones once approved.
            </div>
        </div>
    );
}

function FundsVisual() {
    return (
        <div className={`${card} w-full max-w-[440px] p-5 sm:p-6`}>
            <div className="text-[15px] font-medium">Funds</div>
            <div className="mt-4 grid gap-4 text-sm">
                <div>
                    <div className="flex justify-between"><span>General Fund</span><span>RM33,525.60</span></div>
                    <div className="text-xs text-neutral-600">Unrestricted</div>
                </div>
                <div>
                    <div className="flex justify-between"><span>Office renovation</span><span>RM11,000.00</span></div>
                    <div className="mt-2 h-2 rounded-full bg-neutral-100"><div className="h-2 w-[45%] rounded-full bg-brand-600" /></div>
                    <div className="mt-1 text-xs text-neutral-600">Set aside, 45% of the RM24,500 budget</div>
                </div>
                <div>
                    <div className="flex justify-between"><span>Digitalisation grant</span><span>RM4,650.00</span></div>
                    <div className="mt-2 h-2 rounded-full bg-neutral-100"><div className="h-2 w-[82%] rounded-full bg-amber-600" /></div>
                    <div className="mt-1 text-xs text-amber-700">Restricted, 82% of the grant spent</div>
                </div>
            </div>
        </div>
    );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function YearEndVisual() {
    return (
        <div className={`${card} w-full max-w-[440px] p-5 sm:p-6`}>
            <div className="flex items-baseline justify-between">
                <span className="text-[15px] font-medium">Maybank current account</span>
                <span className="text-[13px] text-neutral-600">2026</span>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
                {MONTHS.map((m, i) => (
                    <span key={m} className={`flex h-9 items-center justify-center rounded-[10px] text-[13px] ${i < 11 ? "bg-brand-50 font-medium text-brand-700" : "text-neutral-500 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]"}`}>{m}</span>
                ))}
            </div>
            <div className="mt-4 text-[13px] text-neutral-600">11 of 12 months reconciled. December opens on 1 Dec.</div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] pt-4">
                <span className="text-[13px] text-neutral-600">Aiman Rashid approved 3 bills today</span>
                <span className="inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-sm shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]">
                    <Lock className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Lock 2026
                </span>
            </div>
        </div>
    );
}
