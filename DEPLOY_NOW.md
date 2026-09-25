# Deploy Khushdil Billing Buddy to Vercel

## 1. Supabase
Create/open your Supabase project and run all SQL migrations in `supabase/migrations/`, especially:
`20260925000000_login_free_shared_workspace.sql`

That final migration changes the app to one login-free shared workspace.

## 2. Vercel environment variables
Add:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Use the values from Supabase Project Settings → API.

## 3. Deploy
Import this repository into Vercel. Framework: **TanStack Start**.
Build command: `npm run build`.

## 4. Important
There is deliberately no login. Anyone who can access the site can read/change the shared billing data. Do not use this setup for sensitive data.
