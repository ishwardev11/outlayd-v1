"use client"

import { useState } from "react"
import { inviteTeamMember } from "@/app/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, UserPlus, Mail, ShieldAlert } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"

interface TeamMember {
    id: string;
    full_name: string | null;
    email: string;
    role: string;
    created_at: string;
}

export function TeamManagementTab({ initialTeam }: { initialTeam: TeamMember[] }) {
    const [isInviting, setIsInviting] = useState(false)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [email, setEmail] = useState("")
    const [fullName, setFullName] = useState("")
    const [role, setRole] = useState("Viewer")

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsInviting(true)
        try {
            await inviteTeamMember(email, fullName, role)
            setIsModalOpen(false)
            setEmail("")
            setFullName("")
            setRole("Viewer")
        } catch (error) {
            console.error(error)
            alert("Failed to invite team member. They might already be invited.")
        } finally {
            setIsInviting(false)
        }
    }

    const getRoleColor = (r: string) => {
        switch (r) {
            case 'Admin': return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800'
            case 'Treasurer': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'
            default: return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Team Members</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage who has access to this organization&apos;s data.</p>
                </div>

                <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-indigo-600 hover:bg-indigo-700">
                            <UserPlus className="w-4 h-4 mr-2" />
                            Invite Member
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[425px]">
                        <DialogHeader>
                            <DialogTitle>Invite Team Member</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleInvite} className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label htmlFor="fullName">Full Name</Label>
                                <Input
                                    id="fullName"
                                    placeholder="Jane Doe"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email Address</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                                    <Input
                                        id="email"
                                        type="email"
                                        placeholder="jane@example.com"
                                        className="pl-9"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Role</Label>
                                <Select value={role} onValueChange={setRole}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select a role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Admin">Admin</SelectItem>
                                        <SelectItem value="Treasurer">Treasurer</SelectItem>
                                        <SelectItem value="Viewer">Viewer</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-slate-500 pt-1">
                                    Admins have full access. Treasurers can approve transactions. Viewers have read-only access.
                                </p>
                            </div>
                            <Button type="submit" disabled={isInviting} className="w-full bg-indigo-600 hover:bg-indigo-700 mt-4">
                                {isInviting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                                Send Request
                            </Button>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="border border-slate-200 dark:border-slate-700/50 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
                <table className="w-full text-sm text-left align-middle border-collapse">
                    <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700/50">
                        <tr>
                            <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-300">Member</th>
                            <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-300">Role</th>
                            <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-300">Joined</th>
                            <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-300 text-right">Access</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                        {initialTeam.map(member => (
                            <tr key={member.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                <td className="px-4 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold uppercase shrink-0">
                                            {member.full_name ? member.full_name.charAt(0) : member.email.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-medium text-slate-900 dark:text-white">{member.full_name || 'Pending Invite'}</p>
                                            <p className="text-slate-500 dark:text-slate-400 text-xs">{member.email}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-4">
                                    <Badge variant="outline" className={getRoleColor(member.role)}>
                                        {member.role}
                                    </Badge>
                                </td>
                                <td className="px-4 py-4 text-slate-500 dark:text-slate-400">
                                    {new Date(member.created_at).toLocaleDateString()}
                                </td>
                                <td className="px-4 py-4 text-right">
                                    <Button variant="ghost" size="sm" className="text-slate-400 dark:text-slate-400 dark:hover:text-red-400 hover:text-red-600">
                                        Revoke
                                    </Button>
                                </td>
                            </tr>
                        ))}
                        {initialTeam.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-4 py-12 text-center text-slate-500">
                                    <ShieldAlert className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                                    No team members found. Invite someone to collaborate!
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
