# Rabab Salon — Supabase connection

Project: `wicakbsswxzhwlbxhxxs` (Frankfurt).
The browser uses a publishable key. The salon_data table has RLS and Realtime enabled.

## Create the owner login
1. Open Supabase Authentication → Users → Add user → Create new user.
2. Choose an email and password, and enable Auto Confirm User.
3. In SQL Editor, grant that account salon access (replace the email):
```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || '{"salon_role":"owner"}'::jsonb
where email = 'YOUR_OWNER_EMAIL';
```
4. Sign in at https://rabab-salon.vercel.app/ using that account.
   If already signed in, sign out and back in to refresh permissions.

Old-project users are not transferred. Existing browser salon data is retained.
The first successful owner sign-in initializes the new cloud row from the browser.
Cross-device sync requires the same owner account on both devices.
