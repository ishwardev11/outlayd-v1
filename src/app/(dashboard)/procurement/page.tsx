import { createClient } from "@/utils/supabase/server"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Plus, Target, ArrowRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { getOrganizationId } from "@/app/actions/ledger"
import { getCurrentUserRole } from "@/app/actions/document-utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { DeleteProjectButton } from "@/components/procurement/DeleteProjectButton"

export default async function ProcurementPage() {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()
    const role = await getCurrentUserRole()
    const isViewer = role === 'Viewer'

    // --- Pro-tier gate ---
    const { data: org } = await supabase
        .from("organizations")
        .select("subscription_status, subscription_tier")
        .eq("id", organization_id)
        .single()

    const isPro = org?.subscription_status === "pro" || org?.subscription_tier === "growth";
    if (!isPro) {
        redirect("/dashboard")
    }
    // -------------------

    const { data: projects } = await supabase
        .from("procurement_projects")
        .select("*")
        .eq("organization_id", organization_id)
        .order("created_at", { ascending: false })

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Procurement</h1>
                    <p className="text-gray-500 mt-2 dark:text-slate-400">Manage Requests for Proposals (RFPs) and active quote evaluations.</p>
                </div>
                <Link href="/procurement/new" className={isViewer ? "pointer-events-none" : ""}>
                    <Button
                        className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm flex items-center gap-2"
                        disabled={isViewer}
                        title={isViewer ? "Viewers cannot create projects" : ""}
                    >
                        <Plus className="w-4 h-4" />
                        New Project
                    </Button>
                </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
                {projects?.map(project => (
                    <div key={project.id} className="relative group h-full">
                        <Link href={`/procurement/${project.id}`} className="block h-full">
                            <Card className="h-full bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:shadow-md transition-all">
                                <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg group-hover:bg-indigo-100 dark:group-hover:bg-indigo-500/20 transition-colors">
                                                <Target className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                            </div>
                                            <CardTitle className="text-xl pr-6 text-gray-900 dark:text-white">{project.title}</CardTitle>
                                        </div>
                                        <Badge variant="outline" className={
                                            project.status.toLowerCase() === 'awarded'
                                                ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                                                : "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/20"
                                        }>
                                            {project.status.replace("_", " ")}
                                        </Badge>
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <div className="flex items-center gap-6 mt-2">
                                        <div>
                                            <p className="text-xs text-gray-500 dark:text-slate-400 font-medium uppercase tracking-wider">Budget Ceiling</p>
                                            <p className="text-lg font-bold text-gray-900 dark:text-white mt-1">${Number(project.budget_ceiling).toLocaleString()}</p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-gray-500 dark:text-slate-400 font-medium uppercase tracking-wider">Deadline</p>
                                            <p className="text-sm font-medium text-gray-700 dark:text-slate-300 mt-2">{new Date(project.required_deadline).toLocaleDateString('en-US', { timeZone: 'UTC' })}</p>
                                        </div>
                                        <div className="ml-auto mt-4">
                                            <ArrowRight className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors" />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                            <DeleteProjectButton projectId={project.id} />
                        </div>
                    </div>
                ))}

                {(!projects || projects.length === 0) && (
                    <div className="col-span-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-sm rounded-xl p-12 text-center">
                        <Target className="w-12 h-12 text-gray-300 dark:text-slate-500 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No active procurement projects</h3>
                        <p className="text-gray-500 dark:text-slate-400 max-w-sm mx-auto mb-6">Create a new project to start collecting vendor bids and quotes.</p>
                        <Link href="/procurement/new" className={isViewer ? "pointer-events-none" : ""}>
                            <Button
                                variant="outline"
                                className="border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-slate-700 dark:text-indigo-300 dark:hover:bg-slate-600 dark:border-slate-600"
                                disabled={isViewer}
                                title={isViewer ? "Viewers cannot create projects" : ""}
                            >
                                Create your first project
                            </Button>
                        </Link>
                    </div>
                )}
            </div>
        </div>
    )
}
