// The organisation's letterhead image, read on the server for PDFs built in the browser. Shared by
// donation receipts and invoices. Deliberately NOT a "use server" file: these helpers take an
// organisation id, so they must never be callable from the browser. Only server actions import them,
// after they have worked out the caller's own organisation.
import { createAdminClient } from "@/utils/supabase/admin"
import { letterheadImageType } from "@/utils/donation-receipt"

const BUCKET = "receipts"

// Only paths inside the organisation's own folder are ever read or removed
export const ownLetterhead = (organizationId: string, path: string | null | undefined): path is string =>
    !!path && path.startsWith(`${organizationId}/letterhead-`) && !path.includes("..")

// The letterhead as a data URL (PNG or JPEG), or null if there is none or it cannot be read
export async function loadLetterhead(organizationId: string, path: string | null | undefined): Promise<string | null> {
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
