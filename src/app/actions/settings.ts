"use server"

import { createClient } from "@/utils/supabase/server"
import { getOrganizationId, getCurrentUserRole } from "./document-utils"

async function checkWriteAccess() {
    if (process.env.NODE_ENV === 'development') return 'Admin';
    const role = await getCurrentUserRole();
    if (role === 'Viewer') {
        throw new Error("Unauthorized: Viewers cannot perform this action.");
    }
    return role;
}

import { revalidatePath } from "next/cache"
import { cookies, headers } from "next/headers"
import Stripe from 'stripe';
import { TEMPLATES } from "@/utils/templates"
import { createAdminClient } from "@/utils/supabase/admin"

// --- Organization Profile ---

export async function getOrganizationSettings() {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    if (!organization_id) {
        return null
    }

    // Local dev fallback
    if (process.env.NODE_ENV === 'development' && organization_id === '00000000-0000-0000-0000-000000000000') {
        const cookieStore = await cookies();
        const orgName = cookieStore.get('dev_org_name')?.value || "Local Dev Organization";
        const baseCurrency = cookieStore.get('dev_org_currency')?.value || "MYR";
        const fiscalYearStart = parseInt(cookieStore.get('dev_org_fiscal_year')?.value || "1", 10);
        const devStatus = cookieStore.get('dev_org_status')?.value || "pro";

        return {
            id: organization_id,
            name: orgName,
            base_currency: baseCurrency,
            fiscal_year_start: fiscalYearStart,
            registration_id: "",
            subscription_status: devStatus,
            subscription_tier: devStatus === 'pro' ? 'growth' : 'free',
            cancel_at_period_end: cookieStore.get('dev_org_cancelled')?.value === 'true',
            subscription_end_date: cookieStore.get('dev_org_end_date')?.value || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        };
    }

    const { data, error } = await supabase
        .from("organizations")
        .select("*")
        .eq("id", organization_id)
        .single()

    if (error) {
        console.error("Failed to fetch org settings. Error code:", error.code, "Message:", error.message)
        return null
    }
    return data
}

export async function updateOrganizationSettings(updates: any) {
    await checkWriteAccess();
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    const cookieStore = await cookies();
    if (updates.base_currency) {
        cookieStore.set('active_org_currency', updates.base_currency, { path: '/' });
    }

    if (process.env.NODE_ENV === 'development' && organization_id === '00000000-0000-0000-0000-000000000000') {
        if (updates.name) cookieStore.set('dev_org_name', updates.name, { path: '/' });
        if (updates.base_currency) cookieStore.set('dev_org_currency', updates.base_currency, { path: '/' });
        if (updates.fiscal_year_start) cookieStore.set('dev_org_fiscal_year', updates.fiscal_year_start.toString(), { path: '/' });

        revalidatePath("/settings")
        revalidatePath("/dashboard")
        revalidatePath("/ledger")
        revalidatePath("/vendors")
        revalidatePath("/reports")
        revalidatePath("/procurement")
        return { success: true, data: { ...updates, id: organization_id } };
    }

    const { data, error } = await supabase
        .from("organizations")
        .update({
            name: updates.name,
            registration_id: updates.registration_id,
            base_currency: updates.base_currency,
            fiscal_year_start: updates.fiscal_year_start
        })
        .eq("id", organization_id)
        .select()
        .single()

    if (error) {
        console.error("Failed to update org settings:", error)
        throw new Error("Failed to update organization settings")
    }

    revalidatePath("/settings")
    revalidatePath("/dashboard")
    revalidatePath("/ledger")
    revalidatePath("/vendors")
    revalidatePath("/reports")
    revalidatePath("/procurement")
    return { success: true, data }
}

// --- Funds ---

export async function getSettingsFunds() {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    if (process.env.NODE_ENV === 'development' && organization_id === '00000000-0000-0000-0000-000000000000') {
        const cookieStore = await cookies();
        const choice = cookieStore.get('dev_template_choice')?.value || 'digital_agency';
        const template = TEMPLATES[choice] || TEMPLATES.digital_agency;
        return template.funds.map((f: any, i: number) => ({
            id: `mock-fund-${i}`,
            organization_id,
            name: f.name
        }));
    }

    const { data, error } = await supabase
        .from("funds")
        .select("*")
        .eq("organization_id", organization_id)
        .order("name")

    if (error) return []
    return data
}

export async function addSettingFund(name: string, code?: string) {
    await checkWriteAccess();
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    if (process.env.NODE_ENV === 'development' && organization_id === '00000000-0000-0000-0000-000000000000') {
        revalidatePath("/", "layout")
        return { success: true }
    }

    const { error } = await supabase
        .from("funds")
        .insert({
            organization_id,
            name,
            code
        })

    if (error) {
        console.error("Supabase Error (addSettingFund):", error)
        throw new Error("Failed to add fund")
    }
    revalidatePath("/", "layout")
    return { success: true }
}

export async function deleteSettingFund(id: string) {
    await checkWriteAccess();
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    if (process.env.NODE_ENV === 'development' && organization_id === '00000000-0000-0000-0000-000000000000') {
        revalidatePath("/", "layout")
        return { success: true }
    }

    const { error } = await supabase
        .from("funds")
        .delete()
        .eq("id", id)
        .eq("organization_id", organization_id)

    if (error) {
        console.error("Supabase Error (deleteSettingFund):", error)
        throw new Error("Failed to delete fund")
    }
    revalidatePath("/", "layout")
    return { success: true }
}

// --- Categories ---

export async function getSettingsCategories() {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    if (process.env.NODE_ENV === 'development' && organization_id === '00000000-0000-0000-0000-000000000000') {
        const cookieStore = await cookies();
        const choice = cookieStore.get('dev_template_choice')?.value || 'digital_agency';
        const template = TEMPLATES[choice] || TEMPLATES.digital_agency;
        return template.categories.map((c: any, i: number) => ({
            id: `mock-category-${i}`,
            organization_id,
            name: c.name
        }));
    }

    const { data, error } = await supabase
        .from("categories")
        .select("*")
        .eq("organization_id", organization_id)
        .order("name")

    if (error) return []
    return data
}

export async function addSettingCategory(name: string) {
    await checkWriteAccess();
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    if (process.env.NODE_ENV === 'development' && organization_id === '00000000-0000-0000-0000-000000000000') {
        revalidatePath("/", "layout")
        return { success: true }
    }

    const { error } = await supabase
        .from("categories")
        .insert({
            organization_id,
            name
        })

    if (error) {
        console.error("Supabase Error (addSettingCategory):", error)
        throw new Error("Failed to add category")
    }
    revalidatePath("/", "layout")
    return { success: true }
}

export async function deleteSettingCategory(id: string) {
    await checkWriteAccess();
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    if (process.env.NODE_ENV === 'development' && organization_id === '00000000-0000-0000-0000-000000000000') {
        revalidatePath("/", "layout")
        return { success: true }
    }

    const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", id)
        .eq("organization_id", organization_id)

    if (error) {
        console.error("Supabase Error (deleteSettingCategory):", error)
        throw new Error("Failed to delete category")
    }
    revalidatePath("/", "layout")
    return { success: true }
}

// --- Team Management ---

export async function getTeamMembers() {
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    if (!organization_id) {
        return []
    }

    // 1. Fetch active members
    const { data: activeMembers, error: activeError } = await supabase
        .from("user_roles")
        .select("*")
        .eq("organization_id", organization_id)
        .order("created_at")

    if (activeError) {
        console.error("Failed to fetch active team members:", activeError)
    }

    // 2. Fetch pending invites using the admin client to bypass RLS
    const adminClient = createAdminClient()
    const { data: pendingInvites, error: pendingError } = await adminClient
        .from("workspace_invites")
        .select("*")
        .eq("organization_id", organization_id)
        .order("created_at")

    if (pendingError) {
        console.error("Failed to fetch pending workspace invites:", pendingError)
    }

    const activeList = activeMembers || []
    const pendingList = (pendingInvites || []).map((invite: any) => ({
        id: invite.id,
        organization_id: invite.organization_id,
        email: invite.email,
        role: invite.role,
        full_name: null, // renders as "Pending Invite" in frontend
        created_at: invite.created_at,
        is_pending: true
    }))

    return [...activeList, ...pendingList]
}

export async function inviteTeamMember(email: string, full_name: string, role: string) {
    const currentUserRole = await checkWriteAccess();
    const supabase = await createClient()
    const organization_id = await getOrganizationId()

    // Validate the requested role. Admin can only be created by the system initially.
    if (role !== "Editor" && role !== "Viewer") {
        role = "Viewer";
    }

    // 1. Check if user is already an active member of this organization
    const { data: existingMember, error: memberCheckError } = await supabase
        .from("user_roles")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("email", email)
        .maybeSingle()

    if (memberCheckError) {
        console.error("Error checking existing members:", memberCheckError)
    }

    if (existingMember) {
        return {
            success: false,
            error: "ALREADY_MEMBER",
            message: "This email is already a member of this workspace."
        }
    }

    // 2. Check if user already has a pending invite for this organization
    const adminClient = createAdminClient()
    const { data: existingInvite, error: inviteCheckError } = await adminClient
        .from("workspace_invites")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("email", email)
        .maybeSingle()

    if (inviteCheckError) {
        console.error("Error checking existing invites:", inviteCheckError)
    }

    if (existingInvite) {
        return {
            success: false,
            error: "ALREADY_INVITED",
            message: "An invitation has already been sent to this email address."
        }
    }

    // 3. Determine tier and seat limits
    let isGrowth = false
    if (process.env.NODE_ENV === 'development' && organization_id === '00000000-0000-0000-0000-000000000000') {
        const cookieStore = await cookies();
        const devStatus = cookieStore.get('dev_org_status')?.value || "pro";
        isGrowth = devStatus === 'pro';
    } else {
        const { data: org, error: orgError } = await supabase
            .from("organizations")
            .select("subscription_tier, subscription_status")
            .eq("id", organization_id)
            .single()

        if (orgError) {
            console.error("Failed to verify subscription status:", orgError)
            throw new Error("Failed to verify subscription status")
        }

        isGrowth = org?.subscription_tier === 'growth' || org?.subscription_status === 'pro';
    }

    const limit = isGrowth ? 5 : 1;

    // 4. Count existing active members
    const { data: members, error: countError } = await supabase
        .from("user_roles")
        .select("id")
        .eq("organization_id", organization_id)

    if (countError) {
        console.error("Failed to verify team size:", countError)
        throw new Error("Failed to verify team size")
    }

    // 5. Count existing pending invites
    const { count: pendingCount, error: pendingCountError } = await adminClient
        .from("workspace_invites")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", organization_id)

    if (pendingCountError) {
        console.error("Failed to verify pending invites count:", pendingCountError)
        throw new Error("Failed to verify pending invites count")
    }

    const totalSeatsUsed = (members?.length || 0) + (pendingCount || 0)

    // 6. Block if total seats used (active + pending) exceeds limits
    if (totalSeatsUsed >= limit) {
        return {
            success: false,
            error: "LIMIT_REACHED",
            message: `You have reached your seat limit of ${limit} members. Please upgrade your subscription to add more.`
        }
    }

    // 7. Store the invite relation in workspace_invites
    const { error: dbInviteError } = await adminClient
        .from("workspace_invites")
        .insert({
            organization_id,
            email,
            role
        })

    if (dbInviteError) {
        if (dbInviteError.code === "23505") {
            return {
                success: false,
                error: "ALREADY_INVITED",
                message: "An invitation has already been sent to this email address."
            }
        }
        console.error("Failed to save invitation to database:", dbInviteError)
        throw new Error("Failed to create invitation: " + dbInviteError.message)
    }

    // 8. Call Supabase Auth admin API to invite user
    let isAlreadyRegistered = false
    try {
        const headersList = await headers()
        const host = headersList.get("host") || "localhost:3000"
        const protocol = process.env.NODE_ENV === "development" ? "http" : "https"
        const redirectTo = `${protocol}://${host}/accept-invite`

        const { error: authInviteError } = await adminClient.auth.admin.inviteUserByEmail(
            email,
            { redirectTo }
        )

        if (authInviteError) {
            if (authInviteError.message.toLowerCase().includes("already") && authInviteError.message.toLowerCase().includes("registered")) {
                isAlreadyRegistered = true
            } else {
                console.error("Supabase Admin Auth invite error:", authInviteError)
                // Roll back database invite entry
                await adminClient
                    .from("workspace_invites")
                    .delete()
                    .eq("organization_id", organization_id)
                    .eq("email", email)

                throw new Error(authInviteError.message)
            }
        }
    } catch (inviteErr: any) {
        if (inviteErr.message.toLowerCase().includes("already") && inviteErr.message.toLowerCase().includes("registered")) {
            isAlreadyRegistered = true
        } else {
            throw new Error("Failed to dispatch auth invitation email: " + inviteErr.message)
        }
    }

    revalidatePath("/settings")
    if (isAlreadyRegistered) {
        return {
            success: true,
            message: "This user is already registered with Outlayd. They have been added to this workspace's invites and will gain access automatically upon their next login."
        }
    }
    return { success: true }
}

export async function revokeTeamMember(memberId: string) {
    const role = await getCurrentUserRole();
    if (role !== 'Admin') {
        throw new Error("Unauthorized: Only Admins can revoke team member access.");
    }
    const supabase = await createClient()
    const { data: { user: currentUser } } = await supabase.auth.getUser()

    if (!currentUser || !currentUser.email) {
        throw new Error("Authentication required")
    }

    const organization_id = await getOrganizationId()
    const adminClient = createAdminClient()

    // 1. Try deleting from workspace_invites first (pending invites) using the admin client to bypass RLS
    const { data: inviteDeleted, error: inviteDeleteError } = await adminClient
        .from("workspace_invites")
        .delete()
        .eq("id", memberId)
        .eq("organization_id", organization_id)
        .select()

    let deletedEmail: string | null = null

    if (inviteDeleted && inviteDeleted.length > 0) {
        deletedEmail = inviteDeleted[0].email
    } else {
        // 2. If no invite was deleted, delete from user_roles (active members)
        // Find the active member first to get their email and verify it's not the current user
        const { data: activeMember } = await supabase
            .from("user_roles")
            .select("email")
            .eq("id", memberId)
            .eq("organization_id", organization_id)
            .single()

        if (activeMember?.email) {
            deletedEmail = activeMember.email

            // Guard: Prevent self-revocation
            if (activeMember.email.toLowerCase() === currentUser.email.toLowerCase()) {
                throw new Error("You cannot revoke your own access to the workspace.")
            }

            const { error: roleDeleteError } = await supabase
                .from("user_roles")
                .delete()
                .eq("id", memberId)
                .eq("organization_id", organization_id)

            if (roleDeleteError) {
                console.error("Failed to revoke active team member:", roleDeleteError)
                throw new Error("Failed to revoke team member: " + roleDeleteError.message)
            }
        }
    }

    revalidatePath("/settings")
    return { success: true }
}

export async function acceptInvite(password: string, fullName: string) {
    const supabase = await createClient()

    // 1. Get currently authenticated user (invited link login)
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user || !user.email) {
        return { success: false, error: "AUTH_REQUIRED", message: "You must use the secure link sent to your email to accept this invite." }
    }

    // 2. Fetch pending invite from workspace_invites using admin client
    const adminClient = createAdminClient()
    const { data: invite, error: inviteError } = await adminClient
        .from("workspace_invites")
        .select("*")
        .eq("email", user.email)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()

    if (inviteError || !invite) {
        console.error("Invite record look up failed:", inviteError)
        return { success: false, error: "INVITE_NOT_FOUND", message: "No active workspace invitation was found for your email address." }
    }

    const { organization_id, role } = invite

    // 3. Set the password and user full name
    const { error: authUpdateError } = await supabase.auth.updateUser({
        password,
        data: { full_name: fullName }
    })

    if (authUpdateError) {
        return { success: false, error: "PASSWORD_UPDATE_FAILED", message: authUpdateError.message }
    }

    // 4. Update the user metadata via Admin client (keep onboarding_completed, but avoid overwriting organization_id)
    const { error: metadataError } = await adminClient.auth.admin.updateUserById(
        user.id,
        { user_metadata: { onboarding_completed: true } }
    )

    if (metadataError) {
        console.error("Failed to update organization metadata on user auth:", metadataError)
    }

    // Set active workspace cookie client-side
    const cookieStore = await cookies()
    cookieStore.set('active_org_id', organization_id, { path: '/' })

    // 5. Insert active role mapped to user_roles
    const { error: roleInsertError } = await adminClient
        .from("user_roles")
        .insert({
            organization_id,
            email: user.email,
            role,
            full_name: fullName
        })

    if (roleInsertError) {
        console.error("Failed to insert mapping inside user_roles table:", roleInsertError)
        return { success: false, error: "ROLE_ASSIGNMENT_FAILED", message: "Failed to map user access: " + roleInsertError.message }
    }

    // 6. Cleanup workspace_invites record
    await adminClient
        .from("workspace_invites")
        .delete()
        .eq("id", invite.id)

    revalidatePath("/settings")
    return { success: true }
}

// --- Subscription / Upgrade ---

export async function verifyCheckoutSession(sessionId: string) {
    const organization_id = await getOrganizationId()

    try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
            apiVersion: '2026-02-25.clover',
        });

        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status === 'paid' && session.metadata?.organization_id === organization_id) {
            const customerId = typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id || null;
            const tier = session.metadata?.tier || 'growth';
            // Billing changes are server-only: the RPC is no longer callable with the user's session.
            const adminClient = createAdminClient();
            const { error } = await adminClient
                .rpc('upgrade_org_to_pro', {
                    org_id: organization_id,
                    p_tier: tier,
                    p_customer_id: customerId
                });

            if (error) {
                console.error('Error upgrading org from client verify via RPC:', error);
                // Fallback: direct update via admin client
                await adminClient.from('organizations').update({
                    subscription_status: 'pro',
                    subscription_tier: tier,
                    stripe_customer_id: customerId || undefined,
                    cancel_at_period_end: false,
                    subscription_end_date: null
                }).eq('id', organization_id);
            }

            revalidatePath("/", "layout")
            return { success: true };
        }

    } catch (e) {
        console.error("verifyCheckoutSession error:", e)
    }

    return { success: false };
}

export async function deleteOrganizationAccount() {
    const role = await checkWriteAccess();
    if (role !== 'Admin') {
        throw new Error("Unauthorized: Only Admins can delete the organization account.");
    }
    const supabase = await createClient();
    const organization_id = await getOrganizationId();

    if (process.env.NODE_ENV === 'development' && organization_id === '00000000-0000-0000-0000-000000000000') {
        const cookieStore = await cookies();
        cookieStore.set('dev_org_id', '', { maxAge: 0, path: '/' });
        cookieStore.set('dev_org_name', '', { maxAge: 0, path: '/' });
        cookieStore.set('dev_org_currency', '', { maxAge: 0, path: '/' });
        cookieStore.set('dev_org_fiscal_year', '', { maxAge: 0, path: '/' });
        cookieStore.set('dev_template_choice', '', { maxAge: 0, path: '/' });
        cookieStore.set('active_org_id', '', { maxAge: 0, path: '/' });
        cookieStore.set('dev_org_status', '', { maxAge: 0, path: '/' });
        cookieStore.set('dev_org_cancelled', '', { maxAge: 0, path: '/' });
        cookieStore.set('dev_org_end_date', '', { maxAge: 0, path: '/' });
        return { success: true };
    }

    const adminClient = createAdminClient();
    const { data: org, error: orgError } = await adminClient
        .from('organizations')
        .select('stripe_customer_id, subscription_status, subscription_tier')
        .eq('id', organization_id)
        .single();

    if (orgError) {
        console.error("Failed to fetch organization for deletion:", orgError);
        throw new Error("Failed to delete organization: data fetch failed");
    }

    // 1. Cancel Stripe subscriptions if on growth/pro plan
    const isGrowth = org?.subscription_tier === 'growth' || org?.subscription_status === 'pro';
    const stripeCustomerId = org?.stripe_customer_id;

    if (isGrowth && stripeCustomerId && process.env.STRIPE_SECRET_KEY) {
        try {
            const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
                apiVersion: '2026-02-25.clover' as any,
            });
            const subscriptions = await stripe.subscriptions.list({
                customer: stripeCustomerId,
                status: 'active',
            });
            for (const sub of subscriptions.data) {
                await stripe.subscriptions.cancel(sub.id);
                console.log(`Cancelled Stripe subscription ${sub.id}`);
            }
        } catch (stripeError) {
            console.error("Stripe subscription cancellation failed during account deletion:", stripeError);
        }
    }

    // 2. Fetch all team members in user_roles for this organization
    const { data: members, error: membersError } = await adminClient
        .from("user_roles")
        .select("email")
        .eq("organization_id", organization_id);

    if (membersError) {
        console.error("Failed to fetch team members for deletion:", membersError);
    } else if (members) {
        // Delete users from Supabase Auth
        for (const member of members) {
            try {
                const { data: userId, error: rpcError } = await adminClient.rpc('get_user_id_by_email', {
                    email_address: member.email
                });
                if (rpcError) {
                    console.error(`Failed to get user ID for email ${member.email}:`, rpcError);
                    continue;
                }
                if (userId) {
                    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId);
                    if (deleteAuthError) {
                        console.error(`Failed to delete Auth User ${member.email}:`, deleteAuthError);
                    } else {
                        console.log(`Deleted Auth User ${member.email}`);
                    }
                }
            } catch (err) {
                console.error(`Error deleting user ${member.email}:`, err);
            }
        }
    }

    // 3. Sequentially delete all data associated with the organization to satisfy FK constraints
    const tablesToDelete = [
        "quotes",
        "procurement_projects",
        "documents",
        "vendors",
        "funds",
        "categories",
        "workspace_invites",
        "user_profiles",
        "user_roles"
    ];

    for (const table of tablesToDelete) {
        const { error } = await adminClient
            .from(table)
            .delete()
            .eq("organization_id", organization_id);
        if (error) {
            console.error(`Failed to delete data from table ${table}:`, error);
            throw new Error(`Failed to delete organization data in table ${table}: ${error.message}`);
        }
    }

    // 4. Finally delete the organization record itself
    const { error: deleteOrgError } = await adminClient
        .from("organizations")
        .delete()
        .eq("id", organization_id);

    if (deleteOrgError) {
        console.error("Failed to delete organization record:", deleteOrgError);
        throw new Error(`Failed to delete organization: ${deleteOrgError.message}`);
    }

    // 5. Clear active organization cookie
    const cookieStore = await cookies();
    cookieStore.set('active_org_id', '', { maxAge: 0, path: '/' });

    return { success: true };
}




