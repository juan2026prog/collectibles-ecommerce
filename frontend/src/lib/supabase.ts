import { createClient } from '@supabase/supabase-js';

// IMPORTANT: Hardcoded values because Vercel's Supabase integration injects an
// sb_publishable key format that is incompatible with Edge Function invocations.
// The sb_publishable key causes 401 "Invalid Token or Protected Header formatting".
// These MUST be hardcoded to bypass Vercel's env var injection at build time.
const supabaseUrl = 'https://cobtsgkwcftvexaarwmo.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNvYnRzZ2t3Y2Z0dmV4YWFyd21vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1NzIwNTMsImV4cCI6MjA5MDE0ODA1M30.vXyiMl093ojZ8OyEpRuGnX5O5lHsLXxljynrYtMmf50';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
