import { createClient } from "@/utils/supabase/server"
import { notFound } from "next/navigation"
import { ProjectDashboard } from "@/components/procurement/ProjectDashboard"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default async function ProcurementDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const supabase = await createClient()
    const { id } = await params

    // Fetch Project
    const { data: project, error: projectError } = await supabase
        .from("procurement_projects")
        .select("*")
        .eq("id", id)
        .single()

    if (projectError || !project) {
        console.error("Project fetch failed in page.tsx:", projectError, "ID tried:", id)
        notFound()
    }

    // Fetch Quotes
    const { data: quotes, error: quotesError } = await supabase
        .from("quotes")
        .select("*")
        .eq("project_id", id)
        .order("created_at", { ascending: false })

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 animate-in fade-in">
            <Link
                href="/procurement"
                className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Projects
            </Link>

            <ProjectDashboard project={project} quotes={quotes || []} />
        </div>
    )
}
