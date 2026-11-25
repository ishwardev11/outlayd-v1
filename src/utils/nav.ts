// The app's navigation (simplification step 8), the same in the sidebar and in the phone menu, which
// shows the sidebar inside its drawer. Pure, so the order, the labels and which item lights up for
// each page are tested. Settings is listed last and sits at the bottom, above the profile menu.
//
// Pages without their own item light up the item they belong to: Donor & Audit Memo, the statements and
// the Year end hub are under Reports; the audit log is reached from Reports > Year end; Assets & Loans
// and the opening position are under Settings.

export type NavId = "dashboard" | "inbox" | "transactions" | "invoices" | "payees" | "reports" | "bank" | "settings"

export interface NavItem {
    id: NavId
    label: string
    href: string
    // A free organisation that has never paid sees a lock badge: the page is only a locked screen for it
    paidOnly?: boolean
}

export const NAV_ITEMS: NavItem[] = [
    { id: "dashboard", label: "Dashboard", href: "/dashboard" },
    { id: "inbox", label: "Inbox", href: "/inbox" },
    { id: "transactions", label: "Transactions", href: "/transactions" },
    { id: "invoices", label: "Bills & Invoices", href: "/invoices" },
    { id: "payees", label: "Payees", href: "/payees" },
    { id: "reports", label: "Reports", href: "/reports" },
    { id: "bank", label: "Bank", href: "/bank", paidOnly: true },
    { id: "settings", label: "Settings", href: "/settings" },
]

// Pages that belong to an item without starting with its address
const ALSO_UNDER: Partial<Record<NavId, string[]>> = {
    reports: ["/audit-log"],
}

const under = (pathname: string, base: string) => pathname === base || pathname.startsWith(base + "/")

// The item to light up for a page, or null (onboarding, for instance)
export function activeNav(pathname: string): NavId | null {
    for (const item of NAV_ITEMS) {
        if (under(pathname, item.href)) return item.id
        if ((ALSO_UNDER[item.id] ?? []).some((p) => under(pathname, p))) return item.id
    }
    return null
}

// Whether the lock badge shows: only once the plan is known (null while loading), for a free
// organisation that has never paid. A downgraded one keeps read-only access to what it recorded.
export function showLockBadge(item: NavItem, plan: { paid: boolean | null; hasBeenPaid: boolean }): boolean {
    return !!item.paidOnly && plan.paid === false && !plan.hasBeenPaid
}
