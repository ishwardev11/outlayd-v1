import { NextRequest, NextResponse, after } from "next/server"
import { revalidatePath } from "next/cache"
import crypto from "crypto"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { getCurrentUserRole, getOrganizationId } from "@/app/actions/document-utils"
import { featureAllowed, planGateMessage } from "@/utils/plan"
import { processBankStatement } from "@/utils/bank-statement-extract"

export const dynamic = "force-dynamic"
export const maxDuration = 60

// Hosting platforms refuse request bodies above about 4.5 MB, so the limit is set just under that.
const MAX_BYTES = 4 * 1024 * 1024
const BUCKET = "receipts"

// POST /api/bank-statements  (multipart form, field "file": a PDF)
// Saves the PDF, records it as "extracting" and reads it in the background.
export async function POST(request: NextRequest) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const organizationId = await getOrganizationId()
    if (!organizationId) return NextResponse.json({ error: "No active organization" }, { status: 403 })

    const role = await getCurrentUserRole()
    if (role !== "Admin" && role !== "Editor") {
        return NextResponse.json({ error: "You do not have permission to import statements." }, { status: 403 })
    }

    // Paid plans only (a downgraded organisation keeps read-only access to its statements)
    if (!(await featureAllowed(supabase, organizationId, "bank_statements", "use"))) {
        return NextResponse.json(
            { error: planGateMessage("bank_statements", "use"), upgradeRequired: true },
            { status: 403 }
        )
    }

    let file: File | null = null
    try {
        const form = await request.formData()
        const f = form.get("file")
        file = f instanceof File ? f : null
    } catch {
        return NextResponse.json({ error: "Could not read the upload." }, { status: 400 })
    }
    if (!file) return NextResponse.json({ error: "Choose a PDF to upload." }, { status: 400 })
    if (file.size === 0) return NextResponse.json({ error: "That file is empty." }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "That PDF is too large. The limit is 4 MB. Try one month at a time." }, { status: 413 })

    const buffer = Buffer.from(await file.arrayBuffer())
    // Check the file really is a PDF, not just named like one
    if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
        return NextResponse.json({ error: "Only PDF bank statements can be imported for now." }, { status: 400 })
    }

    // At most 3 statements a minute per organisation, to stop AI spam
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
    const { count: recent } = await supabase
        .from("bank_statements")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organizationId)
        .gt("created_at", oneMinuteAgo)
    if ((recent ?? 0) >= 3) {
        return NextResponse.json({ error: "Too many uploads. Please wait a minute and try again." }, { status: 429 })
    }

    const fileHash = crypto.createHash("sha256").update(buffer).digest("hex")
    const { data: existing } = await supabase
        .from("bank_statements")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("file_hash", fileHash)
        .maybeSingle()
    if (existing) {
        return NextResponse.json({ error: "This statement has already been imported.", existingId: existing.id }, { status: 409 })
    }

    // Letters, digits, dots and dashes only, and never two dots in a row (the file viewer refuses ".." in a path)
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_").replace(/\.{2,}/g, ".").replace(/^[._-]+/, "").slice(0, 80) || "statement.pdf"
    const path = `${organizationId}/statements/${Date.now()}-${safeName}`
    const { error: uploadError } = await createAdminClient()
        .storage.from(BUCKET)
        .upload(path, buffer, { contentType: "application/pdf", upsert: false })
    if (uploadError) {
        console.error("Statement upload failed:", uploadError)
        return NextResponse.json({ error: "Could not store the file. Please try again." }, { status: 500 })
    }

    const { data: row, error: insertError } = await supabase
        .from("bank_statements")
        .insert({
            organization_id: organizationId,
            file_url: path,
            file_name: safeName,
            file_hash: fileHash,
            created_by: user.id,
        })
        .select("id")
        .single()
    if (insertError || !row) {
        await createAdminClient().storage.from(BUCKET).remove([path])
        if (insertError?.code === "23505") {
            return NextResponse.json({ error: "This statement has already been imported." }, { status: 409 })
        }
        console.error("Statement insert failed:", insertError)
        return NextResponse.json({ error: "Could not save the statement. Please try again." }, { status: 500 })
    }

    const base64 = buffer.toString("base64")
    after(() => processBankStatement(row.id, organizationId, base64))

    revalidatePath("/bank-statements")
    return NextResponse.json({ id: row.id })
}
