"use server"

import crypto from "node:crypto"
import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

import { getOrganizationId, updateDocument, checkWriteAccess } from "./document-utils"
import { sanitizeVendorUpdates, assertOwnedIds, UpdateValidationError } from "@/utils/sanitize-updates"
import { extractDocumentData } from "./ai"
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
    const { data, error } = await supabase.from("categories").select("*").order("name")

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

export async function deleteVendor(id: string) {
    await checkWriteAccess();
    const supabase = await createClient()
    const { error } = await supabase
        .from("vendors")
        .delete()
        .eq("id", id)

    if (error) {
        console.error("Error deleting vendor:", error)
        throw new Error("Failed to delete vendor")
    }

    revalidatePath("/vendors")
    revalidatePath("/ledger")
    revalidatePath("/")
    revalidatePath("/reports")
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
            throw new Error(e.message)
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
    const updatePayload: Record<string, any> = { vendor_id: primaryId }
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
        const { data: orgData, error: orgError } = await supabase
            .from("organizations")
            .select("subscription_status")
            .eq("id", organization_id)
            .single();

        if (orgError) {
            console.error("Error fetching organization status:", orgError)
            throw new Error("Failed to verify organization status")
        }

        const isPro = orgData?.subscription_status === 'pro';

        if (!isPro) {
            // Enforce Free Tier Limit: 5 AI extractions per calendar month (UTC)
            const now = new Date();
            const startOfMonth = new Date(
                Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
            ).toISOString();

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

        // Global Rate Limit (per Organization): Max 5 uploads per minute to prevent AI spam
        const ONE_MINUTE_AGO = new Date(Date.now() - 60 * 1000).toISOString();
        const { count: recentCount } = await supabase
            .from("documents")
            .select("*", { count: "exact", head: true })
            .eq("organization_id", organization_id)
            .gt("created_at", ONE_MINUTE_AGO);

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

        // 5. Proceed to Gemini API Extraction for the active document record
        try {
            await extractDocumentData(docData.id, mimeType, base64Data)
        } catch (e: any) {
            console.error("Extraction failed:", e)
        }

        revalidatePath("/ledger")
        revalidatePath("/")
        return docData
    } catch (error: any) {
        console.error("processUpload failed:", error)
        throw new Error(error.message || "Unknown error during processUpload")
    }
}
