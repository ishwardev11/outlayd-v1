"use client"

import { useState } from "react"
import { inviteTeamMember, revokeTeamMember } from "@/app/actions/settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, UserPlus, Mail, ShieldAlert } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { UpgradePaywallModal } from "@/components/ui/UpgradePaywallModal"
import { useRole } from "@/components/RoleProvider"
import { OrgSettings, TeamMember } from "./SettingsLayout"

export function TeamManagementTab({ initialTeam, orgSettings }: { initialTeam: TeamMember[], orgSettings: OrgSettings | null }) {
    const [isInviting, setIsInviting] = useState(false)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isPaywallOpen, setIsPaywallOpen] = useState(false)
    const { isViewer } = useRole()
    const [email, setEmail] = useState("")
    const [fullName, setFullName] = useState("")
    const [role, setRole] = useState("Editor")

    // Revoke states
    const [memberToRevoke, setMemberToRevoke] = useState<TeamMember | null>(null)
    const [isRevoking, setIsRevoking] = useState(false)

    const isGrowth = orgSettings?.subscription_tier === 'growth' || orgSettings?.subscription_status === 'pro';
    const limit = isGrowth ? 5 : 1;
    const usedSeats = initialTeam.length;
    const isLimitReached = usedSeats >= limit;

    const handleRevoke = async () => {
        if (!memberToRevoke) return
        setIsRevoking(true)
        try {
            await revokeTeamMember(memberToRevoke.id)
            setMemberToRevoke(null)
        } catch (error) {
            console.error(error)
            alert("Failed to revoke team member access.")
        } finally {
            setIsRevoking(false)
        }
    }

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsInviting(true)
        try {
            const result = await inviteTeamMember(email, fullName, role)
            if (result && !result.success) {
                if (result.error === "LIMIT_REACHED") {
                    setIsModalOpen(false)
                    setIsPaywallOpen(true)
                } else {
                    alert(result.message || "Failed to invite team member.")
                }
            } else {
                setIsModalOpen(false)
                setEmail("")
                setFullName("")
                setRole("Editor")
            }
        } catch (error: unknown) {
            const err = error as Error;
            console.error(err)
            alert(err.message || "Failed to invite team member. They might already be invited.")
        } finally {
            setIsInviting(false)
        }
    }

    const getRoleColor = (r: string) => {
        switch (r) {
            case 'Admin': return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-800'
            case 'Editor': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800'
            case 'Viewer': return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800'
            default: return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3">
                        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Team Members</h2>
                        <div className="flex items-center gap-1.5 text-xs bg-slate-100 dark:bg-slate-800/80 px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700/60 font-medium">
                            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{usedSeats}</span>
                            <span className="text-slate-400">/</span>
                            <span className="text-slate-600 dark:text-slate-300">{limit} Seats Used</span>
                        </div>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage who has access to this organization&apos;s data.</p>
                </div>

                <Dialog open={isModalOpen} onOpenChange={(open) => {
                    if (open && isLimitReached) {
                        setIsPaywallOpen(true)
                    } else {
                        setIsModalOpen(open)
                    }
                }}>
                    <DialogTrigger asChild>
                        <Button className="bg-indigo-600 hover:bg-indigo-700" disabled={isViewer} title={isViewer ? "Viewers cannot invite team members" : ""}>
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
                                <Label htmlFor="role">Role</Label>
                                <Select value={role} onValueChange={setRole}>
                                    <SelectTrigger id="role">
                                        <SelectValue placeholder="Select a role" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Editor">Editor (Write Access)</SelectItem>
                                        <SelectItem value="Viewer">Viewer (Read Only)</SelectItem>
                                    </SelectContent>
                                </Select>
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
                                    {!isViewer && (
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="text-slate-400 dark:text-slate-400 dark:hover:text-red-400 hover:text-red-600"
                                            onClick={() => setMemberToRevoke(member)}
                                        >
                                            Revoke
                                        </Button>
                                    )}
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

            <UpgradePaywallModal
                isOpen={isPaywallOpen}
                onClose={() => setIsPaywallOpen(false)}
                context="team_limit"
            />

            {/* Revoke Member Confirmation Modal */}
            <Dialog open={!!memberToRevoke} onOpenChange={(open) => { if (!open) setMemberToRevoke(null) }}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle className="text-slate-900 dark:text-white">Revoke Team Member Access?</DialogTitle>
                        <DialogDescription className="text-slate-500 dark:text-slate-400 mt-2">
                            Are you sure you want to revoke access for <span className="font-semibold text-slate-800 dark:text-slate-200">{memberToRevoke?.full_name || memberToRevoke?.email}</span>? 
                            This action will immediately remove their access permissions to this organization.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="mt-6 flex gap-2">
                        <Button 
                            variant="outline" 
                            onClick={() => setMemberToRevoke(null)}
                            disabled={isRevoking}
                        >
                            Cancel
                        </Button>
                        <Button 
                            className="bg-red-600 hover:bg-red-700 text-white" 
                            onClick={handleRevoke}
                            disabled={isRevoking}
                        >
                            {isRevoking ? "Revoking..." : "Yes, Revoke"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
