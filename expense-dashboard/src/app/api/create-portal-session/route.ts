export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/utils/supabase/admin';
import { getOrganizationId, getCurrentUserRole } from '@/app/actions/document-utils';

export async function POST(req: Request) {
    try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
            apiVersion: '2026-02-25.clover',
        });

        // 1. Authenticate user organization
        const authenticatedOrgId = await getOrganizationId();
        if (!authenticatedOrgId) {
            return NextResponse.json({ error: 'Unauthorized: Please log in first.' }, { status: 401 });
        }

        // 2. Validate role - only Admins can manage billing portal
        const role = await getCurrentUserRole();
        if (role !== 'Admin') {
            return NextResponse.json({ error: 'Forbidden: Only Admins can manage billing subscriptions.' }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));

        // 3. Prevent IDOR: ensure requested org matches authenticated session
        if (body.orgId && body.orgId !== authenticatedOrgId) {
            return NextResponse.json({ error: 'Unauthorized organization access' }, { status: 403 });
        }

        const orgId = authenticatedOrgId;
        const adminClient = createAdminClient();

        // Step 1: Look up the Stripe customer ID and plan stored in DB
        const { data: org, error: orgError } = await adminClient
            .from('organizations')
            .select('stripe_customer_id, subscription_status, subscription_tier')
            .eq('id', orgId)
            .single();

        if (orgError) {
            console.error('Failed to query organization:', orgError);
            return NextResponse.json({ error: 'Failed to load organization data' }, { status: 500 });
        }

        // Free tier — not entitled to portal access
        const isPro = org?.subscription_status === 'pro' || org?.subscription_tier === 'growth' || org?.subscription_tier === 'nonprofit';
        if (!isPro) {
            return NextResponse.json(
                { error: 'The Customer Portal is only available on paid plans.' },
                { status: 403 }
            );
        }

        let stripeCustomerId = org?.stripe_customer_id ?? null;

        // Step 2: Fallback — search Stripe customers by org metadata
        if (!stripeCustomerId) {
            console.log(`No stripe_customer_id in DB for org ${orgId} — searching customers...`);
            try {
                const customers = await stripe.customers.search({
                    query: `metadata['organization_id']:'${orgId}'`,
                    limit: 1,
                });
                const customer = customers.data[0];
                if (customer) {
                    stripeCustomerId = customer.id;
                    console.log(`Found customer ${stripeCustomerId} via customer search`);
                }
            } catch (err) {
                console.warn('Customer search failed:', err);
            }
        }

        // Step 3: Fallback — search Stripe subscriptions by org metadata
        if (!stripeCustomerId) {
            console.log(`Falling back to subscription search for org ${orgId}...`);
            try {
                const subscriptions = await stripe.subscriptions.search({
                    query: `metadata['organization_id']:'${orgId}' AND status:'active'`,
                    limit: 1,
                });
                const sub = subscriptions.data[0];
                if (sub?.customer) {
                    stripeCustomerId = sub.customer as string;
                    console.log(`Found customer ${stripeCustomerId} via subscription metadata search`);
                }
            } catch (err) {
                console.warn('Subscription metadata search failed:', err);
            }
        }

        // Step 4: Fallback — search checkout.sessions as a last resort
        if (!stripeCustomerId) {
            console.log(`Searching checkout sessions for org ${orgId}...`);
            try {
                const sessions = await stripe.checkout.sessions.list({
                    limit: 10,
                });
                const match = sessions.data.find(s => s.metadata?.organization_id === orgId && s.customer);
                if (match?.customer) {
                    stripeCustomerId = match.customer as string;
                    console.log(`Found customer ${stripeCustomerId} via checkout session metadata`);
                }
            } catch (err) {
                console.warn('Checkout session search failed:', err);
            }
        }

        // Step 5: Backfill DB if we found the ID via any fallback
        if (stripeCustomerId && !org?.stripe_customer_id) {
            const { error: updateError } = await adminClient
                .from('organizations')
                .update({ stripe_customer_id: stripeCustomerId })
                .eq('id', orgId);

            if (updateError) {
                console.warn('Failed to backfill stripe_customer_id:', updateError);
            } else {
                console.log(`Backfilled stripe_customer_id ${stripeCustomerId} for org ${orgId}`);
            }
        }

        if (!stripeCustomerId) {
            return NextResponse.json(
                { error: 'No billing account found. Please upgrade to a paid plan first.' },
                { status: 404 }
            );
        }

        // Verify customer exists in current Stripe environment (prevents test-mode IDs from crashing live portal)
        try {
            const customer = await stripe.customers.retrieve(stripeCustomerId);
            if (customer.deleted) {
                throw new Error('Customer was deleted in Stripe');
            }
        } catch (custErr: any) {
            console.warn(`Customer ${stripeCustomerId} not valid in current Stripe environment:`, custErr.message);
            // Stale test customer ID in live mode or deleted customer: clean up organization record
            await adminClient
                .from('organizations')
                .update({ 
                    stripe_customer_id: null,
                    subscription_status: 'free',
                    subscription_tier: 'free'
                })
                .eq('id', orgId);

            return NextResponse.json(
                { error: 'Your billing record was from the previous test environment. Your plan has been reset so you can upgrade with a live subscription.' },
                { status: 400 }
            );
        }

        const origin = process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin') || 'http://localhost:3000';

        const portalParams: Stripe.BillingPortal.SessionCreateParams = {
            customer: stripeCustomerId,
            return_url: `${origin}/settings`,
        };

        // If a specific portal configuration is defined in env, use it; otherwise let Stripe use account default
        if (process.env.STRIPE_PORTAL_CONFIGURATION_ID) {
            portalParams.configuration = process.env.STRIPE_PORTAL_CONFIGURATION_ID;
        }

        const portalSession = await stripe.billingPortal.sessions.create(portalParams);

        return NextResponse.json({ url: portalSession.url });
    } catch (err: any) {
        console.error('Stripe portal session error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
