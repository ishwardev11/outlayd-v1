"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { updateCategoryAccountCode } from "@/app/actions/settings"

// Saves when the field loses focus. Reverts and tells the person if the save fails.
export function CategoryAccountCode({ id, initial, disabled }: { id: string; initial: string | null | undefined; disabled: boolean }) {
    const [value, setValue] = useState(initial ?? "")
    const [saved, setSaved] = useState(initial ?? "")
    const [saving, setSaving] = useState(false)

    const save = async () => {
        const next = value.trim()
        if (next === saved) {
            setValue(next)
            return
        }
        setSaving(true)
        try {
            await updateCategoryAccountCode(id, next)
            setSaved(next)
            setValue(next)
        } catch (e: any) {
            alert(e?.message || "Failed to save the account code")
            setValue(saved)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
            placeholder="Optional"
            maxLength={30}
            disabled={disabled || saving}
            aria-label="Accounting code"
            className="h-9 w-32 bg-white dark:bg-slate-900 dark:border-slate-700 dark:text-white dark:placeholder-slate-500"
        />
    )
}
