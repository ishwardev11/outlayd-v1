import Link from "next/link"
import { ArrowRight, FileCheck, FileSpreadsheet, LockKeyhole, Scale, Sparkles, CalendarCheck } from "lucide-react"
import type { ReportSection } from "@/utils/report-hub"

const SECTION_ICONS = {
    statements: Scale,
    memo: FileCheck,
    exports: FileSpreadsheet,
    year_end: CalendarCheck,
} as const

// The grid of report cards (spec 6, "report picker"). Every card links to its page; a locked card shows
// the same sample preview or upgrade screen there as before.
export function ReportHub({ sections }: { sections: ReportSection[] }) {
    return (
        <div className="space-y-8">
            {sections.map((section) => {
                const Icon = SECTION_ICONS[section.key]
                return (
                    <section key={section.key} aria-labelledby={`reports-${section.key}`} className="space-y-3">
                        <h2 id={`reports-${section.key}`} className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            <Icon className="h-4 w-4" />
                            {section.title}
                        </h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            {section.cards.map((card) => (
                                <div
                                    key={card.key}
                                    data-testid={`report-card-${card.key}`}
                                    className="group relative flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 transition-colors hover:border-indigo-300 dark:hover:border-indigo-800"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                                            <Link href={card.href} className="after:absolute after:inset-0 focus:outline-none">
                                                {card.title}
                                            </Link>
                                        </h3>
                                        {card.lock === "sample" && (
                                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300" title="Free plans see a sample statement. Upgrade to build yours.">
                                                <Sparkles className="h-3 w-3" />Sample
                                            </span>
                                        )}
                                        {card.lock === "upgrade" && (
                                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300" title="Part of the Growth and Nonprofit plans">
                                                <LockKeyhole className="h-3 w-3" />PRO
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-2 flex-1 text-sm text-slate-600 dark:text-slate-400">{card.description}</p>
                                    {card.links ? (
                                        // The year-end card lists its steps; these sit above the card-wide link
                                        <ul className="relative z-10 mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                                            {card.links.map((l) => (
                                                <li key={l.href}>
                                                    <Link href={l.href} className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline">{l.label}</Link>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400">
                                            Open <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )
            })}
        </div>
    )
}
