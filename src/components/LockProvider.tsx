"use client"

import { createContext, useContext, type ReactNode } from "react"
import { Lock } from "lucide-react"
import { isLockedDate, isOpeningLocked, lockedMessage } from "@/utils/lock"

// The lock date of the organisation, loaded once by the dashboard layout. Screens use it to show locked
// records as read-only before anyone tries to change them; the database refuses such changes anyway.
interface LockContextValue {
    lockDate: string | null
    startDate: string | null
}

const LockContext = createContext<LockContextValue>({ lockDate: null, startDate: null })

export function LockProvider({ lockDate, startDate, children }: LockContextValue & { children: ReactNode }) {
    return <LockContext.Provider value={{ lockDate, startDate }}>{children}</LockContext.Provider>
}

export function useLock() {
    const { lockDate, startDate } = useContext(LockContext)
    return {
        lockDate,
        isLocked: (date: string | null | undefined) => isLockedDate(date, lockDate),
        openingLocked: isOpeningLocked(lockDate, startDate),
        message: lockDate ? lockedMessage(lockDate) : "",
    }
}

// A small amber notice for a record in a locked period
export function LockedNotice({ text, className = "" }: { text?: string; className?: string }) {
    const { message } = useLock()
    return (
        <div role="note" className={`flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-sm text-amber-800 dark:text-amber-300 ${className}`}>
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{text ?? message}</span>
        </div>
    )
}
