// Rows of the procurement tables, as the procurement screens and actions read them

export interface ProcurementProject {
    id: string
    organization_id: string
    title: string
    status: string
    budget_ceiling: number | string | null
    required_deadline: string | null
    mandatory_requirements: string[] | null
}

export interface QuoteRow {
    id: string
    vendor_name: string | null
    total_amount: number | string | null
    payment_terms: string | null
    status?: string | null
    is_awarded?: boolean | null
    is_recommended?: boolean | null
    ai_recommendation_status: string | null
    ai_rationale: string | null
    extracted_data?: unknown
    notes: string | null
    file_url?: string | null
    file_size?: string | null
    created_at?: string | null
}
