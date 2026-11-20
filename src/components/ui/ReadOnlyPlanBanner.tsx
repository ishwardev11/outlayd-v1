import { Lock } from "lucide-react"

// Shown on a paid feature when the organisation is no longer on a paid plan: its existing data stays
// visible, read-only, and nothing has been deleted.
export function ReadOnlyPlanBanner({ feature }: { feature: string }) {
    return (
        <div className="flex gap-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-900 dark:text-amber-200">
            <Lock className="h-4 w-4 shrink-0 mt-0.5" />
            <p>
                <span className="font-semibold">{feature} is read-only on your current plan.</span>{" "}
                Everything you created is kept and can still be viewed. Upgrade to the Growth or Nonprofit plan
                under Settings, Billing &amp; Subscription to make changes again.
            </p>
        </div>
    )
}
