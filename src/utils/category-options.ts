// Allowed values for a category's expense group and income nature, shared by the Settings screen,
// the forms and the server (spec sections 3.3, 6.1 and 7).

// Income nature: the "Donation / Other income" choice is a filter on this
export const INCOME_NATURES = [
    { value: "donation", label: "Donations" },
    { value: "grant", label: "Grants" },
    { value: "membership", label: "Membership" },
    { value: "fundraising", label: "Fundraising" },
    { value: "programme_income", label: "Programme income" },
    { value: "other_income", label: "Other income" },
] as const

// Expense groups used by the Income & Expenditure statement. Nonprofits and small businesses group
// expenses differently; "Other" is stored as no group.
export const EXPENSE_GROUPS_NONPROFIT = ["Programme", "Staff", "Administration", "Fundraising"] as const
export const EXPENSE_GROUPS_BUSINESS = ["Cost of sales", "Operating expenses"] as const
export const OTHER_GROUP = "Other"

export function expenseGroupsFor(orgType: string | null | undefined): readonly string[] {
    return orgType === "small_business" ? EXPENSE_GROUPS_BUSINESS : EXPENSE_GROUPS_NONPROFIT
}

export function isIncomeNature(v: unknown): v is (typeof INCOME_NATURES)[number]["value"] {
    return INCOME_NATURES.some((n) => n.value === v)
}

export function isExpenseGroup(v: unknown): boolean {
    return typeof v === "string" && ([...EXPENSE_GROUPS_NONPROFIT, ...EXPENSE_GROUPS_BUSINESS] as string[]).includes(v)
}

export function natureLabel(v: string | null | undefined): string {
    return INCOME_NATURES.find((n) => n.value === v)?.label ?? "Other income"
}
