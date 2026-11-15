"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { getMyWorkspaces, switchWorkspace } from "@/app/actions/settings"

export function WorkspaceSwitcher() {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [data, setData] = useState<{ workspaces: { id: string; name: string; role: string }[]; activeId: string | null }>({ workspaces: [], activeId: null })

    useEffect(() => {
        getMyWorkspaces().then(setData).catch(() => { })
    }, [])

    if (data.workspaces.length < 2) return null // nothing to switch between

    return (
        <select
            value={data.activeId ?? ""}
            disabled={isPending}
            onChange={(e) => {
                const id = e.target.value
                startTransition(async () => {
                    const res = await switchWorkspace(id)
                    if (res.success) {
                        setData((d) => ({ ...d, activeId: id }))
                        router.push("/dashboard")
                        router.refresh()
                    }
                })
            }}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-700 dark:text-slate-200 px-3 py-2"
            aria-label="Switch workspace"
        >
            {data.workspaces.map((w) => (
                <option key={w.id} value={w.id}>{w.name} ({w.role})</option>
            ))}
        </select>
    )
}
