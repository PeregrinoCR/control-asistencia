import { createClient } from '@supabase/supabase-js';

/**
 * Connection to the school's Supabase project. The keys come from `.env.local`
 * (see `.env.example`); without them the app keeps using the sample data.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = url && key ? createClient(url, key) : null;
