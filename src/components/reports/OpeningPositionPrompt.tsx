import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";

// Shown instead of wrong numbers until the opening position is complete (spec 5.6), or for a date
// before tracking started
export function OpeningPositionPrompt({ title, beforeStart }: { title: string; beforeStart?: string | null }) {
    return (
        <div className="space-y-6">
            <div>
                <Link href="/reports" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"><ArrowLeft className="h-4 w-4" /> Reports</Link>
                <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white">{title}</h1>
            </div>
            <div className="max-w-2xl rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/20 p-6" data-testid="opening-required">
                <ClipboardList className="h-8 w-8 text-indigo-600" />
                {beforeStart ? (
                    <>
                        <h2 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">Before your tracking start date</h2>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Balances are tracked from {beforeStart}. Choose a period that ends on or after it.</p>
                    </>
                ) : (
                    <>
                        <h2 className="mt-3 text-lg font-semibold text-slate-900 dark:text-white">Complete your opening position</h2>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                            This statement needs to know where things stood when you started: your bank balances, money owed, assets, loans and
                            fund balances. It takes a few minutes, and the statement balances from day one.
                        </p>
                        <Link href="/settings/opening-position" className="mt-4 inline-flex h-10 items-center rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700">
                            Set up the opening position
                        </Link>
                    </>
                )}
            </div>
        </div>
    );
}
