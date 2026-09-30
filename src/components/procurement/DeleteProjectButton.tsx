"use client"

import { useState } from "react"
import { Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { deleteProcurementProject } from "@/app/actions/procurement"
import { useRole } from "@/components/RoleProvider"

export function DeleteProjectButton({ projectId }: { projectId: string }) {
    const [isDeleting, setIsDeleting] = useState(false)
    const { isViewer } = useRole()

    const handleDelete = async (e: React.MouseEvent) => {
        // Prevent the click from bubbling up to the Link component
        e.preventDefault()
        e.stopPropagation()

        if (isViewer) return

        if (confirm("Are you sure you want to delete this procurement project? All associated quotes will also be deleted.")) {
            setIsDeleting(true)
            try {
                await deleteProcurementProject(projectId)
            } catch (error) {
                console.error(error)
                alert("Failed to delete project")
                setIsDeleting(false)
            }
        }
    }

    return (
        <Button
            variant="destructive"
            size="icon"
            className="h-8 w-8 shadow-sm rounded-full bg-red-500 hover:bg-red-600 text-white"
            onClick={handleDelete}
            disabled={isDeleting || isViewer}
            title={isViewer ? "Viewers cannot delete projects" : ""}
        >
            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </Button>
    )
}
