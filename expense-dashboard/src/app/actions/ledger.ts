"use server"

import { createClient } from "@/utils/supabase/server"
import { revalidatePath } from "next/cache"

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

export async function updateDocument(id: string, updates: any) {
    const supabase = await createClient()

    const { data, error } = await supabase
        .from("documents")
        .update(updates)
        .eq("id", id)
        .select()

    if (error) {
        console.error("Error updating document:", error)
        throw new Error("Failed to update document")
    }

    revalidatePath("/ledger")
    revalidatePath("/")
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
