"use server"

import { PAYEE_TYPE_VALUES } from "@/utils/payee-types"
import crypto from "node:crypto"
import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"
import { after } from "next/server"

import { getOrganizationId, updateDocument, checkWriteAccess } from "./document-utils"
import { startOfMonthInstant, isValidTimezone, DEFAULT_TIMEZONE } from "@/utils/dates"
import { sanitizeVendorUpdates, assertOwnedIds, UpdateValidationError } from "@/utils/sanitize-updates"
import { runExtraction } from "./ai"
import { toStoragePath } from "@/utils/storage-paths"
import { errorMessage, type ExtractionFlagRow } from "@/utils/row-types";
export { getOrganizationId, updateDocument }


export async function getDocuments() {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from("documents")
        .select(`
      *,
      funds ( name ),
      categories ( name )
    `)
        .order("created_at", { ascending: false })

    if (error) {
        console.error("Error fetching documents:", error)
        throw new Error("Failed to fetch documents")
    }

    return data
}

export async function getDocument(id: string) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from("documents")
        .select(`
      *,
      funds ( name ),
      categories ( name )
    `)
        .eq("id", id)
        .single()

    if (error) {
        console.error("Error fetching document:", error)
        throw new Error("Failed to fetch document")
    }

    return data
}


export async function getFunds() {
    const supabase = await createClient()
    const { data, error } = await supabase.from("funds").select("*").order("name")

    if (error) throw new Error("Failed to fetch funds")
    return data
}

export async function getCategories() {
    const supabase = await createClient()
    // Pickers only offer real expense categories. System categories (Uncategorised, Depreciation) are
    // created and used by Outlayd itself, and income categories arrive with the money-in feature.
    const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("kind", "expense")
        .eq("is_system", false)
        .order("name")

    if (error) throw new Error("Failed to fetch categories")
    return data
}

export async function createFund(name: string) {
    await checkWriteAccess();
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    const { data, error } = await supabase
        .from("funds")
        .insert({ name, organization_id })
        .select()
        .single()

    if (error) {
        console.error("Error creating fund:", error)
        throw new Error("Failed to create fund")
    }

    revalidatePath("/ledger")
    return data
}

export async function createCategory(name: string) {
    await checkWriteAccess();
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    const { data, error } = await supabase
        .from("categories")
        .insert({ name, organization_id })
        .select()
        .single()

    if (error) {
        console.error("Error creating category:", error)
        throw new Error("Failed to create category")
    }

    revalidatePath("/ledger")
    return data
}

export async function deleteDocument(id: string) {
    await checkWriteAccess();
    const supabase = await createClient()
    const { error } = await supabase
        .from("documents")
        .delete()
        .eq("id", id)

    if (error) {
        console.error("Error deleting document:", error)
        throw new Error("Failed to delete document")
    }

    revalidatePath("/ledger")
    revalidatePath("/")
    revalidatePath("/vendors")
    revalidatePath("/reports")
}

// A payee that has documents is archived, never deleted, so reports and old entries keep their payee.
// Only a payee with no documents at all is removed for good. Returns which of the two happened.
export async function deleteVendor(id: string): Promise<{ action: "archived" | "deleted" }> {
    await checkWriteAccess();
    const supabase = await createClient()

    const { count, error: countError } = await supabase
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("vendor_id", id)
    if (countError) {
        console.error("Error checking payee usage:", countError)
        throw new Error("Failed to remove payee")
    }

    let action: "archived" | "deleted"
    if ((count ?? 0) > 0) {
        const { error } = await supabase
            .from("vendors")
            .update({ archived_at: new Date().toISOString() })
            .eq("id", id)
        if (error) {
            console.error("Error archiving payee:", error)
            throw new Error("Failed to archive payee")
        }
        action = "archived"
    } else {
        const { error } = await supabase.from("vendors").delete().eq("id", id)
        if (error) {
            console.error("Error deleting payee:", error)
            throw new Error("Failed to delete payee")
        }
        action = "deleted"
    }

    revalidatePath("/vendors")
    revalidatePath("/ledger")
    revalidatePath("/")
    revalidatePath("/reports")
    return { action }
}

export async function restorePayee(id: string) {
    await checkWriteAccess();
    const supabase = await createClient()
    const { error } = await supabase.from("vendors").update({ archived_at: null }).eq("id", id)
    if (error) {
        console.error("Error restoring payee:", error)
        throw new Error("Failed to restore payee")
    }
    revalidatePath("/vendors")
    revalidatePath("/ledger")
}

export async function createPayee(name: string, payeeType: string = "vendor") {
    await checkWriteAccess();
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    const cleanName = (name ?? "").trim().slice(0, 255)
    if (!cleanName) throw new Error("Enter a name for the payee")
    if (!PAYEE_TYPE_VALUES.includes(payeeType)) throw new Error("Choose a valid payee type")

    const { data, error } = await supabase
        .from("vendors")
        .insert({ name: cleanName, payee_type: payeeType, organization_id })
        .select()
        .single()

    if (error) {
        if (error.code === "23505") throw new Error("A payee with this name already exists")
        console.error("Error creating payee:", error)
        throw new Error("Failed to create payee")
    }

    revalidatePath("/vendors")
    revalidatePath("/ledger")
    return data
}

export async function getVendors() {
    const supabase = await createClient()
    const { data, error } = await supabase.from("vendors").select("*").order("name")

    if (error) throw new Error("Failed to fetch vendors")
    return data
}

export async function updateVendor(id: string, rawUpdates: unknown) {
    await checkWriteAccess();
    const supabase = await createClient()

    let updates: Record<string, unknown>
    try {
        updates = sanitizeVendorUpdates(rawUpdates)
        await assertOwnedIds(supabase, "categories", [updates.default_category_id])
        await assertOwnedIds(supabase, "funds", [updates.default_fund_id])
    } catch (e) {
        if (e instanceof UpdateValidationError) {
            throw new Error(errorMessage(e))
        }
        throw e
    }
    if (Object.keys(updates).length === 0) {
        throw new Error("Nothing to update")
    }

    const { data, error } = await supabase
        .from("vendors")
        .update(updates)
        .eq("id", id)
        .select()

    if (error) {
        console.error("Error updating vendor:", error)
        throw new Error("Failed to update vendor")
    }

    revalidatePath("/vendors")
    revalidatePath("/ledger")
    revalidatePath("/")
    revalidatePath("/reports")
    return data
}

export async function mergeVendors(primaryId: string, secondaryId: string) {
    await checkWriteAccess();
    const supabase = await createClient()
    // 0. Fetch primary vendor name to keep documents in sync
    const { data: primaryVendor } = await supabase
        .from("vendors")
        .select("name")
        .eq("id", primaryId)
        .single()

    // 1. Reassign documents from secondary -> primary and sync vendor_name
    const updatePayload: Record<string, string> = { vendor_id: primaryId }
    if (primaryVendor?.name) {
        updatePayload.vendor_name = primaryVendor.name
    }

    const { error: updateError } = await supabase
        .from("documents")
        .update(updatePayload)
        .eq("vendor_id", secondaryId)

    if (updateError) {
        console.error("Error updating documents during merge:", updateError)
        throw new Error("Failed to merge documents")
    }

    // 2. Delete the secondary vendor
    const { error: deleteError } = await supabase
        .from("vendors")
        .delete()
        .eq("id", secondaryId)

    if (deleteError) {
        console.error("Error deleting secondary vendor:", deleteError)
        throw new Error("Failed to delete secondary vendor")
    }

    revalidatePath("/vendors")
    revalidatePath("/ledger")
    revalidatePath("/")
    revalidatePath("/reports")

    return true
}

export async function processUpload(formData: FormData) {
    await checkWriteAccess();
    try {
        const file = formData.get("file") as File
        if (!file) throw new Error("No file uploaded")

        // Security Validation
        const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
        if (!ALLOWED_MIMES.includes(file.type)) {
            throw new Error(`Invalid file type: ${file.type}. Only images and PDFs are allowed.`);
        }

        const MAX_SIZE = 10 * 1024 * 1024; // 10MB
        if (file.size > MAX_SIZE) {
            throw new Error("File too large. Maximum size is 10MB.");
        }

        // Sanitize Filename (Remove path components and special characters)
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_").replace(/^[./\\]+/, "");
        const fileName = `${Date.now()}-${safeName}`

        const supabase = await createClient()
        const organization_id = await getOrganizationId()
        // The plan, the timezone and the "uploads in the last minute" count do not depend on each
        // other, so they are fetched together. The timezone comes from the same organisation row,
        // which also saves a second slow organisation lookup.
        const ONE_MINUTE_AGO = new Date(Date.now() - 60 * 1000).toISOString();
        const [orgRes, recentRes] = await Promise.all([
            supabase
                .from("organizations")
                .select("subscription_status, timezone")
                .eq("id", organization_id)
                .single(),
            // Global Rate Limit (per Organization): Max 5 uploads per minute to prevent AI spam
            supabase
                .from("documents")
                .select("*", { count: "exact", head: true })
                .eq("organization_id", organization_id)
                .gt("created_at", ONE_MINUTE_AGO),
        ]);
        const { data: orgData, error: orgError } = orgRes;

        if (orgError) {
            console.error("Error fetching organization status:", orgError)
            throw new Error("Failed to verify organization status")
        }

        const isPro = orgData?.subscription_status === 'pro';

        if (!isPro) {
            // Enforce Free Tier Limit: 5 AI extractions per calendar month (in the organisation's timezone)
            const startOfMonth = startOfMonthInstant(isValidTimezone(orgData?.timezone) ? orgData.timezone : DEFAULT_TIMEZONE);

            const { count, error: countError } = await supabase
                .from("documents")
                .select("*", { count: "exact", head: true })
                .eq("organization_id", organization_id)
                .neq("status", "DUPLICATE_WARNING")
                .gte("created_at", startOfMonth)

            if (countError) {
                console.error("Error fetching document count:", countError)
                throw new Error("Failed to verify organization limits")
            }

            if (count && count >= 5) {
                return {
                    status: "error",
                    code: "LIMIT_REACHED",
                    message: "You've used all 5 free document extractions for this month. Upgrade to Growth for unlimited extractions, or wait until next month."
                }
            }
        }

        const recentCount = recentRes.count;
        if (recentCount && recentCount >= 5) {
            throw new Error("Too many uploads. Please wait a minute before uploading more.");
        }


        // 1. Calculate file hash first to prevent duplicate processing
        const buffer = await file.arrayBuffer()
        const fileHash = crypto.createHash('sha256').update(Buffer.from(buffer)).digest('hex')
        const mimeType = file.type
        const base64Data = Buffer.from(buffer).toString("base64")

        // 2. Check if this file has already been uploaded by this organization
        const { data: existingHashDocs } = await supabase
            .from("documents")
            .select("*")
            .eq("file_hash", fileHash)
            .eq("organization_id", organization_id)
            .neq("status", "DUPLICATE_WARNING")
            .limit(1)

        if (existingHashDocs && existingHashDocs.length > 0) {
            console.log(`Duplicate detected via early File Hash lookup: ${fileHash}. Bypassing storage upload and AI extraction.`);
            const exDoc = existingHashDocs[0];

            // Re-use the existing image_url to save storage space and bypass costly extraction
            const { data: docData, error: docError } = await supabase
                .from("documents")
                .insert({
                    image_url: exDoc.image_url,
                    file_hash: fileHash,
                    status: "DUPLICATE_WARNING",
                    organization_id,
                    vendor_name: exDoc.vendor_name,
                    vendor_id: exDoc.vendor_id,
                    amount: exDoc.amount,
                    document_date: exDoc.document_date,
                    document_type: exDoc.document_type,
                    invoice_number: exDoc.invoice_number,
                    alternative_id: exDoc.alternative_id,
                    transaction_time: exDoc.transaction_time,
                    payment_last4: exDoc.payment_last4,
                    subtotal: exDoc.subtotal,
                    tax_amount: exDoc.tax_amount,
                    vendor_branch_or_location: exDoc.vendor_branch_or_location,
                    confidence_score: exDoc.confidence_score,
                    extraction_flags: exDoc.extraction_flags ?? [],
                    original_currency: exDoc.original_currency ?? null,
                    original_amount: exDoc.original_amount ?? null,
                    exchange_rate: exDoc.exchange_rate ?? null,
                    exchange_rate_source: exDoc.exchange_rate_source ?? null,
                    splits: exDoc.splits,
                    line_items: exDoc.line_items
                })
                .select()
                .single()

            if (docError) {
                console.error("Database insert error for duplicate record:", docError)
                throw new Error(`Database record creation failed: ${docError.message}`)
            }

            revalidatePath("/ledger")
            revalidatePath("/")
            return docData
        }

        // 3. Upload to private storage under this organisation's folder
        const storagePath = `${organization_id}/${fileName}`
        const { createAdminClient } = await import("@/utils/supabase/admin")
        const { error: uploadError } = await createAdminClient()
            .storage
            .from("receipts")
            .upload(storagePath, file, { contentType: file.type })

        if (uploadError) {
            console.error("Storage upload error:", uploadError)
            throw new Error(`Storage upload failed: ${uploadError.message}`)
        }

        // 4. Insert active document record
        const { data: docData, error: docError } = await supabase
            .from("documents")
            .insert({
                image_url: storagePath,
                file_hash: fileHash,
                status: "extracting",
                organization_id
            })
            .select()
            .single()

        if (docError) {
            // Check if it's a unique constraint violation (concurrent upload race condition)
            if (docError.code === "23505") {
                console.log(`Concurrent duplicate detected via unique constraint for hash: ${fileHash}`);

                // Query the concurrently created active document record
                const { data: concurrentDocs } = await supabase
                    .from("documents")
                    .select("*")
                    .eq("file_hash", fileHash)
                    .eq("organization_id", organization_id)
                    .neq("status", "DUPLICATE_WARNING")
                    .limit(1)

                const exDoc = (concurrentDocs && concurrentDocs.length > 0) ? concurrentDocs[0] : null;

                // Insert duplicate warning record copying its values
                const { data: dupData, error: dupError } = await supabase
                    .from("documents")
                    .insert({
                        image_url: storagePath,
                        file_hash: fileHash,
                        status: "DUPLICATE_WARNING",
                        organization_id,
                        vendor_name: exDoc?.vendor_name || null,
                        vendor_id: exDoc?.vendor_id || null,
                        amount: exDoc?.amount || null,
                        document_date: exDoc?.document_date || null,
                        document_type: exDoc?.document_type || null,
                        invoice_number: exDoc?.invoice_number || null,
                        alternative_id: exDoc?.alternative_id || null,
                        transaction_time: exDoc?.transaction_time || null,
                        payment_last4: exDoc?.payment_last4 || null,
                        subtotal: exDoc?.subtotal || null,
                        tax_amount: exDoc?.tax_amount || null,
                        vendor_branch_or_location: exDoc?.vendor_branch_or_location || null,
                        confidence_score: exDoc?.confidence_score ?? null,
                        extraction_flags: exDoc?.extraction_flags ?? [],
                        original_currency: exDoc?.original_currency ?? null,
                        original_amount: exDoc?.original_amount ?? null,
                        exchange_rate: exDoc?.exchange_rate ?? null,
                        exchange_rate_source: exDoc?.exchange_rate_source ?? null,
                        splits: exDoc?.splits || null,
                        line_items: exDoc?.line_items || null
                    })
                    .select()
                    .single()

                if (dupError) {
                    console.error("Database insert error for duplicate fallback:", dupError)
                    throw new Error(`Database record creation failed: ${dupError.message}`)
                }

                revalidatePath("/ledger")
                revalidatePath("/")
                return dupData;
            }

            console.error("Database insert error:", docError)
            throw new Error(`Database record creation failed: ${docError.message}`)
        }

        // 5. Extract in the background. The document is already saved with status "extracting", so the
        // upload can return straight away. The extraction fills the document in, or moves it to
        // needs_review if it fails. The ledger and dashboard refresh themselves (ExtractionPoller)
        // while anything is still extracting.
        // runExtraction enforces a deadline and always moves the document out of "extracting".
        after(() => runExtraction(docData.id, mimeType, base64Data, organization_id ?? undefined))

        revalidatePath("/ledger")
        revalidatePath("/")
        return docData
    } catch (error) {
        console.error("processUpload failed:", error)
        throw new Error(errorMessage(error) || "Unknown error during processUpload")
    }
}

// Re-reads a document whose AI extraction failed or timed out. Used by the "Try reading again"
// button in the Review drawer, so a failed document can be fixed without uploading the file again
// (which would be flagged as a duplicate of the failed one).
async function retryExtractionOrThrow(documentId: string) {
    await checkWriteAccess()
    if (typeof documentId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(documentId)) {
        throw new Error("Invalid document")
    }

    const supabase = await createClient()
    const organization_id = await getOrganizationId()
    if (!organization_id) throw new Error("No active organization")

    // Read through the user's own session, so row-level security limits this to their organisation
    const { data: doc, error } = await supabase
        .from("documents")
        .select("id, image_url, status, extraction_flags")
        .eq("id", documentId)
        .eq("organization_id", organization_id)
        .maybeSingle()
    if (error || !doc) throw new Error("Document not found")

    // Only documents whose extraction actually failed can be retried, so this cannot be used to
    // run repeated paid AI extractions on documents that were read fine.
    const flags: (ExtractionFlagRow | null)[] = Array.isArray(doc.extraction_flags) ? doc.extraction_flags : []
    const failed = flags.some((f) => f?.code === "EXTRACTION_FAILED" || f?.code === "EXTRACTION_TIMED_OUT")
    if (doc.status !== "needs_review" || !failed) {
        throw new Error("This document does not need to be read again.")
    }
    if (!doc.image_url) throw new Error("This document has no file to read.")

    const path = toStoragePath(doc.image_url)
    if (!path || path.includes("..") || (path.includes("/") && !path.startsWith(`${organization_id}/`))) {
        throw new Error("The file for this document could not be found.")
    }

    const { createAdminClient } = await import("@/utils/supabase/admin")
    const { data: blob, error: downloadError } = await createAdminClient().storage.from("receipts").download(path)
    if (downloadError || !blob) {
        console.error("retryExtraction download failed:", downloadError)
        throw new Error("The file for this document could not be loaded.")
    }

    const ext = path.split(".").pop()?.toLowerCase() ?? ""
    const mimeType =
        blob.type && blob.type !== "application/octet-stream" ? blob.type
        : ext === "pdf" ? "application/pdf"
        : ext === "png" ? "image/png"
        : ext === "webp" ? "image/webp"
        : "image/jpeg"
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mimeType)) {
        throw new Error("This file type cannot be read.")
    }
    const base64Data = Buffer.from(await blob.arrayBuffer()).toString("base64")

    // Claim the document: only one retry can move it from needs_review back to extracting
    const { data: claimed, error: claimError } = await supabase
        .from("documents")
        .update({
            status: "extracting",
            extraction_started_at: new Date().toISOString(),
            extraction_flags: [],
            vendor_name: null,
            confidence_score: null,
            notes: null,
        })
        .eq("id", documentId)
        .eq("organization_id", organization_id)
        .eq("status", "needs_review")
        .select("id")
    if (claimError) {
        console.error("retryExtraction claim failed:", claimError)
        throw new Error("Could not restart the extraction. Please try again.")
    }
    if (!claimed || claimed.length === 0) {
        throw new Error("This document is already being read.")
    }

    after(() => runExtraction(documentId, mimeType, base64Data, organization_id))

    revalidatePath("/ledger")
    revalidatePath("/")
    return { success: true }
}

// Errors thrown from a server action are hidden from the browser in production, so the reasons
// (which are written for the user) are returned as a result instead.
export async function retryExtraction(documentId: string): Promise<{ success: true } | { success: false; error: string }> {
    try {
        await retryExtractionOrThrow(documentId)
        return { success: true }
    } catch (e) {
        return { success: false, error: errorMessage(e) || "Could not read the document again." }
    }
}
