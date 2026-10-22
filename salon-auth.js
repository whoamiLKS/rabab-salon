// Protected Supabase sign-in for Rabab Salon. No public sign-up: owner accounts are created in Supabase Auth.
(function () {
  let gate;
  let client;
  let realtimeChannel;
  let refreshing = false;
  let lastCloudUpdate = '';
  let pollTimer = null;
  let lastTouchCheck = 0;

  const $ = id => document.getElementById(id);

  function getCreds() {
    if (typeof window.getSupabaseCredentials === 'function') {
      try { return window.getSupabaseCredentials(); } catch (_) {}
    }
    const customUrl = localStorage.getItem('lumiere_salon_supabase_url');
    const customKey = localStorage.getItem('lumiere_salon_supabase_anon_key');
    const url = String(customUrl || 'https://wicakbsswxzhwlbxhxxs.supabase.co').trim().replace(/\/+$/, '');
    const key = String(customKey || 'sb_publishable_5YMTi1-F-PYkOn5Z1lWfIw_hpYz0jRe').trim();
    return { url, key, isConfigured: Boolean(url && key) };
  }

  function ensureClient() {
    const c = getCreds();
    if (!c.isConfigured || !window.supabase) throw new Error('Supabase is not configured.');
    if (typeof window.getSupabaseClientInstance === 'function') {
      client = window.getSupabaseClientInstance(c.url, c.key);
    } else if (!client) {
      client = window.supabase.createClient(c.url, c.key, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
    }
    return client;
  }

  async function checkAndPullRemote(force = false) {
    if (refreshing || (document.hidden && !force)) return;
    refreshing = true;
    try {
      const sb = ensureClient();
      const { data: rows, error } = await sb
        .from('salon_data')
        .select('updated_at')
        .eq('id', 'main_salon')
        .limit(1);

      if (!error && Array.isArray(rows) && rows.length > 0) {
        const stamp = rows[0]?.updated_at || '';
        if (stamp && (stamp !== lastCloudUpdate || force)) {
          lastCloudUpdate = stamp;
          if (typeof window.pullStateFromCloud === 'function') {
            await window.pullStateFromCloud(true);
          }
        }
      }
    } catch (e) {
      console.warn('Sync poll check warning:', e);
    } finally {
      refreshing = false;
    }
  }

  function subscribeRealtime() {
    try {
      const sb = ensureClient();
      if (realtimeChannel) {
        try { sb.removeChannel(realtimeChannel); } catch (_) {}
        realtimeChannel = null;
      }
      realtimeChannel = sb.channel('salon-live-updates')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'salon_data', filter: 'id=eq.main_salon' }, payload => {
          const stamp = payload.new?.updated_at || '';
          if (stamp && stamp === lastCloudUpdate) return;
          lastCloudUpdate = stamp;
          checkAndPullRemote(true);
        })
        .subscribe(status => {
          if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            console.warn('Realtime channel status:', status, '- will reconnect on poll');
          }
        });
    } catch (e) {
      console.warn('Realtime subscribe error:', e);
    }

    // Fast polling every 2.5 seconds so both devices sync instantly even without WebSockets
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => {
      if (!document.hidden) {
        checkAndPullRemote();
      }
    }, 2500);
  }

  // Expose checkAndPullRemote globally so tab switches and actions trigger it immediately
  window.checkAndPullRemote = checkAndPullRemote;

  const message = text => { const el = $('salon-auth-message'); if (el) el.textContent = text; };
  function showGate() { gate?.classList.remove('hidden'); }
  function hideGate() { gate?.classList.add('hidden'); }

  async function openSalon() {
    let sb;
    try {
      sb = ensureClient();
    } catch (err) {
      showGate();
      message('يرجى التحقق من إعدادات Supabase: ' + err.message);
      return;
    }

    const { data: { session }, error } = await sb.auth.getSession();
    const user = session?.user;
    if (error || !user) {
      showGate();
      return;
    }

    // Authenticated! Pull latest cloud state
    let ok = false;
    if (typeof window.pullStateFromCloud === 'function') {
      try {
        ok = await window.pullStateFromCloud(true);
      } catch (e) {
        console.warn('Initial pullStateFromCloud error:', e);
      }
    }

    // Direct fallback if pullStateFromCloud didn't succeed
    if (!ok) {
      try {
        const { data: rows, error: readError } = await sb
          .from('salon_data')
          .select('state_json, updated_at')
          .eq('id', 'main_salon')
          .limit(1);

        if (readError) {
          message('خطأ في تحميل البيانات من Supabase: ' + readError.message);
          showGate();
          return;
        }

        if (rows && rows.length > 0 && rows[0]?.state_json) {
          lastCloudUpdate = rows[0]?.updated_at || '';
          const parseFn = window.sanitizeState || (raw => (typeof raw === 'string' ? JSON.parse(raw) : raw));
          const remoteData = parseFn(rows[0].state_json);
          if (remoteData) {
            const currentState = (typeof window.getState === 'function' ? window.getState() : window.state) || {};
            const mergeFn = window.mergeStates || ((loc, rem) => ({ ...rem, ...loc }));
            const merged = mergeFn(currentState, remoteData);
            if (typeof window.setState === 'function') window.setState(merged);
            else window.state = merged;
            if (typeof window.saveState === 'function') window.saveState(true);
            ok = true;
          }
        } else if (rows && rows.length === 0) {
          if (typeof window.pushStateToCloud === 'function') {
            await window.pushStateToCloud(true);
          }
          ok = true;
        }
      } catch (err) {
        console.warn('Direct fallback load error:', err);
      }
    }

    if (!ok) {
      message('تعذّر تحميل بيانات الصالون من Supabase. تأكدي من الاتصال بالإنترنت.');
      showGate();
      return;
    }

    const curr = (typeof window.getState === 'function' ? window.getState() : window.state) || {};
    curr.auth = { ...(curr.auth || {}), isAuthenticated: true };
    if (typeof window.saveState === 'function') window.saveState(true);
    if (typeof window.renderAll === 'function') window.renderAll();
    if (typeof window.renderAuthScreen === 'function') window.renderAuthScreen();
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
        <button type="submit" id="btnSalonLoginSubmit" class="w-full rounded-lg bg-rose-600 p-3 font-bold text-white transition hover:bg-rose-700">دخول</button>
      </form>
      <p id="salon-auth-message" role="alert" class="mt-3 text-sm text-rose-700"></p>
      <p class="mt-3 text-xs text-slate-500">الحساب يُنشأ من Supabase Dashboard → Authentication → Users، وليس من الصفحة العامة.</p>
    </div>`;
    document.body.appendChild(gate);

    // Multi-device lifecycle: immediate sync on foreground, focus, unlock, and touch
    const onForeground = () => {
      if (!document.hidden) {
        if (!realtimeChannel) subscribeRealtime();
        checkAndPullRemote(true);
      }
    };
    document.addEventListener('visibilitychange', onForeground);
    window.addEventListener('focus', onForeground);
    window.addEventListener('pageshow', onForeground);
    window.addEventListener('online', () => {
      if (typeof window.pushStateToCloud === 'function') window.pushStateToCloud(true);
      checkAndPullRemote(true);
    });

    // On user tap/click on phone, check if more than 3 seconds since last check
    document.addEventListener('pointerdown', () => {
      const now = Date.now();
      if (now - lastTouchCheck > 3000) {
        lastTouchCheck = now;
        checkAndPullRemote();
      }
    }, { passive: true });

    $('salon-secure-login').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('btnSalonLoginSubmit');
      const origText = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = 'جارٍ التحقق... ⏳'; }
      message('جارٍ التحقق من الحساب...');
      try {
        const { error } = await ensureClient().auth.signInWithPassword({
          email: $('salon-auth-email').value.trim(),
          password: $('salon-auth-password').value
        });
        if (error) throw error;
        await openSalon();
      } catch (error) {
        message(error.message || 'تعذّر تسجيل الدخول');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = origText; }
      }
    });

    const registerTab = $('tabAuthRegister');
    if (registerTab) registerTab.style.display = 'none';
    const registerForm = $('authRegisterForm');
    if (registerForm) registerForm.style.display = 'none';
    const logout = $('btnLogoutApp');
    logout?.addEventListener('click', async e => {
      e.stopImmediatePropagation();
      e.preventDefault();
      if (realtimeChannel) {
        try { await ensureClient().removeChannel(realtimeChannel); } catch (_) {}
        realtimeChannel = null;
      }
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      try { await ensureClient().auth.signOut(); } catch (_) {}
      const curr = (typeof window.getState === 'function' ? window.getState() : window.state) || {};
      if (curr.auth) curr.auth.isAuthenticated = false;
      if (typeof window.saveState === 'function') window.saveState(true);
      if (typeof window.renderAuthScreen === 'function') window.renderAuthScreen();
      showGate();
      message('');
    }, true);

    try { await openSalon(); } catch (error) { showGate(); message(error.message); }
  });
})();
