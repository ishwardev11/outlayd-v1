"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getOrganizationId } from "./document-utils";
import { cookies, headers } from "next/headers";

function escapeLike(value: string) {
    return value.replace(/[\\%_]/g, (c) => "\\" + c);
}

export async function signUpAction(formData: FormData) {
    const email = formData.get("email")?.toString();
    const password = formData.get("password")?.toString();
    const fullName = formData.get("fullName")?.toString() || "";

    if (!email || !password) {
        return { error: "Email and password are required" };
    }

    const supabase = await createClient();

      // SECURITY: an email address alone is NOT proof of an invitation. Never activate, verify,
    // or set a password for an invited account from this form. Invitees must use the one-time
    // link Supabase emailed them (handled by /accept-invite + acceptInvite()).
    const { createAdminClient } = await import("@/utils/supabase/admin");
    const adminClient = createAdminClient();
    const { data: pendingInvite } = await adminClient
        .from("workspace_invites")
        .select("id")
        .ilike("email", escapeLike(email.trim()))
        .limit(1)
        .maybeSingle();

    if (pendingInvite) {
        // Same message as a normal signup so this form can't be used to discover who is invited.
        return { success: "Account created! Please check your email to confirm your account before logging in." };
    }
    
    const headersList = await headers();
    const host = headersList.get("host") || "localhost:3000";
    const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
    const emailRedirectTo = `${protocol}://${host}/login`;

    const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: {
            emailRedirectTo,
            data: {
                full_name: fullName,
            }
        }
    });

    if (error) {
        return { error: error.message };
    }

    if (!data.session) {
        // Account created but email confirmation required
        return { success: "Account created! Please check your email to confirm your account before logging in." };
    }

    // Successful signup automatically logs them in as well
    const orgId = await getOrganizationId();
    if (orgId) {
        redirect("/dashboard");
    } else {
        redirect("/onboarding");
    }
}

export async function signInAction(formData: FormData) {
    const email = formData.get("email")?.toString();
    const password = formData.get("password")?.toString();

    if (!email || !password) {
        return { error: "Email and password are required" };
    }

    const supabase = await createClient();

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        return { error: error.message };
    }

    // Clear the active-workspace cookies so the next login picks the right organisation
    const cookieStore = await cookies();
    cookieStore.set('active_org_id', '', { maxAge: 0, path: '/' });
    cookieStore.set('active_org_currency', '', { maxAge: 0, path: '/' });

    const orgId = await getOrganizationId();
    if (!orgId) {
        redirect("/onboarding");
    } else {
        redirect("/dashboard");
    }
}

export async function signOutAction() {
    const supabase = await createClient();
    await supabase.auth.signOut();

    // Clear the active-workspace cookies so the next login starts fresh
    const cookieStore = await cookies();
    cookieStore.set('active_org_id', '', { maxAge: 0, path: '/' });
    cookieStore.set('active_org_currency', '', { maxAge: 0, path: '/' });

    redirect("/");
}
