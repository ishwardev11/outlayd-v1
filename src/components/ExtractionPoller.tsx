"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { getExtractingCount } from "@/app/actions/aggregates"

/**
 * Uploads return immediately and the AI extraction finishes in the background. While any document
 * is still "extracting", this checks every couple of seconds how many are left (one tiny count
 * query) and only re-fetches the whole page when that number changes, so a finished document shows
 * up within about 2 seconds without reloading the ledger, funds and categories every time.
 *
 * It pauses while the tab is hidden and checks straight away when the tab comes back. It stops by
 * itself after a few minutes. Stuck extractions are handed to a person after 2 minutes (see
 * getExtractingCount, which also does that sweep), so the poll normally ends well before that.
 */
export function ExtractionPoller({
    count,
    intervalMs = 2000,
    maxMinutes = 5,
}: {
    /** How many documents are extracting right now, as counted by the server render */
    count: number
    intervalMs?: number
    maxMinutes?: number
}) {
    const router = useRouter()
    const active = count > 0
    // The last count we saw, so we only refresh the page when something has changed
    const lastSeen = useRef(count)
    useEffect(() => {
        lastSeen.current = count
    }, [count])

    useEffect(() => {
        if (!active) return
        let cancelled = false
        let timer: ReturnType<typeof setTimeout> | undefined
        const startedAt = Date.now()

        const check = async () => {
            if (cancelled) return
            if (Date.now() - startedAt > maxMinutes * 60_000) {
                router.refresh() // one last refresh so the page is not left out of date
                return
            }
            if (!document.hidden) {
                try {
                    const current = await getExtractingCount()
                    if (cancelled) return
                    if (current !== lastSeen.current) {
                        lastSeen.current = current
                        router.refresh()
                        if (current === 0) return // all done; the page re-renders without the poller
                    }
                } catch (error) {
                    console.error("Could not check extraction progress:", error)
                }
            }
            timer = setTimeout(check, intervalMs)
        }

        const onVisible = () => {
            if (!document.hidden) {
                if (timer) clearTimeout(timer)
                void check()
            }
        }

        timer = setTimeout(check, intervalMs)
        document.addEventListener("visibilitychange", onVisible)
        return () => {
            cancelled = true
            if (timer) clearTimeout(timer)
            document.removeEventListener("visibilitychange", onVisible)
        }
    }, [active, intervalMs, maxMinutes, router])

    return null
}
