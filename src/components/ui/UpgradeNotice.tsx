"use client"

import { useState, type ReactNode } from "react"
import { Lock, Sparkles } from "lucide-react"
import { UpgradePaywallModal, type PaywallContext } from "./UpgradePaywallModal"
import { usePlan } from "@/components/PlanProvider"

// Opens the upgrade window for one feature. Buttons of paid features call open() on the Free plan instead
// of doing nothing, so people can see what they would get. Only what is shown: the server and the
// database refuse paid changes on the Free plan regardless.
export function usePaywall(context: PaywallContext) {
    const [open, setOpen] = useState(false)
    return {
        open: () => setOpen(true),
        modal: <UpgradePaywallModal isOpen={open} onClose={() => setOpen(false)} context={context} />,
    }
}

// The amber note on a page whose feature is paid, with a button to see what the upgrade includes.
// A downgraded organisation (it has been on a paid plan) is told its data stays available to view.
export function UpgradeNotice({ context, children, className = "" }: { context: PaywallContext; children: ReactNode; className?: string }) {
    const paywall = usePaywall(context)
    const { hasBeenPaid } = usePlan()
    return (
        <div className={`flex flex-wrap items-start gap-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-200 ${className}`} data-testid="upgrade-notice">
            <Lock className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-[14rem]">
                {children}
                {hasBeenPaid && <span className="block mt-1">Everything you recorded while subscribed stays available to view and export.</span>}
            </div>
            <button type="button" onClick={paywall.open}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
                <Sparkles className="h-3.5 w-3.5" />See what you get
            </button>
            {paywall.modal}
        </div>
    )
}
