"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

export function AuthHashRedirect() {
    const router = useRouter()

    useEffect(() => {
        if (typeof window === "undefined") return

        const hash = window.location.hash
        if (!hash) return

        // Check if the hash contains error parameters from a failed Supabase redirect
        if (hash.includes("error=") || hash.includes("error_description=")) {
            const hashClean = hash.substring(1) // remove '#'
            const params = new URLSearchParams(hashClean)
            const error = params.get("error")
            const errorCode = params.get("error_code")
            const errorDesc = params.get("error_description")

            if (error || errorCode || errorDesc) {
                const searchParams = new URLSearchParams()
                if (error) searchParams.set("error", error)
                if (errorCode) searchParams.set("error_code", errorCode)
                if (errorDesc) searchParams.set("error_description", errorDesc)

                // Clean the hash from the address bar to avoid infinite redirection loops or confusion
                window.history.replaceState(null, "", window.location.pathname + window.location.search)

                // Redirect to accept-invite page with the error details in the query parameters
                router.replace(`/accept-invite?${searchParams.toString()}`)
            }
        }
    }, [router])

    return null
}
