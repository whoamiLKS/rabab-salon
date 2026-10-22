# Account-based salon synchronization

The deployed Supabase project is `wicakbsswxzhwlbxhxxs`.
Access is controlled by `salon_members.user_id`, matching the authenticated account.
To authorize an additional trusted account, insert its Auth user ID into salon_members via the dashboard.
There is no device limit. Both sessions must use an authorized account.

Every business edit is queued locally per Supabase project and user ID. The client reads the current server revision and applies only actual local edits. The write succeeds only if that revision is still current; otherwise it re-reads and reapplies the edits. The database trigger increments revisions and supplies the update timestamp.
Realtime and periodic polling refresh other sessions. Editing forms are not overwritten by background refreshes. Pending edits survive reloads and connection failures. Success is displayed only after the write is confirmed.

The first load of this version keeps a local recovery snapshot under `rabab_before_sync_v2:<user-id>`. Existing untracked cache is not automatically uploaded over the canonical database.

Run regression tests with `node --test tests/sync.test.cjs`.
