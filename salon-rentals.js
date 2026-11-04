/* Rental/security-deposit ledger for Rana & Jana. Depends on the main salon's authenticated, tenant-scoped state. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = () => typeof window.getState === 'function' ? window.getState() : null;
  const escapeHtml = v => String(v == null ? '' : v).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const usd = n => '$' + (Number(n) || 0).toFixed(2);
  const isoDay = () => { const d = new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
  const id = prefix => prefix+'-'+Date.now()+'-'+Math.random().toString(36).slice(2,10);
  const validMoney = val => Number.isFinite(Number(val)) && Number(val) >= 0 && String(val).trim() !== '';
  const rentalServices = s => (s.services || []).filter(x => x.rental === true);
  let selectedService = '';

  function message(text) { window.alert(text); }

  function createUi() {
    if ($('view-rentals')) return;
    const serviceTab = document.querySelector('.nav-tab-btn[data-tab="services"]');
    const servicesView = $('view-services');
    if (!serviceTab || !servicesView) return;
    const tab = serviceTab.cloneNode(false);
    tab.setAttribute('data-tab','rentals');
    tab.textContent = '👑 التأجير والتأمين';
    tab.addEventListener('click', () => {
      if (typeof window.switchTab === 'function') window.switchTab('rentals');
    });
    serviceTab.insertAdjacentElement('afterend',tab);
    const section = document.createElement('section');
    section.id = 'view-rentals';
    section.className = 'tab-view hidden space-y-5';
    section.innerHTML = [
      '<div class="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-rose-100 dark:border-slate-700 p-4 sm:p-5">',
      '<h2 class="text-xl font-bold mb-2">👑 إدارة التأجير والتأمين</h2>',
      '<p class="text-sm text-slate-500 mb-4">أجرة القطعة تُسجّل فاتورة. التأمين أمانة قابلة للإرجاع وليس مبيعات، ويجوز تسجيل تأجير بلا تأمين (0$).</p>',
      '<p id="rentalsSummary" class="text-sm font-semibold mb-4"></p>',
      '<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">',
      '<label class="text-sm">الزبونة الموجودة<select id="rentalClientId" class="block w-full border rounded-xl p-2 dark:bg-slate-800"><option value="">زبونة جديدة / اختاري</option></select></label>',
      '<label class="text-sm">اسم الزبونة الجديدة<input id="rentalName" class="block w-full border rounded-xl p-2 dark:bg-slate-800" placeholder="الاسم عند عدم الاختيار"></label>',
      '<label class="text-sm">رقم الهاتف<input id="rentalPhone" class="block w-full border rounded-xl p-2 dark:bg-slate-800"></label>',
      '<label class="text-sm">القطعة<select id="rentalServiceId" class="block w-full border rounded-xl p-2 dark:bg-slate-800"></select></label>',
      '<label class="text-sm">الأجرة بالدولار<input id="rentalFee" type="number" min="0.01" step="0.01" class="block w-full border rounded-xl p-2 dark:bg-slate-800"></label>',
      '<label class="text-sm">التأمين بالدولار (0 = بلا تأمين)<input id="rentalDeposit" type="number" min="0" step="0.01" value="0" class="block w-full border rounded-xl p-2 dark:bg-slate-800"></label>',
      '<label class="text-sm">تاريخ الإرجاع المتوقع<input id="rentalDue" type="date" class="block w-full border rounded-xl p-2 dark:bg-slate-800"></label>',
      '<label class="text-sm md:col-span-2">ملاحظات<input id="rentalNotes" class="block w-full border rounded-xl p-2 dark:bg-slate-800"></label>',
      '</div><p id="rentalPriceHint" class="text-xs text-slate-500 mt-2"></p>',
      '<button id="rentalCreate" type="button" class="mt-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white px-5 py-2 font-bold">+ تسجيل التأجير</button>',
      '</div>',
      '<div class="bg-white dark:bg-slate-900 rounded-2xl border border-rose-100 dark:border-slate-700 p-4 sm:p-5">',
      '<h3 class="font-bold mb-3">سجلّ القطع المستأجرة والتأمينات</h3>',
      '<div id="rentalsRecords" class="space-y-3"></div>',
      '</div>'
    ].join('');
    servicesView.insertAdjacentElement('afterend',section);
    $('rentalServiceId').addEventListener('change', serviceChanged);
    $('rentalClientId').addEventListener('change', () => {
      const s=state(), c=s && (s.clients||[]).find(x=>String(x.id)===$('rentalClientId').value);
      if(c) { $('rentalName').value = c.name || ''; $('rentalPhone').value = c.phone || ''; }
      else { $('rentalName').value=''; $('rentalPhone').value=''; }
    });
    $('rentalCreate').addEventListener('click', createRental);
    $('rentalsRecords').addEventListener('click', event => {
      const btn = event.target.closest('button[data-return-rental]');
      if(btn) { settleRental(btn.getAttribute('data-return-rental')); return; }
      const deleteBtn = event.target.closest('button[data-delete-rental]');
      if(deleteBtn) deleteRental(deleteBtn.getAttribute('data-delete-rental'));
    });
    // Rental catalog entries must not bypass the refundable deposit ledger.
    document.addEventListener('click', event => {
      const btn=event.target.closest('[data-add-pos-srv]');
      if(!btn) return;
      const s=state(), service=s && (s.services||[]).find(x=>x.id===btn.getAttribute('data-add-pos-srv'));
      if(!service) return;
      if(service.needsReview && !(Number(service.price)>0)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        message('السعر بعده بحاجة لتأكيد. عدّليه من قسم الخدمات والأسعار قبل إضافته إلى الفاتورة.');
        return;
      }
      if(!service.rental) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      selectedService=service.id;
      if(typeof window.switchTab === 'function') window.switchTab('rentals');
      render();
    }, true);
    render();
  }

  function serviceChanged() {
    const s=state(), service=s && rentalServices(s).find(x=>x.id===$('rentalServiceId').value);
    if(!service) return;
    $('rentalFee').value = Number(service.price) || 0;
    $('rentalDeposit').value = Number(service.suggestedDeposit) || 0;
    $('rentalPriceHint').textContent = service.priceMax
      ? ('الأجرة المقترحة: '+usd(service.priceMin)+' إلى '+usd(service.priceMax)+' — اختاري السعر الفعلي')
      : 'يمكن تعديل الأجرة والتأمين لكل عملية';
  }

  function render() {
    const s=state();
    if (!s || !$('rentalsRecords')) return;
    const oldClient=$('rentalClientId').value, oldService=$('rentalServiceId').value;
    const clients=(s.clients||[]), services=rentalServices(s), rentals=(s.rentals||[]);
    $('rentalClientId').innerHTML = '<option value="">زبونة جديدة / اختاري</option>'+clients.map(c =>
      '<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.name)+'</option>').join('');
    if(clients.some(c=>String(c.id)===oldClient)) $('rentalClientId').value=oldClient;
    $('rentalServiceId').innerHTML = services.map(x =>
      '<option value="'+escapeHtml(x.id)+'">'+escapeHtml(x.nameAr)+'</option>').join('');
    const chosen=selectedService || oldService;
    if(services.some(x=>x.id===chosen)) $('rentalServiceId').value=chosen;
    else if(services.length && !oldService) serviceChanged();
    selectedService='';
    const open=rentals.filter(r=>r.status==='out');
    const held=open.reduce((sum,r)=>sum+Math.max(0,Number(r.deposit)||0),0);
    const late=open.filter(r=>r.dueDate && r.dueDate<isoDay()).length;
    $('rentalsSummary').textContent = 'تأجيرات مفتوحة: '+open.length+' | تأمينات مستردة عند الإرجاع: '+usd(held)+' | متأخرة: '+late;
    $('rentalsRecords').innerHTML = rentals.length ? [...rentals].reverse().map(r => {
      const out=r.status==='out', dep=Number(r.deposit)||0;
      const missingInvoice=!(s.invoices||[]).some(inv=>inv.id===r.invoiceId);
      return '<article class="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">'+
        '<div class="flex flex-wrap justify-between gap-2"><b>'+escapeHtml(r.clientName)+' — '+escapeHtml(r.itemName)+'</b>'+
        '<span class="text-sm">'+(out?'قيد التأجير':'تم الإرجاع')+'</span></div>'+
        '<p class="text-sm">الأجرة: '+usd(r.fee)+' | التأمين: '+usd(dep)+' | تاريخ التأجير: '+escapeHtml(r.date)+
        ' | الإرجاع المتوقع: '+escapeHtml(r.dueDate||'غير محدد')+'</p>'+
        (missingInvoice?'<p class="text-xs text-red-600">تنبيه: فاتورة الأجرة المرتبطة غير موجودة؛ راجعي السجل.</p>':'')+
        (out?'<div class="flex flex-wrap gap-2 items-end border-t dark:border-slate-700 pt-2">'+
          '<label class="text-xs">المبلغ المعاد من التأمين $<input id="rental-refund-'+escapeHtml(r.id)+
          '" type="number" min="0" max="'+dep+'" step="0.01" value="'+dep+
          '" class="block border rounded-lg px-2 py-1 w-32 dark:bg-slate-800"></label>'+
          '<label class="text-xs flex-1">سبب حجز أي جزء من التأمين<input id="rental-reason-'+escapeHtml(r.id)+
          '" class="block border rounded-lg px-2 py-1 w-full dark:bg-slate-800" placeholder="لازم إذا انحجز مبلغ"></label>'+
          '<button data-return-rental="'+escapeHtml(r.id)+
          '" type="button" class="bg-rose-600 text-white rounded-lg px-3 py-2 text-sm">إرجاع القطعة / تسوية التأمين</button></div>'
          :'<p class="text-xs text-slate-500">التأمين المعاد: '+usd(r.refunded)+' | المحتجز: '+usd(r.withheld)+
           (r.withheldReason?' | السبب: '+escapeHtml(r.withheldReason):'')+'</p>')+
        '<div class="flex justify-end border-t dark:border-slate-700 pt-2 mt-2">'+
        '<button type="button" data-delete-rental="'+escapeHtml(r.id)+
        '" class="border border-red-300 text-red-700 dark:text-red-400 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg px-3 py-2 text-sm font-semibold">🗑 حذف التأجير</button>'+
        '</div></article>';
    }).join('') : '<p class="text-slate-500 text-sm">لا توجد عمليات تأجير بعد.</p>';
  }

  function pushInvoice(s,clientId,title,amount,note,time) {
    const invoiceId=id('RNTFEE');
    s.invoices.push({
      id:invoiceId,date:isoDay(),clientId:clientId,
      items:[{id:id('RENTITEM'), nameAr:title, nameEn:title, price:amount, qty:1}],
      subtotal:amount, discount:0, total:amount, depositApplied:0, paid:amount,
      Method:'cash', notes:note, updatedAt:time
    });
    return invoiceId;
  }

  async function createRental() {
    const s=state();
    if(!s || !window.getActiveSalonTenantId?.()) return message('سجّلي الدخول بحساب الصالون أولاً.');
    const service=rentalServices(s).find(x=>x.id===$('rentalServiceId').value);
    const clientId=$('rentalClientId').value, name=$('rentalName').value.trim(), phone=$('rentalPhone').value.trim();
    const fee=Number($('rentalFee').value), deposit=Number($('rentalDeposit').value);
    if(!service || (!clientId && !name) || !validMoney($('rentalFee').value) || fee<=0 ||
       !validMoney($('rentalDeposit').value) || deposit<0)
      return message('حدّدي الزبونة والقطعة وأجرة أكبر من صفر، وتأمين صفر أو أكثر.');
    const now=Date.now();
    s.clients=Array.isArray(s.clients)?s.clients:[];
    s.invoices=Array.isArray(s.invoices)?s.invoices:[];
    s.rentals=Array.isArray(s.rentals)?s.rentals:[];
    let client=s.clients.find(c=>String(c.id)===clientId);
    if(!client) {
      client={id:id('cli-rent'),name,phone,initialDebt:0,notes:'',updatedAt:now};
      s.clients.push(client);
    }
    const invoiceId=pushInvoice(s,client.id,service.nameAr,fee,
      'أجرة قطعة مؤجرة — التأمين منفصل عن المبيعات',now);
    s.rentals.push({
      id:id('RENT'),clientId:client.id,clientName:client.name,phone:client.phone||phone,
      serviceId:service.id,itemName:service.nameAr,fee,deposit,invoiceId,
      date:isoDay(),dueDate:$('rentalDue').value,notes:$('rentalNotes').value.trim(),
      status:'out',refunded:0,withheld:0,updatedAt:now
    });
    await window.persistAndSync({button:$('rentalCreate'),
      successMessage:'تم تسجيل الأجرة والتأمين كلٌّ بحسابه ✅'});
    $('rentalClientId').value='';
    $('rentalName').value='';
    $('rentalPhone').value='';
    $('rentalNotes').value='';
    $('rentalDue').value='';
    render();
  }

  async function settleRental(rentalId) {
    const s=state(), r=s && (s.rentals||[]).find(x=>x.id===rentalId);
    if(!r || r.status!=='out') return;
    const refundInput=$('rental-refund-'+rentalId),reasonInput=$('rental-reason-'+rentalId);
    if(!refundInput || !validMoney(refundInput.value)) return message('اكتبي مبلغ التأمين المرجع.');
    const refund=Number(refundInput.value), deposit=Number(r.deposit)||0;
    if(refund<0 || refund>deposit) return message('المبلغ المعاد لا يمكن أن يتجاوز التأمين.');
    const withheld=Math.round((deposit-refund)*100)/100;
    const reason=String(reasonInput?.value||'').trim();
    if(withheld>0 && !reason) return message('اكتبي سبب حجز المبلغ المتبقي من التأمين.');
    if(!window.confirm('تأكيد إرجاع القطعة وتسوية التأمين؟')) return;
    r.status='returned';r.returnedDate=isoDay();r.refunded=refund;
    r.withheld=withheld;r.withheldReason=reason;r.updatedAt=Date.now();
    if(withheld>0) {
      s.invoices=Array.isArray(s.invoices)?s.invoices:[];
      r.withheldInvoiceId=pushInvoice(s,r.clientId,'مبلغ محتجز من تأمين '+r.itemName,
        withheld,'سبب حجز التأمين: '+reason,r.updatedAt);
    }
    await window.persistAndSync({successMessage:'تم إرجاع القطعة وتسوية التأمين ✅'});
    render();
  }

  async function deleteRental(rentalId) {
    const s = state();
    const r = s && (s.rentals || []).find(x => x.id === rentalId);
    if (!r) return;
    const linkedIds = [r.invoiceId, r.withheldInvoiceId].filter(Boolean);
    const linkedInvoices = (s.invoices || []).filter(inv => linkedIds.includes(inv.id));
    const pendingDeposit = r.status === 'out' ? Number(r.deposit) || 0 : 0;
    const warning = pendingDeposit > 0
      ? '\n⚠️ في تأمين '+usd(pendingDeposit)+' بعده غير مسوّى. الحذف ما بيرجّع المال تلقائياً.'
      : '';
    const question = 'حذف تأجير '+r.itemName+' للزبونة '+r.clientName+'؟'+
      '\nرح ينحذف سجلّ التأجير وفواتير الأجرة والمبالغ المحتجزة المرتبطة فيه فقط،'+
      ' وتتحدّث المبيعات والأرباح. ما رح تنحذف الزبونة أو فواتيرها الأخرى.'+
      warning+'\nهالعملية ما فيك ترجعيها من الشاشة. متأكدة؟';
    if (!window.confirm(question)) return;
    // This is a correction/void, not a refund transaction. Require a conscious
    // confirmation because deposits are handled outside the sales ledger.
    const deletedAt = Date.now();
    s.rentals = (s.rentals || []).filter(x => x.id !== rentalId);
    s.invoices = (s.invoices || []).filter(inv => !linkedIds.includes(inv.id));
    s._deleted = (s._deleted && typeof s._deleted === 'object') ? s._deleted : {};
    s._deleted[rentalId] = deletedAt;
    for (const inv of linkedInvoices) s._deleted[inv.id] = deletedAt;
    await window.persistAndSync({
      successMessage: 'تم حذف عملية التأجير وفواتيرها المرتبطة وتحديث الحسابات ✅'
    });
    render();
  }

  document.addEventListener('DOMContentLoaded', createUi);
  window.renderSalonRentals = render;
})();
