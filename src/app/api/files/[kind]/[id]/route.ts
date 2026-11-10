import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getOrganizationId } from "@/app/actions/document-utils"

const BUCKET = "receipts"
const SIGNED_URL_SECONDS = 300
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SOURCES = {
    document: { table: "documents", column: "image_url" },
    quote: { table: "quotes", column: "file_url" },
} as const

// New rows store the storage path ("<orgId>/<file>"). Older rows store the full public URL.
function toStoragePath(stored: string): string | null {
    if (!/^https?:\/\//i.test(stored)) return stored
    const marker = `/storage/v1/object/public/${BUCKET}/`
    const index = stored.indexOf(marker)
    if (index === -1) return null
    return decodeURIComponent(stored.slice(index + marker.length).split("?")[0])
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ kind: string; id: string }> }
) {
    const { kind, id } = await params

    if (!(kind in SOURCES) || !UUID_RE.test(id)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    const source = SOURCES[kind as keyof typeof SOURCES]

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const organizationId = await getOrganizationId()
    if (!organizationId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    // Read through the user's own session so row-level security decides whether they may see this row
    const { data: row } = await supabase
        .from(source.table)
        .select(source.column)
        .eq("id", id)
        .eq("organization_id", organizationId)
        .maybeSingle()

    const stored = (row as Record<string, string | null> | null)?.[source.column]
    if (!stored) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const path = toStoragePath(stored)
    if (!path || path.includes("..")) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    // New-style paths must live in the caller's organisation folder (older files sit at the bucket root)
    if (path.includes("/") && !path.startsWith(`${organizationId}/`)) {
        return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    const { data, error } = await createAdminClient()
        .storage.from(BUCKET)
        .createSignedUrl(path, SIGNED_URL_SECONDS)

    if (error || !data?.signedUrl) {
        return NextResponse.json({ error: "File unavailable" }, { status: 404 })
    }

    const response = NextResponse.redirect(data.signedUrl, 302)
    response.headers.set("Cache-Control", "private, no-store")
    return response
}