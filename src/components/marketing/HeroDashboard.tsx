// The sample Outlayd dashboard that rises from the bottom of the landing hero. Static markup with sample data
// for a made-up company (Studio Rimba Sdn Bhd); it is a picture of the product, so nothing in it is clickable.
import Image from "next/image";
import { BookOpen, ChartColumn, FileText, House, Landmark, Lock } from "lucide-react";

const NAV = [
    { icon: House, label: "Dashboard", active: true },
    { icon: BookOpen, label: "Cash book" },
    { icon: FileText, label: "Bills and invoices" },
    { icon: Landmark, label: "Funds" },
    { icon: ChartColumn, label: "Reports" },
    { icon: Lock, label: "Assets and loans" },
];

const KPIS = [
    { label: "Money in this month", value: "RM48,600.00", note: "+RM6,240.00 vs October", tone: "text-green-700" },
    { label: "Money out this month", value: "RM31,215.40", note: "RM1,410.00 less than October", tone: "text-neutral-600" },
    { label: "Overdue invoices", value: "3", note: "RM9,850.00 still to come in", tone: "text-amber-700" },
];

const OWED = [
    { who: "Maju Jaya Hardware", amount: "4,200.00", note: "INV-0118, 12 days overdue" },
    { who: "Klinik Sentosa", amount: "3,850.00", note: "INV-0121, 5 days overdue" },
    { who: "Bayu Properties", amount: "1,800.00", note: "INV-0124, 2 days overdue" },
];

const LINE = "M0 132 C 26 128, 40 120, 52 122 S 88 112, 104 108 S 140 116, 156 104 S 192 86, 208 90 S 244 80, 260 72 S 296 78, 312 66 S 348 52, 364 56 S 400 44, 416 40 S 452 36, 468 30 S 504 22, 520 18";

export function HeroDashboard() {
    return (
        <div role="group" aria-label="Sample Outlayd dashboard" className="mk-window-in rounded-3xl bg-white/15 p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.28),0_40px_80px_-24px_rgba(16,8,80,0.6)]">
            <div className="flex min-h-[560px] overflow-hidden rounded-2xl bg-white text-neutral-900">
                <div className="hidden w-[216px] shrink-0 border-r border-black/[0.06] bg-neutral-50 px-3 py-4 md:block">
                    <div className="flex items-center gap-2 px-2 pb-4 text-sm font-medium">
                        <Image src="/outlayd-logo.webp" alt="" width={20} height={20} className="rounded-md" />
                        Studio Rimba Sdn Bhd
                    </div>
                    {NAV.map(({ icon: Icon, label, active }) => (
                        <div key={label} className={`flex h-9 items-center gap-2.5 rounded-[10px] px-2 text-sm ${active ? "bg-brand-50 font-medium text-brand-700" : "text-neutral-600"}`}>
                            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                            {label}
                        </div>
                    ))}
                </div>

                <div className="min-w-0 flex-1 p-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="mk-display text-[22px]">November 2026</div>
                        <div className="inline-flex rounded-xl bg-neutral-100 p-1 text-[13px]">
                            <span className="inline-flex h-7 items-center rounded-lg bg-white px-3 font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]">Month</span>
                            <span className="inline-flex h-7 items-center px-3 text-neutral-600">Quarter</span>
                            <span className="inline-flex h-7 items-center px-3 text-neutral-600">Year</span>
                        </div>
                    </div>

                    <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
                        {KPIS.map((k) => (
                            <div key={k.label} className="rounded-2xl border border-black/[0.08] p-4">
                                <div className="text-[13px] text-neutral-600">{k.label}</div>
                                <div className="mk-display mt-2 text-[28px] tracking-[-0.02em]">{k.value}</div>
                                <div className={`mt-1 text-[13px] ${k.tone}`}>{k.note}</div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-3">
                        <div className="min-w-0 flex-[999_1_360px] rounded-2xl border border-black/[0.08] p-4">
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="text-sm font-medium">Cash at bank</span>
                                <span className="text-[13px] text-neutral-600">RM86,420.50 today</span>
                            </div>
                            <svg role="img" aria-label="Cash at bank rose from RM47,900 in January to RM86,420 in November" viewBox="0 0 520 168" className="mt-3 block h-auto w-full">
                                <defs>
                                    <linearGradient id="mk-cash-fill" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0" stopColor="var(--color-brand-600)" stopOpacity="0.16" />
                                        <stop offset="1" stopColor="var(--color-brand-600)" stopOpacity="0" />
                                    </linearGradient>
                                </defs>
                                <g stroke="rgba(0,0,0,0.06)" strokeWidth="1">
                                    <line x1="0" y1="20" x2="520" y2="20" /><line x1="0" y1="64" x2="520" y2="64" />
                                    <line x1="0" y1="108" x2="520" y2="108" /><line x1="0" y1="148" x2="520" y2="148" />
                                </g>
                                <path d={`${LINE} L 520 148 L 0 148 Z`} fill="url(#mk-cash-fill)" />
                                <path d={LINE} fill="none" stroke="var(--color-brand-600)" strokeWidth="2" strokeLinecap="round" />
                                <circle cx="520" cy="18" r="4" fill="var(--color-brand-600)" stroke="#fff" strokeWidth="2" />
                                <g className="mk-mono" fontSize="12" fill="#737373">
                                    <text x="0" y="164">Jan</text><text x="250" y="164">Jun</text><text x="496" y="164">Nov</text>
                                </g>
                            </svg>
                        </div>
                        <div className="min-w-0 flex-[1_1_240px] rounded-2xl border border-black/[0.08] p-4">
                            <div className="text-sm font-medium">Who owes you</div>
                            <div className="mt-3 grid gap-3 text-[13px]">
                                {OWED.map((o) => (
                                    <div key={o.who}>
                                        <div className="flex justify-between gap-2"><span>{o.who}</span><span>{o.amount}</span></div>
                                        <div className="mt-0.5 text-xs text-amber-700">{o.note}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 flex justify-between border-t border-black/[0.06] pt-3 text-[13px]">
                                <span className="text-neutral-600">Total overdue</span>
                                <span className="font-medium">RM9,850.00</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
