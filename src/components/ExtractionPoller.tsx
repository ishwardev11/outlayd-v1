"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/**
 * Uploads return immediately and the AI extraction finishes in the background. While any document
 * is still "extracting", re-fetch the page every few seconds so the result appears on its own.
 * It stops by itself after a few minutes. Stuck extractions are handed to a person after 2 minutes
 * (see getExtractingCount), so the poll normally ends well before that.
 */
export function ExtractionPoller({
    active,
    intervalMs = 4000,
    maxMinutes = 5,
}: {
    active: boolean
    intervalMs?: number
    maxMinutes?: number
}) {
    const router = useRouter()

    useEffect(() => {
        if (!active) return
        const startedAt = Date.now()
        const timer = setInterval(() => {
            if (Date.now() - startedAt > maxMinutes * 60_000) {
                clearInterval(timer)
                return
            }
            router.refresh()
        }, intervalMs)
        return () => clearInterval(timer)
    }, [active, intervalMs, maxMinutes, router])

    return null
}
