// Protected Supabase sign-in for Rabab Salon. No public sign-up: owner accounts are created in Supabase Auth.
(function () {
  let gate;
  let client;
  let realtimeChannel;
  let refreshing = false;
  let lastCloudUpdate = '';
  async function refreshRemote() {
    if (refreshing || document.hidden) return;
    if (cloudSyncTimeout || cloudWriteInProgress || cloudHasUnsavedChanges) { cloudRefreshPending = true; return; }
    refreshing = true;
    try { await pullStateFromCloud(true); } finally { refreshing = false; }
  }
  function subscribeRealtime() {
    if (realtimeChannel) return;
    realtimeChannel = ensureClient().channel('salon-live-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'salon_data', filter: 'id=eq.main_salon' }, payload => {
        const stamp = payload.new?.updated_at || '';
        if (stamp && stamp === lastCloudUpdate) return;
        lastCloudUpdate = stamp;
        refreshRemote();
      })
      .subscribe();
  }
  const $ = id => document.getElementById(id);
  const ensureClient = () => {
    const c = getSupabaseCredentials();
    if (!c.isConfigured || !window.supabase) throw new Error('Supabase is not configured.');
    client = getSupabaseClientInstance(c.url, c.key);
    return client;
  };
  const message = text => { const el = $('salon-auth-message'); if (el) el.textContent = text; };
  function showGate() { gate?.classList.remove('hidden'); }
  function hideGate() { gate?.classList.add('hidden'); }
  async function openSalon() {
    const { data: { session }, error } = await ensureClient().auth.getSession();
    const user = session?.user;
    if (error || !user) { showGate(); return; }
    const ok = await Promise.race([pullStateFromCloud(true), new Promise(resolve => setTimeout(() => resolve(false), 12000))]);
    if (!ok) {
      message('تعذّر تحميل بيانات الصالون من Supabase. تأكدي من الاتصال أو صلاحيات الحساب.');
      showGate();
      return;
    }
    state.auth = { ...(state.auth || {}), isAuthenticated: true };
    // The browser UI session is not part of the shared database.
    saveState(true);
    renderAll();
    renderAuthScreen();
    hideGate();
    subscribeRealtime();
  }
  document.addEventListener('DOMContentLoaded', async () => {
    gate = document.createElement('section');
    gate.id = 'salon-secure-auth';
    gate.setAttribute('dir', 'rtl');
    gate.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 p-4';
    gate.innerHTML = `<div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl text-slate-900">
      <h2 class="text-xl font-bold mb-2">🔐 الدخول الآمن إلى الصالون</h2>
      <p class="mb-4 text-sm text-slate-600">سجّلي الدخول بحساب Supabase الخاص بصاحبة الصالون. لا يمكن للزوار الوصول إلى البيانات.</p>
      <form id="salon-secure-login" class="space-y-3">
        <label class="block text-sm">البريد الإلكتروني<input id="salon-auth-email" type="email" autocomplete="username" required class="mt-1 w-full rounded-lg border p-3" dir="ltr"></label>
        <label class="block text-sm">كلمة المرور<input id="salon-auth-password" type="password" autocomplete="current-password" required class="mt-1 w-full rounded-lg border p-3" dir="ltr"></label>
        <button type="submit" class="w-full rounded-lg bg-rose-600 p-3 font-bold text-white">دخول</button>
      </form>
      <p id="salon-auth-message" role="alert" class="mt-3 text-sm text-rose-700"></p>
      <p class="mt-3 text-xs text-slate-500">الحساب يُنشأ من Supabase Dashboard → Authentication → Users، وليس من الصفحة العامة.</p>
    </div>`;
    document.body.appendChild(gate);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && realtimeChannel) refreshRemote(); });
    window.addEventListener('focus', () => { if (realtimeChannel) refreshRemote(); });
    // Mobile browsers may suspend websocket connections; periodic pull recovers missed events.
    setInterval(() => { if (realtimeChannel && !document.hidden) refreshRemote(); }, 12000);
    $('salon-secure-login').addEventListener('submit', async e => {
      e.preventDefault();
      message('جارٍ التحقق من الحساب...');
      try {
        const { error } = await ensureClient().auth.signInWithPassword({
          email: $('salon-auth-email').value.trim(),
          password: $('salon-auth-password').value
        });
        if (error) throw error;
        await openSalon();
      } catch (error) { message(error.message || 'تعذّر تسجيل الدخول'); }
    });
    // Legacy account creation must not bypass cloud authentication.
    const registerTab = $('tabAuthRegister');
    if (registerTab) registerTab.style.display = 'none';
    const registerForm = $('authRegisterForm');
    if (registerForm) registerForm.style.display = 'none';
    const logout = $('btnLogoutApp');
    logout?.addEventListener('click', async e => {
      e.stopImmediatePropagation();
      e.preventDefault();
      if (realtimeChannel) { await ensureClient().removeChannel(realtimeChannel); realtimeChannel = null; }
      try { await ensureClient().auth.signOut(); } catch (_) {}
      state.auth.isAuthenticated = false;
      saveState(true);
      renderAuthScreen();
      showGate();
      message('');
    }, true);
    try { await openSalon(); } catch (error) { showGate(); message(error.message); }
  });
})();
