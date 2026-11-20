// The kinds of payee. A payee is anyone money is paid to or received from.
export const PAYEE_TYPES = [
    { value: "vendor", label: "Vendor / supplier" },
    { value: "donor", label: "Donor" },
    { value: "member", label: "Member" },
    { value: "grantor", label: "Grantor" },
    { value: "customer", label: "Customer" },
    { value: "staff", label: "Staff" },
    { value: "other", label: "Other" },
] as const

export type PayeeType = (typeof PAYEE_TYPES)[number]["value"]

export const PAYEE_TYPE_VALUES: string[] = PAYEE_TYPES.map((t) => t.value)

export function payeeTypeLabel(value: string | null | undefined): string {
    return PAYEE_TYPES.find((t) => t.value === value)?.label ?? "Vendor / supplier"
}

// One row of the Payees screen: the payee plus totals worked out from its documents
export interface PayeeListItem {
    id: string
    name: string
    payee_type: string
    email: string | null
    phone: string | null
    address: string | null
    registration_number: string | null
    notes: string | null
    archived_at: string | null
    is_system: boolean
    default_category_id: string | null
    suggestedCategoryId: string | null
    suggestedCategoryName: string | null
    totalPaid: number
    totalUnpaid: number
    docCount: number
    lastActivity: string
    topCategory: string | null
}
