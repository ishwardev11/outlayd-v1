"use client"

import { createContext, useContext, type ReactNode } from "react"

// The organisation's plan, loaded once on the server by the dashboard layout (from the database's
// org_plan_state, the same rule row-level security uses). Screens use it to show paid features as
// locked or read-only. It only decides what is shown: the server and the database enforce the rules.
export interface PlanContextValue {
    paid: boolean
    hasBeenPaid: boolean
}

const PlanContext = createContext<PlanContextValue>({ paid: false, hasBeenPaid: false })

export function PlanProvider({ paid, hasBeenPaid, children }: PlanContextValue & { children: ReactNode }) {
    return <PlanContext.Provider value={{ paid, hasBeenPaid }}>{children}</PlanContext.Provider>
}

export function usePlan(): PlanContextValue {
    return useContext(PlanContext)
}
