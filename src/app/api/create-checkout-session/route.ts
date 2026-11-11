export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getOrganizationId, getCurrentUserRole } from '@/app/actions/document-utils';
import { createAdminClient } from '@/utils/supabase/admin';

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

        // 2. Validate role - only Admins can initiate subscription billing
        const role = await getCurrentUserRole();
        if (role !== 'Admin') {
            return NextResponse.json({ error: 'Forbidden: Only Admins can manage billing subscriptions.' }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));

        // 3. IDOR check: if body contains orgId, ensure it matches session
        if (body.orgId && body.orgId !== authenticatedOrgId) {
            return NextResponse.json({ error: 'Unauthorized organization access' }, { status: 403 });
        }

        const orgId = authenticatedOrgId;
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin') || 'http://localhost:3000';

        // SECURITY: the browser never chooses the price or the tier. Anything sent as
        // body.priceId / body.tier / body.plan is ignored. The nonprofit price is a Stripe
        // promotion code that customers enter on Stripe's checkout page.
        const tier = 'growth';
        const priceId = process.env.STRIPE_PRICE_ID_GROWTH || process.env.STRIPE_PRICE_ID || 'price_1UI92mAoi98hcDUg4w1jF3td';

        // Check if organization already has an existing Stripe customer ID
        let existingCustomerId: string | undefined;
        try {
            const adminClient = createAdminClient();
            const { data: org } = await adminClient
                .from('organizations')
                .select('stripe_customer_id, subscription_status')
                .eq('id', orgId)
                .single();
            if (org?.subscription_status === 'pro') {
                return NextResponse.json({ error: 'This organization already has an active subscription. Use "Manage subscription" instead.' }, { status: 400 });
            }
            if (org?.stripe_customer_id) {
                existingCustomerId = org.stripe_customer_id;
            }
        } catch (e) {
            console.warn('Could not check existing customer ID:', e);
        }

        const sessionParams: Stripe.Checkout.SessionCreateParams = {
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            allow_promotion_codes: true,
            metadata: {
                organization_id: orgId,
                tier: tier,
            },
            subscription_data: {
                metadata: {
                    organization_id: orgId,
                    tier: tier,
                },
            },
            success_url: `${baseUrl}/dashboard?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/dashboard`,
        };

        if (existingCustomerId) {
            try {
                const cust = await stripe.customers.retrieve(existingCustomerId);
                if (!cust.deleted) {
                    sessionParams.customer = existingCustomerId;
                    sessionParams.customer_update = {
                        name: 'auto',
                        address: 'auto',
                    };
                } else {
                    const adminClient = createAdminClient();
                    await adminClient.from('organizations').update({ stripe_customer_id: null }).eq('id', orgId);
                }
            } catch (err) {
                console.warn(`Customer ${existingCustomerId} not valid in current Stripe environment; resetting:`, err);
                const adminClient = createAdminClient();
                await adminClient.from('organizations').update({ stripe_customer_id: null }).eq('id', orgId);
            }
        }

        const session = await stripe.checkout.sessions.create(sessionParams);

        return NextResponse.json({ url: session.url });
    } catch (err: any) {
        console.error('Stripe checkout error:', err);
        return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 500 });
    }
}