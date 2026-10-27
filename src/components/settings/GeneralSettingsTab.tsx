"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Lock, Mail, Monitor, Moon, Sun, Type } from "lucide-react"
import { useTheme } from "@/components/ThemeProvider"

export function GeneralSettingsTab() {
    const [isLoadingEmail, setIsLoadingEmail] = useState(false)
    const [isLoadingPassword, setIsLoadingPassword] = useState(false)
    const { theme, setTheme } = useTheme()
    const [fontSize, setFontSize] = useState("medium")

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFontSize(localStorage.getItem('app-font-size') || 'medium')
    }, [])

    const handleThemeChange = (newTheme: "light" | "dark" | "system") => {
        setTheme(newTheme)
    }

    const handleFontSizeChange = (newSize: string) => {
        setFontSize(newSize)
        localStorage.setItem('app-font-size', newSize)
        const d = document.documentElement
        if (newSize === 'small') d.style.fontSize = '14px'
        else if (newSize === 'large') d.style.fontSize = '18px'
        else d.style.fontSize = '16px'
    }

    const handleUpdateEmail = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoadingEmail(true)
        // Simulate API call
        setTimeout(() => {
            setIsLoadingEmail(false)
            alert("Check your new email address for a confirmation link.")
        }, 1000)
    }

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoadingPassword(true)
        // Simulate API call
        setTimeout(() => {
            setIsLoadingPassword(false)
            alert("Password updated successfully.")
        }, 1000)
    }

    return (
        <div className="space-y-12">

            {/* Account Information */}
            <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                    <Mail className="w-5 h-5 text-indigo-500" />
                    Account Settings
                </h2>

                <div className="space-y-6">
                    <form onSubmit={handleUpdateEmail} className="bg-slate-50 dark:bg-slate-800 p-6 rounded-xl border border-slate-100 dark:border-slate-700">
                        <div className="space-y-4 max-w-md">
                            <div>
                                <Label htmlFor="email" className="text-slate-700 dark:text-white">Email Address</Label>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">Update your login email address.</p>
                                <Input id="email" type="email" placeholder="new@example.com" required className="dark:bg-slate-900 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 dark:focus:border-indigo-500" />
                            </div>
                            <Button type="submit" disabled={isLoadingEmail} className="bg-indigo-600 hover:bg-indigo-700">
                                {isLoadingEmail ? "Updating..." : "Update Email"}
                            </Button>
                        </div>
                    </form>

                    <form onSubmit={handleUpdatePassword} className="bg-slate-50 dark:bg-slate-800 p-6 rounded-xl border border-slate-100 dark:border-slate-700">
                        <div className="space-y-4 max-w-md">
                            <h3 className="font-medium text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                                <Lock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                                Security
                            </h3>
                            <div>
                                <Label htmlFor="current-password" className="dark:text-white">Current Password</Label>
                                <Input id="current-password" type="password" required className="mt-1 dark:bg-slate-900 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 dark:focus:border-indigo-500" />
                            </div>
                            <div>
                                <Label htmlFor="new-password" className="dark:text-white">New Password</Label>
                                <Input id="new-password" type="password" required className="mt-1 dark:bg-slate-900 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 dark:focus:border-indigo-500" />
                            </div>
                            <div>
                                <Label htmlFor="confirm-password" className="dark:text-white">Confirm New Password</Label>
                                <Input id="confirm-password" type="password" required className="mt-1 dark:bg-slate-900 dark:border-slate-700 dark:text-white dark:placeholder-slate-500 dark:focus:border-indigo-500" />
                            </div>
                            <Button type="submit" disabled={isLoadingPassword} className="bg-indigo-600 hover:bg-indigo-700 mt-2">
                                {isLoadingPassword ? "Updating..." : "Update Password"}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>

            {/* Application Preferences */}
            <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                    <Monitor className="w-5 h-5 text-indigo-500" />
                    Application Preferences
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Theme Selection */}
                    <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-xl border border-slate-100 dark:border-slate-700">
                        <h3 className="font-medium text-slate-900 dark:text-white mb-4">Color Theme</h3>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => handleThemeChange("light")}
                                className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${theme === "light" ? "border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-600 dark:border-indigo-500 dark:bg-indigo-900/20 dark:text-white" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 hover:dark:border-slate-500 text-slate-700 dark:text-slate-300"}`}
                            >
                                <Sun className="w-5 h-5" />
                                <div>
                                    <div className="font-medium">Light</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">Bright and clean appearance</div>
                                </div>
                            </button>
                            <button
                                onClick={() => handleThemeChange("dark")}
                                className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${theme === "dark" ? "border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-600 dark:border-indigo-500 dark:bg-indigo-900/20 dark:text-white" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 hover:dark:border-slate-500 text-slate-700 dark:text-slate-300"}`}
                            >
                                <Moon className="w-5 h-5" />
                                <div>
                                    <div className="font-medium">Dark</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">Easier on the eyes in low light</div>
                                </div>
                            </button>
                            <button
                                onClick={() => handleThemeChange("system")}
                                className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${theme === "system" ? "border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-600 dark:border-indigo-500 dark:bg-indigo-900/20 dark:text-white" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 hover:dark:border-slate-500 text-slate-700 dark:text-slate-300"}`}
                            >
                                <Monitor className="w-5 h-5" />
                                <div>
                                    <div className="font-medium">System</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">Matches your OS settings</div>
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Font Size Selection */}
                    <div className="bg-slate-50 dark:bg-slate-800 p-6 rounded-xl border border-slate-100 dark:border-slate-700">
                        <h3 className="font-medium text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                            <Type className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                            Interface Text Size
                        </h3>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => handleFontSizeChange("small")}
                                className={`p-3 rounded-lg border text-left transition-all ${fontSize === "small" ? "border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-600 dark:border-indigo-500 dark:bg-indigo-900/20 dark:text-white" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 hover:dark:border-slate-500 text-slate-700 dark:text-slate-300"}`}
                            >
                                <div className="font-medium text-sm">Compact (Small)</div>
                            </button>
                            <button
                                onClick={() => handleFontSizeChange("medium")}
                                className={`p-3 rounded-lg border text-left transition-all ${fontSize === "medium" ? "border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-600 dark:border-indigo-500 dark:bg-indigo-900/20 dark:text-white" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 hover:dark:border-slate-500 text-slate-700 dark:text-slate-300"}`}
                            >
                                <div className="font-medium text-base">Default (Medium)</div>
                            </button>
                            <button
                                onClick={() => handleFontSizeChange("large")}
                                className={`p-3 rounded-lg border text-left transition-all ${fontSize === "large" ? "border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-600 dark:border-indigo-500 dark:bg-indigo-900/20 dark:text-white" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 hover:dark:border-slate-500 text-slate-700 dark:text-slate-300"}`}
                            >
                                <div className="font-medium text-lg">Comfortable (Large)</div>
                            </button>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-4 leading-relaxed">
                            Changes will affect the navigation, tables, and general reading areas of the dashboard.
                        </p>
                    </div>
                </div>
            </div>

        </div>
    )
}
