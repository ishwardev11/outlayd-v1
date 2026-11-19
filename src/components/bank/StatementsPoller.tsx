"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { getBankStatementProcessingCount } from "@/app/actions/bank-statements"

// While a statement is being read, check every few seconds and refresh the page when it finishes.
// It stops by itself after 4 minutes (a stuck statement is marked failed after 3).
export function StatementsPoller({ active }: { active: boolean }) {
    const router = useRouter()
    useEffect(() => {
        if (!active) return
        const startedAt = Date.now()
        const timer = setInterval(async () => {
            if (Date.now() - startedAt > 4 * 60 * 1000) {
                clearInterval(timer)
                return
            }
            try {
                const count = await getBankStatementProcessingCount()
                if (count === 0) {
                    clearInterval(timer)
                    router.refresh()
                }
            } catch {
                // try again on the next tick
            }
        }, 3000)
        return () => clearInterval(timer)
    }, [active, router])
    return null
}
