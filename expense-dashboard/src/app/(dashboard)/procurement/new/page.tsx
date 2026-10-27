import { NewProjectForm } from "@/components/procurement/NewProjectForm"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { getCurrentUserRole } from "@/app/actions/document-utils"
import { redirect } from "next/navigation"

export default async function NewProcurementPage() {
    const role = await getCurrentUserRole()
    if (role === 'Viewer') {
        redirect("/procurement")
    }
    return (
        <div className="space-y-6">
            <Link
                href="/procurement"
                className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
            >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Projects
            </Link>

            <div className="max-w-3xl mx-auto">
                <NewProjectForm />
            </div>
        </div>
    )
}
