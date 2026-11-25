/** Shared types for the dashboard's totals (the database function dashboard_summary). */

export interface CashFlowPoint {
    date: string
    displayDate: string
    amount: number
}

export interface DashboardSummary {
    awaitingTotal: number
    needsReviewCount: number
    needsReviewTotal: number
    paidThisMonth: number
    cashFlow: CashFlowPoint[]
}
