// The dashboard's setup bar (Phase 6, onboarding; shown as a single row since the dashboard redesign): the first things to do in Outlayd,
// each ticked off from what is really in the organisation's records, never from clicks. Paid steps are
// only listed on a paid plan (a free organisation is shown the sample statements instead).

export interface OnboardingProgress {
    documents: number
    approvedDocuments: number
    members: number
    openingComplete: boolean
    moneyIn: number
    reconciliations: number
}

export interface GettingStartedStep {
    key: string
    title: string
    text: string
    href: string
    done: boolean
}

export function gettingStartedSteps(p: OnboardingProgress, paid: boolean): GettingStartedStep[] {
    const steps: GettingStartedStep[] = [
        { key: "upload", title: "Upload your first receipt or bill", text: "Use Upload receipt at the top of the dashboard, or drop a photo or PDF anywhere on it. Outlayd reads the payee, date and amount for you.", href: "/inbox", done: p.documents > 0 },
        { key: "approve", title: "Check it and approve it", text: "Open it from the Inbox, check the amount, category and fund, then approve it.", href: "/inbox?status=needs_review", done: p.approvedDocuments > 0 },
    ]
    if (paid) {
        steps.push(
            { key: "money_in", title: "Record money in", text: "A donation, grant or fee, with a numbered receipt for the donor if you like.", href: "/transactions?new=money_in", done: p.moneyIn > 0 },
            { key: "opening", title: "Set your opening position", text: "Your bank balances, what is owed and what you own on your start date. Your statements start from here.", href: "/settings/opening-position", done: p.openingComplete },
            { key: "reconcile", title: "Reconcile a month-end", text: "Enter the closing balance from your bank statement and see that it agrees.", href: "/bank?tab=reconciliation", done: p.reconciliations > 0 },
            { key: "team", title: "Invite your team", text: "Add your treasurer or bookkeeper as an Editor, and committee members as Viewers.", href: "/settings?tab=team", done: p.members > 1 },
        )
    }
    return steps
}
