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

    // Check if there is a pending invite in workspace_invites for this email
    const { createAdminClient } = await import("@/utils/supabase/admin");
    const adminClient = createAdminClient();
    const { data: invite } = await adminClient
        .from("workspace_invites")
        .select("*")
        .eq("email", email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (invite) {
        // User has a pending invite and was already pre-created in auth.users by inviteUserByEmail.
        // We find their user id and update password / metadata via the admin client.
        const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers();
        if (listError) {
            console.error("Failed to list users during invited signup check:", listError);
        }
        
        const existingUser = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

        if (existingUser) {
            // Update password, name, and organization metadata on their auth profile
            const { error: updateError } = await adminClient.auth.admin.updateUserById(existingUser.id, {
                password: password,
                email_confirm: true,
                user_metadata: {
                    full_name: fullName,
                    organization_id: invite.organization_id,
                    onboarding_completed: true
                }
            });

            if (updateError) {
                return { error: "Failed to update account: " + updateError.message };
            }

            // Insert role into user_roles
            const { error: roleInsertError } = await adminClient
                .from("user_roles")
                .insert({
                    organization_id: invite.organization_id,
                    email: email,
                    role: invite.role,
                    full_name: fullName
                });

            if (roleInsertError) {
                console.error("Failed to map user_roles on signup:", roleInsertError);
                return { error: "Failed to map user access: " + roleInsertError.message };
            }

            // Delete pending invite
            await adminClient
                .from("workspace_invites")
                .delete()
                .eq("id", invite.id);

            // Sign in to establish a session
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (signInError) {
                return { error: "Account activated, but failed to log in: " + signInError.message };
            }

            // Clear local dev cookies
            const cookieStore = await cookies();
            cookieStore.set('dev_org_id', '', { maxAge: 0, path: '/' });
            cookieStore.set('dev_org_name', '', { maxAge: 0, path: '/' });
            cookieStore.set('dev_org_currency', '', { maxAge: 0, path: '/' });
            cookieStore.set('dev_org_fiscal_year', '', { maxAge: 0, path: '/' });

            redirect("/dashboard");
        }
    }

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
