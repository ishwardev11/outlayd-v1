"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ChevronUp, HelpCircle, LogOut, Monitor, Moon, Palette, Sun, Type, UserRound } from "lucide-react"
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem,
    DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { signOutAction } from "@/app/actions/auth"
import { createClient } from "@/utils/supabase/client"
import { useTheme } from "@/components/ThemeProvider"
import { useRole } from "@/components/RoleProvider"

type FontSize = "small" | "medium" | "large"

function applyFontSize(size: FontSize) {
    localStorage.setItem("app-font-size", size)
    document.documentElement.style.fontSize = size === "small" ? "14px" : size === "large" ? "18px" : "16px"
}

// The profile menu at the bottom of the sidebar (simplification step 6): the signed-in person's own
// things, which used to be the General tab of Settings. Account shows the login email; Theme and text
// size are kept in this browser, as before; Help & Support and Sign out moved here from the sidebar.
export function ProfileMenu({ onHelp, onNavigate }: { onHelp: () => void; onNavigate?: () => void }) {
    const { theme, setTheme } = useTheme()
    const { role } = useRole()
    const [email, setEmail] = useState<string | null>(null)
    const [fontSize, setFontSize] = useState<FontSize>("medium")
    const [accountOpen, setAccountOpen] = useState(false)
    const signOutForm = useRef<HTMLFormElement>(null)

    useEffect(() => {
        let cancelled = false
        createClient().auth.getUser().then(({ data }) => { if (!cancelled) setEmail(data.user?.email ?? null) })
        const saved = localStorage.getItem("app-font-size")
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only exists in the browser
        if (saved === "small" || saved === "large" || saved === "medium") setFontSize(saved)
        // /settings?tab=general (the old General tab) arrives here with ?account=1: open the Account window
        if (new URLSearchParams(window.location.search).get("account") === "1") setAccountOpen(true)
        return () => { cancelled = true }
    }, [])

    const initial = (email ?? "?").charAt(0).toUpperCase()

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button type="button" id="profile-menu" data-testid="profile-menu" aria-label="Your profile"
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-900 hover:text-slate-900 dark:hover:text-white transition-colors">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">{initial}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{email ?? "Your profile"}</span>
                        <ChevronUp className="h-4 w-4 shrink-0" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="start" className="w-60">
                    <DropdownMenuLabel className="truncate font-normal text-xs text-slate-500">{email ?? "Signed in"}{role ? ` · ${role}` : ""}</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => setAccountOpen(true)}>
                        <UserRound className="h-4 w-4" />Account
                    </DropdownMenuItem>
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger><Palette className="h-4 w-4" />Theme</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as "light" | "dark" | "system")}>
                                <DropdownMenuRadioItem value="light"><Sun className="h-4 w-4" />Light</DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="dark"><Moon className="h-4 w-4" />Dark</DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="system"><Monitor className="h-4 w-4" />Same as this device</DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                        <DropdownMenuSubTrigger><Type className="h-4 w-4" />Text size</DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                            <DropdownMenuRadioGroup value={fontSize} onValueChange={(v) => { setFontSize(v as FontSize); applyFontSize(v as FontSize) }}>
                                <DropdownMenuRadioItem value="small">Small</DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="medium">Medium</DropdownMenuRadioItem>
                                <DropdownMenuRadioItem value="large">Large</DropdownMenuRadioItem>
                            </DropdownMenuRadioGroup>
                        </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuItem onSelect={onHelp}>
                        <HelpCircle className="h-4 w-4" />Help &amp; Support
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => signOutForm.current?.requestSubmit()} className="text-red-600 focus:text-red-700">
                        <LogOut className="h-4 w-4" />Sign out
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
            <form ref={signOutForm} action={signOutAction} className="hidden" aria-hidden="true" />

            <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Account</DialogTitle>
                        <DialogDescription>The login you use for Outlayd.</DialogDescription>
                    </DialogHeader>
                    <dl className="space-y-3 text-sm" data-testid="account-dialog">
                        <div><dt className="text-xs text-slate-500">Login email</dt><dd className="font-medium text-slate-900 dark:text-white break-all">{email ?? "…"}</dd></div>
                        {role && <div><dt className="text-xs text-slate-500">Your role in this organisation</dt><dd className="font-medium text-slate-900 dark:text-white">{role}</dd></div>}
                    </dl>
                    <p className="text-xs text-slate-500">
                        To change your login email, <Link href="/contact" className="text-indigo-600 hover:underline" onClick={() => { setAccountOpen(false); onNavigate?.() }}>contact support</Link>.
                        Team roles are managed by an Admin in Settings, Team.
                    </p>
                </DialogContent>
            </Dialog>
        </>
    )
}
