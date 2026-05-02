import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase env vars (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are not set. ' +
      'Authentication will not work until you add them to frontend/.env.local',
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    // Navigator LockManager times out in some browsers / private-mode / multi-tab
    // setups (error: "Acquiring lock … timed out waiting 10000ms").
    // Overriding with a no-op bypasses the lock entirely — safe for a single-tab SPA.
    lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<unknown>) => fn(),
  },
})
