# Khushdil Billing Buddy — Vercel deployment starter

This folder is a **portable export blueprint** for re-deploying the Khushdil Billing app on
Vercel as a pure Vite + React + Supabase SPA (no SSR, no Cloudflare Workers).

The working app inside this Lovable project is already cloud-synced and deployable from
Lovable itself (it uses TanStack Start + Cloudflare under the hood — that piece does NOT
port to Vercel cleanly). If you specifically need Vercel, follow this guide.

---

## What you keep when porting

All of these files are framework-agnostic and copy over with **no changes**:

```
src/components/ui/*           (shadcn primitives)
src/lib/business.ts
src/lib/invoice-storage.ts    (types + built-in catalog)
src/lib/cloud-storage.ts      (Supabase CRUD, all RLS-scoped)
src/lib/migration-from-local.ts
src/lib/invoice-pdf.ts
src/lib/utils.ts
src/hooks/use-cloud-data.ts
src/integrations/supabase/client.ts   (browser-only build of this; remove client.server.ts)
src/styles.css
```

The route files (`src/routes/*.tsx`) need to be converted to React Router pages — the
shape of the components themselves doesn't change, just the route shell.

---

## Vercel project setup (~10 minutes)

1. **Create a new Supabase project** at https://supabase.com (free tier is fine).

2. **Run the schema.** In the Supabase SQL editor, paste and run the SQL from
   `supabase/migrations/*.sql` of this Lovable project (they're all numbered, run in order).

3. **Enable the `invoices` storage bucket** in Supabase Dashboard → Storage → New bucket
   → name: `invoices`, public: OFF.

4. **Configure Google OAuth** (optional): Supabase Dashboard → Authentication → Providers
   → Google. See https://supabase.com/docs/guides/auth/social-login/auth-google.

5. **Scaffold a new Vite project locally:**

   ```bash
   bun create vite khushdil-vercel --template react-ts
   cd khushdil-vercel
   bun add @supabase/supabase-js react-router-dom framer-motion jspdf zod \
     class-variance-authority clsx tailwind-merge lucide-react sonner
   bun add -D tailwindcss @tailwindcss/vite
   ```

6. **Copy in the source files** listed in "What you keep when porting" above.

7. **Replace TanStack route files with React Router pages.** Each `src/routes/foo.tsx`
   becomes `src/pages/foo.tsx` and uses `react-router-dom`'s `<Routes>` / `<Route>` /
   `useNavigate()` instead of `createFileRoute`. The component bodies don't change.

8. **Add `.env.local`** (copy from `.env.example` in this folder).

9. **Add `vercel.json`** (in this folder) to your repo root.

10. **Push to GitHub**, then on Vercel:
    - Import the repo
    - Framework preset: **Vite**
    - Build command: `bun run build` (or `vite build`)
    - Output directory: `dist`
    - Add env vars from `.env.local`
    - Click Deploy

That's it — your Vercel deployment will hit the same Supabase backend.

---

## Files in this folder

- `vercel.json` — SPA rewrite so deep links and refresh work (fixes 404 on refresh).
- `.env.example` — Vercel environment variables you'll set in the dashboard.
- `README.md` — this file.

---

## Important notes

- **Don't use this folder as your source.** The actual working app is everything OUTSIDE
  this folder. This folder is a deployment recipe for when/if you want to leave Lovable.
- **Multi-device sync, realtime, RLS, and auth all work identically** on Vercel because
  they're 100% Supabase-side. The hosting choice doesn't affect them.
- **Lovable Cloud's Supabase** can also be reused from a Vercel deploy if you prefer —
  copy `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from this project's `.env`
  into Vercel env vars and skip steps 1–4 above.

---

## Production deployment checklist

- [ ] Schema migrated to your own Supabase project
- [ ] RLS enabled on every table (it is, in our schema)
- [ ] Google OAuth callback URL added (Supabase → Auth → URL Config)
- [ ] `invoices` storage bucket created with RLS policies
- [ ] Env vars set in Vercel
- [ ] Custom domain configured in Vercel (optional)
- [ ] Test sign-up, sign-in, invoice create, PDF download from a real Android phone
