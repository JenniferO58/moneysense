# MoneySense AI — Backend Skeleton (Day 2)

## What's in here

- `api/_lib/supabase.js` — shared Supabase client + JWT verification helper,
  used by every function
- `api/test-connection.js` — a simple endpoint to confirm Vercel can talk
  to Supabase (delete this once real functions are built and tested)
- `public/index.html` — placeholder page so Vercel has a homepage to serve

## Setup

1. Copy your Supabase credentials from:
   Supabase dashboard → Project Settings → API
   - Project URL
   - service_role key (NOT the anon key — this one bypasses RLS,
     used server-side only)

2. Deploy to Vercel via GitHub (same as the prompt-test project):
   - Push this folder to a new GitHub repo
   - Vercel → New Project → Import that repo
   - Before deploying, add environment variables:
     - `SUPABASE_URL` = your Project URL
     - `SUPABASE_SERVICE_ROLE_KEY` = your service_role key
   - Deploy

3. Once deployed, visit `https://your-project.vercel.app/api/test-connection`
   You should see JSON listing your 9 categories. If you see an error
   instead, double check the environment variables are set correctly
   and redeploy.

## What's next (Day 3)

Once the connection test works, the next files to build are:
- `api/transactions/create.js` — insert a transaction
- `api/summary/generate.js` — the AI summary call (uses the finalised
  system prompt from the prompt-test project)
