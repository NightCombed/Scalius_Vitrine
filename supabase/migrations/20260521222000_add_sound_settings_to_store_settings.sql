-- Add sound settings to store_settings table
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS sound_enabled boolean DEFAULT true;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS sound_volume text DEFAULT 'normal' CHECK (sound_volume IN ('baixo', 'normal', 'alto'));
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS silent_hours_enabled boolean DEFAULT false;
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS silent_hours_start text DEFAULT '20:00';
ALTER TABLE public.store_settings ADD COLUMN IF NOT EXISTS silent_hours_end text DEFAULT '08:00';
