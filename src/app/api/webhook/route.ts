import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    // Note for Express users: In Next.js App Router, there is no global express.json() middleware.
    // We achieve the exact equivalent of express.raw({type: 'application/json'}) by reading the stream as text.
    // This allows us to accurately verify the Stripe signature without middleware parsing interference.
    
    let rawBody: string;
    try {
        rawBody = await req.text();
    } catch (err) {
        return NextResponse.json({ error: 'Failed to read request body' }, { status: 400 });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
        apiVersion: '2026-02-25.clover',
    });

    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!endpointSecret) {
        console.error('Webhook secret is not configured.');
        return NextResponse.json({ error: 'Webhook secret is not configured.' }, { status: 500 });
    }

    const sig = req.headers.get('stripe-signature');

    if (!sig) {
        return NextResponse.json({ error: 'No stripe signature found.' }, { status: 400 });
    }

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
    } catch (err: any) {
        console.error(`Webhook signature verification failed: ${err.message}`);
        return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
    }

    // Handle multi-event types for subscription lifecycle
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const organizationId = session.metadata?.organization_id;
        const stripeCustomerId = session.customer as string | null;

        if (organizationId) {
            try {
                const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
                const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
                const supabase = createClient(supabaseUrl, supabaseKey);

                // 1. Upgrade status
                await supabase.rpc('upgrade_org_to_pro', { org_id: organizationId });

                // 2. Persist Customer ID and reset any cancellation flags
                if (stripeCustomerId) {
                    await supabase
                        .from('organizations')
                        .update({ 
                            stripe_customer_id: stripeCustomerId,
                            subscription_tier: 'growth',
                            cancel_at_period_end: false,
                            subscription_end_date: null
                        })
                        .eq('id', organizationId);
                }
                
                console.log(`Successfully processed checkout for org ${organizationId}`);
            } catch (dbErr) {
                console.error('Database update failed:', dbErr);
            }
        }
    } 

    if (event.type === 'customer.subscription.updated') {
        const subscription = event.data.object as Stripe.Subscription;
        let organizationId = subscription.metadata?.organization_id;
        const stripeCustomerId = subscription.customer as string;

        try {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
            const supabase = createClient(supabaseUrl, supabaseKey);

            // Fallback: If organization_id is missing from metadata, lookup by stripe_customer_id
            if (!organizationId) {
                const { data: orgLookup } = await supabase
                    .from('organizations')
                    .select('id')
                    .eq('stripe_customer_id', stripeCustomerId)
                    .single();
                
                organizationId = orgLookup?.id;
            }

            if (organizationId) {
                const status = (subscription.status === 'active' || subscription.status === 'trialing') ? 'pro' : 'free';
                const tier = status === 'pro' ? 'growth' : 'free';
                
                // Use a permissive type for legacy period resolution
                const subData = subscription as any;

                await supabase
                    .from('organizations')
                    .update({ 
                        subscription_status: status,
                        subscription_tier: tier,
                        cancel_at_period_end: subData.cancel_at_period_end,
                        subscription_end_date: new Date(subData.current_period_end * 1000).toISOString()
                    })
                    .eq('id', organizationId);

                console.log(`Updated subscription for org ${organizationId}: ${status} (Cancelled: ${subscription.cancel_at_period_end})`);
            }
        } catch (dbErr) {
            console.error('Subscription update failed:', dbErr);
        }
    }

    if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as Stripe.Subscription;
        let organizationId = subscription.metadata?.organization_id;
        const stripeCustomerId = subscription.customer as string;

        try {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
            const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
            const supabase = createClient(supabaseUrl, supabaseKey);

            // Fallback: Lookup by stripe_customer_id if metadata is missing
            if (!organizationId) {
                const { data: orgLookup } = await supabase
                    .from('organizations')
                    .select('id')
                    .eq('stripe_customer_id', stripeCustomerId)
                    .single();
                
                organizationId = orgLookup?.id;
            }

            if (organizationId) {
                await supabase
                    .from('organizations')
                    .update({ 
                        subscription_status: 'free',
                        subscription_tier: 'free',
                        cancel_at_period_end: false,
                        subscription_end_date: null
                    })
                    .eq('id', organizationId);

                console.log(`Subscription ended for org ${organizationId}. Downgraded to FREE.`);
            }
        } catch (dbErr) {
            console.error('Subscription deletion sync failed:', dbErr);
        }
    }

    // Always return a 200 status to Stripe at the end of the route
    return NextResponse.json({ received: true }, { status: 200 });
}
