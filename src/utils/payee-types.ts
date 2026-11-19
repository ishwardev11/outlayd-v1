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
