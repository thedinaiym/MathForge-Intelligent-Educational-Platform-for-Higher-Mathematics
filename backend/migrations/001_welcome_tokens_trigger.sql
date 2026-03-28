-- Migration: 001_welcome_tokens_trigger.sql
-- Auto-create billing_accounts row with 50 welcome tokens
-- when a new user is inserted into auth.users (Supabase).
--
-- Run this once in Supabase SQL Editor or via psql.

-- 1. The trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user_billing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.billing_accounts (user_id, token_balance)
  VALUES (NEW.id, 50)
  ON CONFLICT (user_id) DO NOTHING;  -- idempotent: never overwrite existing balance

  RETURN NEW;
END;
$$;

-- 2. Attach the trigger to auth.users (fires after each INSERT)
DROP TRIGGER IF EXISTS on_auth_user_created_billing ON auth.users;

CREATE TRIGGER on_auth_user_created_billing
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_billing();
