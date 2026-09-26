import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dystsudjmawlgsvlccbv.supabase.co';
const supabaseAnonKey = 'sb_publishable_M75234QWAt5xzqKkT61xew_9_23G3Gq';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
