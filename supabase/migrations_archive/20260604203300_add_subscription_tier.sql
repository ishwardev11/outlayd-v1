-- Add subscription_tier column to organizations table
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'free';

-- Set default subscription_tier values for existing organizations based on subscription_status
UPDATE public.organizations 
SET subscription_tier = CASE 
    WHEN subscription_status = 'pro' THEN 'growth' 
    ELSE 'free' 
END;
