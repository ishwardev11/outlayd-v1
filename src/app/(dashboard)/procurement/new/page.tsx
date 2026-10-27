import { NewProjectForm } from "@/components/procurement/NewProjectForm"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

export default function NewProcurementPage() {
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
