export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { getOrganizationId } from '@/app/actions/document-utils';

const SPENDSYNC_PRO_PRICE_ID = 'price_1TErcuAoi98hcDUgCdxGVFX3';

export async function POST(req: Request) {
    try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
            apiVersion: '2026-02-25.clover',
        });

        const body = await req.json();

        // Accept orgId from the body, or derive it from the authenticated session
        let orgId: string | null = body.orgId ?? null;
        if (!orgId) {
            orgId = await getOrganizationId();
        }

        if (!orgId) {
            return NextResponse.json({ error: 'Organization ID is required' }, { status: 400 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Step 1: Look up the Stripe customer ID stored in DB
        const { data: org, error: orgError } = await supabase
            .from('organizations')
            .select('stripe_customer_id, subscription_status')
            .eq('id', orgId)
            .single();

        if (orgError) {
            console.error('Failed to query organization:', orgError);
            return NextResponse.json({ error: 'Failed to load organization data' }, { status: 500 });
        }

        // Free tier — not entitled to portal access
        if (org?.subscription_status !== 'pro') {
            return NextResponse.json(
                { error: 'The Customer Portal is only available on the Pro plan.' },
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

        // Step 3: Fallback — search Stripe customers by user email
        if (!stripeCustomerId) {
            console.log(`Searching Stripe customers by email...`);
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user?.email) {
                    const customers = await stripe.customers.list({
                        email: user.email,
                        limit: 1,
                    });
                    const customer = customers.data[0];
                    if (customer) {
                        stripeCustomerId = customer.id;
                        console.log(`Found customer ${stripeCustomerId} via email lookup`);
                    }
                }
            } catch (err) {
                console.warn('Email-based customer lookup failed:', err);
            }
        }

        // Step 4: Fallback — search Stripe subscriptions by org metadata
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

        // Step 5: Fallback — search checkout.sessions as a last resort
        if (!stripeCustomerId) {
            console.log(`Searching checkout sessions for org ${orgId}...`);
            try {
                const sessions = await stripe.checkout.sessions.list({
                    limit: 5, // Check recent sessions
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

        // Step 6: Backfill DB if we found the ID via any fallback
        if (stripeCustomerId && !org?.stripe_customer_id) {
            const { error: updateError } = await supabase
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
                { error: 'No billing account found. Please contact support.' },
                { status: 404 }
            );
        }

        const origin = process.env.NEXT_PUBLIC_APP_URL || req.headers.get('origin') || 'http://localhost:3000';

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: stripeCustomerId,
            configuration: 'bpc_1TFFMKAoi98hcDUge5azAqym',
            return_url: `${origin}/settings`,
        });

        return NextResponse.json({ url: portalSession.url });
    } catch (err: any) {
        console.error('Stripe portal session error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
