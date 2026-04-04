"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

import { getOrganizationId, updateDocument } from "./document-utils"
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

export async function updateVendor(id: string, updates: any) {
    const supabase = await createClient()

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
    const supabase = await createClient()

    // 1. Reassign documents from secondary -> primary
    const { error: updateError } = await supabase
        .from("documents")
        .update({ vendor_id: primaryId })
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
    try {
        const file = formData.get("file") as File
        if (!file) throw new Error("No file uploaded")

        const supabase = await createClient()
        const organization_id = await getOrganizationId()

        // 1. Fetch organization to check subscription status
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
            // Enforce Free Tier Limit
            const { count, error: countError } = await supabase
                .from("documents")
                .select("*", { count: "exact", head: true })
                .eq("organization_id", organization_id)

            if (countError) {
                console.error("Error fetching document count:", countError)
                throw new Error("Failed to verify organization limits")
            }

            if (count && count >= 5) {
                return {
                    status: "error",
                    code: "LIMIT_REACHED",
                    message: "Free tier limit reached. Please upgrade to process more documents."
                }
            }
        }



        const fileName = `${Date.now()}-${file.name}`

        // 1. Upload to Storage
        const { data: uploadData, error: uploadError } = await supabase
            .storage
            .from("receipts")
            .upload(fileName, file)

        if (uploadError) {
            console.error("Storage upload error:", uploadError)
            throw new Error(`Storage upload failed: ${uploadError.message}`)
        }

        const { data: { publicUrl } } = supabase
            .storage
            .from("receipts")
            .getPublicUrl(fileName)

        // 2. Insert blank document record

        const { data: docData, error: docError } = await supabase
            .from("documents")
            .insert({
                image_url: publicUrl,
                status: "extracting",
                organization_id
            })
            .select()
            .single()

        if (docError) {
            console.error("Database insert error:", docError)
            throw new Error(`Database record creation failed: ${docError.message}`)
        }

        // 3. Trigger async Gemini extraction
        try {
            const buffer = await file.arrayBuffer()
            const base64Data = Buffer.from(buffer).toString("base64")
            const mimeType = file.type

            await extractDocumentData(docData.id, mimeType, base64Data)
        } catch (e: any) {
            console.error("Extraction failed:", e)
            // We don't throw here so the file is still saved, but it requires manual review
        }

        revalidatePath("/ledger")
        revalidatePath("/")
        return docData
    } catch (error: any) {
        console.error("processUpload failed:", error)
        throw new Error(error.message || "Unknown error during processUpload")
    }
}
