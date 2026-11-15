"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { acceptPendingInvite, declinePendingInvite } from "@/app/actions/settings"

export interface PendingInvite {
    id: string
    organization_name: string
    role: string
}

export function PendingInviteBanner({ invites }: { invites: PendingInvite[] }) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [handled, setHandled] = useState<string[]>([])
    const [error, setError] = useState<string | null>(null)

    const visible = invites.filter((i) => !handled.includes(i.id))
    if (visible.length === 0) return null

    const respond = (id: string, action: "accept" | "decline") => {
        setError(null)
        startTransition(async () => {
            const res = action === "accept" ? await acceptPendingInvite(id) : await declinePendingInvite(id)
            if (!res.success) {
                setError(("message" in res && res.message) || "Something went wrong.")
                return
            }
            setHandled((h) => [...h, id])
            if (action === "accept") router.push("/dashboard")
            router.refresh()
        })
    }

    return (
        <div className="m-3 sm:m-4 space-y-2">
            {visible.map((invite) => (
                <div
                    key={invite.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/30 px-4 py-3"
                >
                    <Mail className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    <p className="flex-1 text-sm text-slate-800 dark:text-slate-200">
                        You&apos;ve been invited to join <span className="font-semibold">{invite.organization_name}</span> as {invite.role}.
                    </p>
                    <div className="flex gap-2">
                        <Button size="sm" disabled={isPending} onClick={() => respond(invite.id, "accept")} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                            Accept
                        </Button>
                        <Button size="sm" variant="outline" disabled={isPending} onClick={() => respond(invite.id, "decline")}>
                            Decline
                        </Button>
                    </div>
                </div>
            ))}
            {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
    )
}
