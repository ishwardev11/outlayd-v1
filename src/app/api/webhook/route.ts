import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminClient } from '@/utils/supabase/admin';
import { handleCheckoutCompleted, handleSubscriptionChange } from '@/utils/stripe-sync';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    // Read the raw body so the Stripe signature can be verified exactly.
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

    try {
        // Service-role client only. There is deliberately no fallback to the public anon key:
        // billing columns can only be changed by the server, so an anon client would silently fail.
        const supabase = createAdminClient();

        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutCompleted({
                    supabase,
                    session: event.data.object as Stripe.Checkout.Session,
                });
                break;

            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
                await handleSubscriptionChange({
                    stripe,
                    supabase,
                    subscription: event.data.object as Stripe.Subscription,
                });
                break;

            default:
                // Other event types are not used. Acknowledge them so Stripe stops sending them.
                break;
        }

        return NextResponse.json({ received: true }, { status: 200 });
    } catch (err) {
        // A real failure (database down, missing key, Stripe error). Answer 500 so Stripe
        // retries this event for up to 3 days instead of treating it as delivered.
        console.error(`Webhook ${event.type} (${event.id}) failed:`, err);
        return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
    }
}
