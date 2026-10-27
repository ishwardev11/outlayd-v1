"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { getOrganizationId } from "./document-utils";
import { cookies } from "next/headers";

export async function signUpAction(formData: FormData) {
    const email = formData.get("email")?.toString();
    const password = formData.get("password")?.toString();
    const fullName = formData.get("fullName")?.toString() || "";

    if (!email || !password) {
        return { error: "Email and password are required" };
    }

    const supabase = await createClient();

    const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: {
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

    // Clear local dev cookies here too so they don't override the real session
    const cookieStore = await cookies();
    cookieStore.set('dev_org_id', '', { maxAge: 0, path: '/' });
    cookieStore.set('dev_org_name', '', { maxAge: 0, path: '/' });
    cookieStore.set('dev_org_currency', '', { maxAge: 0, path: '/' });
    cookieStore.set('dev_org_fiscal_year', '', { maxAge: 0, path: '/' });

    // Successful signup automatically logs them in as well
    redirect("/onboarding");
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

    // Clear local dev cookies
    const cookieStore = await cookies();
    cookieStore.set('dev_org_id', '', { maxAge: 0, path: '/' });
    cookieStore.set('dev_org_name', '', { maxAge: 0, path: '/' });
    cookieStore.set('dev_org_currency', '', { maxAge: 0, path: '/' });
    cookieStore.set('dev_org_fiscal_year', '', { maxAge: 0, path: '/' });

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

    // Clear local dev cookies to ensure fresh state on next login/signup
    const cookieStore = await cookies();
    cookieStore.set('dev_org_id', '', { maxAge: 0, path: '/' });
    cookieStore.set('dev_org_name', '', { maxAge: 0, path: '/' });
    cookieStore.set('dev_org_currency', '', { maxAge: 0, path: '/' });
    cookieStore.set('dev_org_fiscal_year', '', { maxAge: 0, path: '/' });

    redirect("/");
}
