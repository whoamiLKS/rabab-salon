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
      if (typeof window.pullStateFromCloud === 'function') await window.pullStateFromCloud(true);
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
      const tenantId = window.getActiveSalonTenantId?.();
      if (!tenantId) return;
      realtimeChannel = sb.channel('salon-live-updates-' + tenantId)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'lks_tenant_states', filter: 'tenant_id=eq.' + tenantId }, payload => {
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
  function showGate() {
    $('authScreenOverlay')?.classList.remove('hidden');
    message('');
  }
  function hideGate() {
    $('authScreenOverlay')?.classList.add('hidden');
    message('');
  }

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

    await window.initializeAccountSync(user.id);
    const ok = await window.pullStateFromCloud(true, true);
    if (!ok) {
      message('تعذّرت مزامنة الحساب. تحقّق من الاتصال وأعد تسجيل الدخول.');
      showGate();
      return;
    }

    const curr = (typeof window.getState === 'function' ? window.getState() : window.state) || {};
    curr.auth = { ...(curr.auth || {}), isAuthenticated: true };
    if (typeof window.saveState === 'function') window.saveState(true);
    if (typeof window.renderAll === 'function') window.renderAll();
    if (typeof window.renderAuthScreen === 'function') window.renderAuthScreen();
    hideGate();
    mountSalonAdmin(user);
    subscribeRealtime();
  }

  function mountSalonAdmin(user) {
    // Visibility is cosmetic: the server-side RPC checks the authenticated admin ID.
    if (user?.id !== '75073526-cb53-4e43-bc79-31b7cd75f9c6') return;
    if (document.getElementById('lks-salon-admin-entry')) return;
    const entry=document.createElement('button');
    entry.id='lks-salon-admin-entry';
    entry.textContent='⚙ إدارة حسابات الصالونات';
    entry.style.cssText='position:fixed;bottom:18px;right:18px;z-index:9998;background:#831843;color:white;border:0;border-radius:12px;padding:12px 16px;font-weight:bold;box-shadow:0 4px 24px #0004;cursor:pointer';
    const panel=document.createElement('section');
    panel.id='lks-salon-admin-panel';
    panel.setAttribute('dir','rtl');
    panel.style.cssText='display:none;position:fixed;inset:0;background:#0009;z-index:9999;align-items:center;justify-content:center;padding:20px';
    panel.innerHTML=`<form id="lks-create-salon-form" style="width:min(100%,450px);background:white;color:#222;border-radius:18px;padding:24px;box-shadow:0 8px 45px #0004;display:grid;gap:12px">
      <div style="display:flex;align-items:center;justify-content:space-between"><h2 style="font-size:21px;font-weight:800;margin:0">إضافة صالون مستقل</h2><button type="button" id="lks-close-salon-admin" style="font-size:24px" aria-label="إغلاق">×</button></div>
      <p style="font-size:13px">أولاً أنشئ المستخدم وكلمة مروره من Supabase → Authentication → Users. بعدين اربطه هون ببيانات صالون مستقلة.</p>
      <label>اسم الصالون<input required minlength="2" id="lks-new-salon-name" style="width:100%;border:1px solid #aaa;border-radius:8px;padding:10px" placeholder="مثال: Liora Salon"></label>
      <label>إيميل حساب Supabase<input required type="email" id="lks-new-salon-email" style="width:100%;border:1px solid #aaa;border-radius:8px;padding:10px" placeholder="owner@example.com" dir="ltr"></label>
      <div id="lks-salon-admin-result" role="status" style="font-size:13px;white-space:pre-wrap"></div>
      <button id="lks-create-salon-submit" type="submit" style="background:#831843;color:white;border:0;border-radius:9px;padding:12px;font-weight:bold">إنشاء صالون منفصل</button>
    </form>`;
    document.body.append(entry,panel);
    entry.onclick=()=>{panel.style.display='flex';};
    panel.querySelector('#lks-close-salon-admin').onclick=()=>{panel.style.display='none';};
    panel.addEventListener('click',e=>{if(e.target===panel)panel.style.display='none';});
    panel.querySelector('form').addEventListener('submit',async e=>{
      e.preventDefault();
      const btn=panel.querySelector('#lks-create-salon-submit'),out=panel.querySelector('#lks-salon-admin-result');
      btn.disabled=true;out.textContent='جارٍ إنشاء مساحة مستقلة...';
      try {
        const {data,error}=await ensureClient().rpc('lks_admin_create_salon',{
          p_email:panel.querySelector('#lks-new-salon-email').value.trim(),
          p_name:panel.querySelector('#lks-new-salon-name').value.trim()
        });
        if(error)throw error;
        out.style.color='#166534';out.textContent='✅ تم إنشاء صالون مستقل، ومعرّفه: '+data+'\nصار فيك تسجّل دخول بالحساب الجديد.';
        e.target.reset();
      }catch(err){out.style.color='#b91c1c';out.textContent='تعذّر إنشاء الصالون: '+(err.message||err);}
      finally{btn.disabled=false;}
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    // Single unified login form inside authScreenOverlay: no duplicate overlay injected.

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

    // Register form removed: single secure Supabase Auth used.
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
      window.clearSalonTenantSession?.();
      document.getElementById('lks-salon-admin-entry')?.remove();
      document.getElementById('lks-salon-admin-panel')?.remove();
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

