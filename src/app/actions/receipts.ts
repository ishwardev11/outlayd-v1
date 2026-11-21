"use server"

// Donation receipts (Phase 2, stage 3c). Numbers are issued by the database (issue_donation_receipt),
// which locks the organisation while it takes the next number, so one is never reused or skipped.
// Issuing and voiding need a paid plan and an Admin or Editor; reading and downloading existing
// receipts stays open to everyone in the organisation, including after a downgrade.
import { revalidatePath } from "next/cache"
import { randomUUID } from "crypto"
import { createClient } from "@/utils/supabase/server"
import { createAdminClient } from "@/utils/supabase/admin"
import { checkWriteAccess, getCurrentUserRole, getOrganizationCurrency, getOrganizationId } from "./document-utils"
import { LETTERHEAD_MAX_BYTES, letterheadImageType, parseReceiptSettings, type ReceiptOrg, type ReceiptRecord, type Signatory } from "@/utils/donation-receipt"

type ActionResult<T = undefined> = { success: true; data?: T } | { success: false; error: string }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BUCKET = "receipts"

// Only paths inside the organisation's own folder are ever read or removed
const ownLetterhead = (organizationId: string, path: string | null | undefined): path is string =>
    !!path && path.startsWith(`${organizationId}/letterhead-`) && !path.includes("..")

// The letterhead as a data URL for the PDF (built in the browser), or null if there is none
async function loadLetterhead(organizationId: string, path: string | null | undefined): Promise<string | null> {
    if (!ownLetterhead(organizationId, path)) return null
    const { data, error } = await createAdminClient().storage.from(BUCKET).download(path)
    if (error || !data) {
        console.error("Could not load the letterhead:", error)
        return null
    }
    const bytes = new Uint8Array(await data.arrayBuffer())
    const type = letterheadImageType(bytes)
    if (!type) return null
    return `data:image/${type};base64,${Buffer.from(bytes).toString("base64")}`
}

// The database raises readable messages; show those, never raw technical ones
function dbMessage(error: { message?: string } | null | undefined, fallback: string): string {
    const m = (error?.message ?? "").trim()
    if (!m || /row-level security|permission denied|violates|syntax|duplicate key/i.test(m)) return fallback
    return m
}

export async function issueDonationReceipt(transactionId: string): Promise<ActionResult<{ id: string; receiptNo: string }>> {
    if (!UUID_RE.test(transactionId ?? "")) return { success: false, error: "That entry was not found" }
    try {
        await checkWriteAccess()
    } catch {
        return { success: false, error: "Only Admins and Editors can issue receipts." }
    }
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("issue_donation_receipt", { p_tx: transactionId })
    const row = (Array.isArray(data) ? data[0] : data) as { id?: string; receipt_no?: string } | null
    if (error || !row?.id) return { success: false, error: dbMessage(error, "Could not issue the receipt. Please try again.") }
    revalidatePath("/ledger")
    return { success: true, data: { id: row.id, receiptNo: String(row.receipt_no) } }
}

export async function voidDonationReceipt(receiptId: string, reason: string): Promise<ActionResult> {
    if (!UUID_RE.test(receiptId ?? "")) return { success: false, error: "That receipt was not found" }
    const clean = (reason ?? "").trim()
    if (!clean) return { success: false, error: "Give a reason for voiding the receipt" }
    if (clean.length > 500) return { success: false, error: "The reason can be at most 500 characters" }
    try {
        await checkWriteAccess()
    } catch {
        return { success: false, error: "Only Admins and Editors can void receipts." }
    }
    const supabase = await createClient()
    const { error } = await supabase.rpc("void_donation_receipt", { p_receipt: receiptId, p_reason: clean })
    if (error) return { success: false, error: dbMessage(error, "Could not void the receipt. Please try again.") }
    revalidatePath("/ledger")
    return { success: true }
}

// Everything the PDF needs: the receipt as it was issued, plus the organisation's letterhead
export async function getReceiptForPdf(receiptId: string): Promise<ActionResult<{ receipt: ReceiptRecord; org: ReceiptOrg }>> {
    if (!UUID_RE.test(receiptId ?? "")) return { success: false, error: "That receipt was not found" }
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    if (!organizationId) return { success: false, error: "No active organization" }
    const [{ data: r }, { data: o }, currency] = await Promise.all([
        supabase.from("donation_receipts")
            .select("receipt_no, issued_at, donation_date, donor_name, amount, details, tax_exempt, tax_exempt_reference, voided_at, void_reason")
            .eq("id", receiptId).eq("organization_id", organizationId).maybeSingle(),
        supabase.from("organizations").select("name, legal_name, address, registration_id, signatories, letterhead_path").eq("id", organizationId).maybeSingle(),
        getOrganizationCurrency(),
    ])
    if (!r || !o) return { success: false, error: "That receipt was not found" }
    const letterheadImage = await loadLetterhead(organizationId, o.letterhead_path as string | null)
    return {
        success: true,
        data: {
            receipt: { ...(r as unknown as ReceiptRecord), amount: Number(r.amount) },
            org: {
                name: String(o.name ?? ""),
                legal_name: (o.legal_name as string | null) ?? null,
                address: (o.address as string | null) ?? null,
                registration_id: (o.registration_id as string | null) ?? null,
                signatories: Array.isArray(o.signatories) ? (o.signatories as Signatory[]) : [],
                currency,
                letterheadImage,
            },
        },
    }
}

// Receipt settings (Settings > Organization Profile). Admins only, like the other organisation settings.
export async function getReceiptSettings() {
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    if (!organizationId) return null
    const [{ data: o }, { data: last }] = await Promise.all([
        supabase.from("organizations")
            .select("legal_name, address, signatories, receipt_prefix, receipt_next_number, tax_exempt_receipts, tax_exempt_reference, letterhead_path")
            .eq("id", organizationId).maybeSingle(),
        supabase.from("donation_receipts").select("seq").eq("organization_id", organizationId).order("seq", { ascending: false }).limit(1).maybeSingle(),
    ])
    if (!o) return null
    // A short-lived private link for the preview in settings
    let letterhead_url: string | null = null
    const path = o.letterhead_path as string | null
    if (ownLetterhead(organizationId, path)) {
        const { data } = await createAdminClient().storage.from(BUCKET).createSignedUrl(path, 3600)
        letterhead_url = data?.signedUrl ?? null
    }
    return {
        letterhead_url,
        legal_name: (o.legal_name as string | null) ?? "",
        address: (o.address as string | null) ?? "",
        signatories: Array.isArray(o.signatories) ? (o.signatories as Signatory[]) : [],
        receipt_prefix: String(o.receipt_prefix ?? ""),
        receipt_next_number: Number(o.receipt_next_number ?? 1),
        tax_exempt_receipts: o.tax_exempt_receipts === true,
        tax_exempt_reference: (o.tax_exempt_reference as string | null) ?? "",
        last_issued: (last?.seq as number | undefined) ?? 0,
    }
}

// Letterhead image: Admins only. formData "file" = a PNG or JPEG up to 1 MB. Replaces any earlier one.
export async function uploadLetterhead(formData: FormData): Promise<ActionResult> {
    if ((await getCurrentUserRole()) !== "Admin") return { success: false, error: "Only Admins can change organisation settings." }
    const organizationId = await getOrganizationId()
    if (!organizationId) return { success: false, error: "No active organization" }
    const f = formData.get("file")
    if (!(f instanceof File) || f.size === 0) return { success: false, error: "Choose an image file" }
    if (f.size > LETTERHEAD_MAX_BYTES) return { success: false, error: "The letterhead is too large. The limit is 1 MB." }
    const bytes = new Uint8Array(await f.arrayBuffer())
    const type = letterheadImageType(bytes)
    if (!type) return { success: false, error: "Upload the letterhead as a PNG or JPG image" }

    const supabase = await createClient()
    const { data: current } = await supabase.from("organizations").select("letterhead_path").eq("id", organizationId).maybeSingle()
    const oldPath = (current?.letterhead_path as string | null) ?? null
    const path = `${organizationId}/letterhead-${randomUUID()}.${type === "png" ? "png" : "jpg"}`
    const storage = createAdminClient().storage.from(BUCKET)
    const { error: upError } = await storage.upload(path, bytes, { contentType: `image/${type}` })
    if (upError) {
        console.error("Letterhead upload failed:", upError)
        return { success: false, error: "Could not upload the letterhead. Please try again." }
    }
    const { error } = await supabase.from("organizations").update({ letterhead_path: path }).eq("id", organizationId)
    if (error) {
        await storage.remove([path])
        console.error("Saving the letterhead failed:", error)
        return { success: false, error: "Could not save the letterhead. Please try again." }
    }
    if (ownLetterhead(organizationId, oldPath)) await storage.remove([oldPath])
    revalidatePath("/settings")
    return { success: true }
}

export async function removeLetterhead(): Promise<ActionResult> {
    if ((await getCurrentUserRole()) !== "Admin") return { success: false, error: "Only Admins can change organisation settings." }
    const organizationId = await getOrganizationId()
    if (!organizationId) return { success: false, error: "No active organization" }
    const supabase = await createClient()
    const { data: current } = await supabase.from("organizations").select("letterhead_path").eq("id", organizationId).maybeSingle()
    const oldPath = (current?.letterhead_path as string | null) ?? null
    const { error } = await supabase.from("organizations").update({ letterhead_path: null }).eq("id", organizationId)
    if (error) return { success: false, error: "Could not remove the letterhead. Please try again." }
    if (ownLetterhead(organizationId, oldPath)) await createAdminClient().storage.from(BUCKET).remove([oldPath])
    revalidatePath("/settings")
    return { success: true }
}

export async function updateReceiptSettings(raw: unknown): Promise<ActionResult> {
    if ((await getCurrentUserRole()) !== "Admin") return { success: false, error: "Only Admins can change organisation settings." }
    const parsed = parseReceiptSettings(raw)
    if (!parsed.ok) return { success: false, error: parsed.error }
    const supabase = await createClient()
    const organizationId = await getOrganizationId()
    if (!organizationId) return { success: false, error: "No active organization" }
    const { error } = await supabase.from("organizations").update(parsed.value).eq("id", organizationId)
    if (error) {
        if (/must be after the last one issued/i.test(error.message ?? "")) return { success: false, error: error.message }
        console.error("updateReceiptSettings failed:", error)
        return { success: false, error: "Could not save the receipt settings. Please try again." }
    }
    revalidatePath("/settings")
    return { success: true }
}
