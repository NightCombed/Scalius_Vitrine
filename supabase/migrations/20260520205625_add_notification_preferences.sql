-- Migration to add notification_email and notification_preferences to store_settings
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS notification_email text,
  ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{}'::jsonb;
