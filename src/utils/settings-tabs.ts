// The Settings tabs (simplification step 6), in order. Pure, so the order and the old links are tested.
// General is gone: the login email and theme are in the profile menu at the bottom of the sidebar.
// Ids of tabs that already existed stay the same, so old links such as ?tab=financial keep working.

export type SettingsTabId = "organization" | "financial" | "accounts" | "assets" | "letterhead" | "team" | "billing"

export const SETTINGS_TABS: { id: SettingsTabId; label: string }[] = [
    { id: "organization", label: "Organisation" },
    { id: "financial", label: "Funds & Categories" },
    { id: "accounts", label: "Accounts" },
    { id: "assets", label: "Assets & Loans" },
    { id: "letterhead", label: "Letterhead & numbering" },
    { id: "team", label: "Team" },
    { id: "billing", label: "Billing" },
]

// The tab to open for ?tab=… (anything unknown, including the old "general", opens Organisation)
export function settingsTab(requested: string | null | undefined): SettingsTabId {
    return SETTINGS_TABS.find((t) => t.id === requested)?.id ?? "organization"
}
