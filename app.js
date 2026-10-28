const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

let userRole = 'user'; 
let userInfo = null;
let nav1Initialized = false;
let initDataGlobal = "";

// إخفاء كل الصفحات وإظهار الشاحنة فقط
document.getElementById('page-nav').classList.remove('active');
document.getElementById('page-admin').classList.remove('active');
document.getElementById('page-empty').classList.remove('active');
if(document.getElementById('page-home')) document.getElementById('page-home').classList.remove('active');
document.getElementById('page-truck').classList.add('active');

async function apiCall(endpoint, body = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, initData: initDataGlobal })
  });
  return await response.json();
}

async function fetchUserRole() {
  if (!tg || !tg.initData) return;
  initDataGlobal = tg.initData;
  try {
    const data = await apiCall('/api/me');
    if (data.ok) {
      userRole = data.user.role;
      userInfo = data.user;
      if (nav1Initialized) initNav1(); 
      
      // بعد جلب الصلاحيات، نقوم بتحميل بيانات المتجر (الهيدر)
      loadStoreData();
    }
  } catch (err) { console.error(err); }
}
fetchUserRole();

// أنيميشن الشاحنة
document.querySelectorAll('.truck-button').forEach(button => {
  button.addEventListener('click', e => {
    e.preventDefault();
    let box = button.querySelector('.box'), truck = button.querySelector('.truck');
    if (!button.classList.contains('done') && !button.classList.contains('animation')) {
      button.classList.add('animation');
      gsap.to(button, { '--box-s': 1, '--box-o': 1, duration: .3, delay: .5 });
      gsap.to(box, { x: 0, duration: .4, delay: .7 });
      gsap.to(button, { '--hx': -5, '--bx': 50, duration: .18, delay: .92 });
      gsap.to(box, { y: 0, duration: .1, delay: 1.15 });
      gsap.set(button, { '--truck-y': 0, '--truck-y-n': -26 });
      gsap.to(button, {
        '--truck-y': 1, '--truck-y-n': -25, duration: .2, delay: 1.25,
        onComplete() {
          gsap.timeline({ onComplete() {
            button.classList.add('done');
            setTimeout(() => {
              document.getElementById('page-truck').classList.remove('active');
              // الانتقال للصفحة الرئيسية الجديدة
              document.getElementById('page-home').classList.add('active');
              // إظهار الشريط السفلي فوقها
              document.getElementById('page-nav').classList.add('active');
              if (!nav1Initialized) initNav1();
            }, 800);
          }})
          .to(truck, { x: 0, duration: .4 }).to(truck, { x: 40, duration: 1 })
          .to(truck, { x: 20, duration: .6 }).to(truck, { x: 96, duration: .4 });
          gsap.to(button, { '--progress': 1, duration: 2.4, ease: "power2.in" });
        }
      });
    }
  });
});

const icons = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  cart:'<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  headset:'<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  admin:'<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm1-13h-2v6h2zm0 8h-2v2h2z"/>'
};

const svg=(name,size=24,stroke=2)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;

function initNav1() {
  const nav1 = document.getElementById('nav1');
  nav1.innerHTML = '';
  let tabs = [{key:'home'},{key:'heart'},{key:'cart'},{key:'headset'},{key:'bell'}];
  if (userRole !== 'user') tabs.push({key:'admin'});
  
  const indicator = document.createElement('span'); indicator.className = 'active-indicator';
  const spotlight = document.createElement('span'); spotlight.className = 'spotlight';
  
  tabs.forEach((tab, i) => {
    const b = document.createElement('button');
    b.className = 'nav-item';
    b.innerHTML = `<span class="icon">${svg(tab.key, 26)}</span>`;
    b.addEventListener('click', () => setNav1(i, tabs));
    nav1.append(b);
  });
  
  nav1.append(indicator, spotlight);
  
  function setNav1(i, currentTabs) {
    nav1.querySelectorAll('.nav-item').forEach((b, j) => {
      b.classList.toggle('active', i === j);
      b.querySelector('.icon').classList.toggle('active-icon', i === j);
    });
    const item = nav1.querySelectorAll('.nav-item')[i];
    const left = item.offsetLeft + item.offsetWidth / 2;
    indicator.style.left = left + 'px';
    spotlight.style.left = left + 'px';
    
    if (currentTabs[i].key === 'admin') {
      openAdminPanel();
    } else {
      // عند الضغط على أي زر آخر، نعود للرئيسية
      document.getElementById('page-admin').classList.remove('active');
      document.getElementById('page-empty').classList.remove('active');
      document.getElementById('page-home').classList.add('active');
    }
  }
  setTimeout(() => setNav1(0, tabs), 50);
  nav1Initialized = true;
}

// ====== إعدادات المتجر (الهيدر) ======
async function loadStoreData() {
  const data = await apiCall('/api/store');
  if (data.ok && data.store) {
    document.getElementById('store-name').textContent = data.store.name;
    document.getElementById('store-users').textContent = data.store.usersCount.toLocaleString();
    document.getElementById('store-online').textContent = data.store.onlineCount.toLocaleString();
    
    const coverEl = document.getElementById('store-cover');
    const logoEl = document.getElementById('store-logo');
    const editLogoBtn = document.getElementById('edit-logo-btn');

    if (data.store.cover) coverEl.style.backgroundImage = `url('${data.store.cover}')`;
    
    if (data.store.logo) {
      logoEl.style.backgroundImage = `url('${data.store.logo}')`;
      editLogoBtn.style.display = 'none';
    }

    // إظهار أزرار القلم للمالك فقط
    if (userRole === 'owner') {
      document.getElementById('edit-cover-btn').style.display = 'flex';
      if (!data.store.logo) editLogoBtn.style.display = 'flex';
    }
  }
}

async function editCover() {
  const url = prompt('أدخل رابط صورة الغلاف (URL):');
  if (url !== null) {
    await apiCall('/api/store/update', { cover: url });
    loadStoreData();
  }
}

async function editLogo() {
  const url = prompt('أدخل رابط صورة اللوجو (URL):');
  if (url !== null) {
    await apiCall('/api/store/update', { logo: url });
    loadStoreData();
  }
}

// ====== فتح لوحة التحكم ======
async function openAdminPanel() {
  document.getElementById('page-home').classList.remove('active');
  document.getElementById('page-nav').classList.remove('active');
  document.getElementById('page-admin').classList.add('active');
  
  const content = document.getElementById('admin-content');
  content.innerHTML = `
    <div class="custom-loader-wrapper">
      <div class="loader">
        <p class="loader-text">جاري التحميل...</p>
        <span class="load"></span>
      </div>
    </div>
  `;
  
  const data = await apiCall('/api/products');
  let staffData = { ok: false, staff: [] };
  if (userRole === 'owner' || userRole === 'admin') {
    staffData = await apiCall('/api/users/list');
  }

  let productsHTML = '';
  if (data.ok && data.products.length > 0) {
    productsHTML = data.products.map(p => {
      let pricesStr = [];
      if (p.prices?.usd > 0) pricesStr.push(`$${p.prices.usd}`);
      if (p.prices?.ton > 0) pricesStr.push(`💎 ${p.prices.ton} TON`);
      if (p.prices?.stars > 0) pricesStr.push(`⭐ ${p.prices.stars}`);
      if (p.prices?.sar > 0) pricesStr.push(`🇸🇦 ${p.prices.sar} ريال`);

      const imgTag = p.image ? `<img src="${p.image}" style="width: 50px; height: 50px; border-radius: 5px; object-fit: cover; margin-left: 10px;">` : '';

      return `
      <div style="background: #152a47; padding: 12px; margin-bottom: 12px; border-radius: 10px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div style="display: flex; align-items: center; flex: 1;">
          ${imgTag}
          <div>
            <strong style="font-size: 16px; color: white;">${p.name}</strong>
            <p style="font-size: 12px; color: #a0c4ff; margin: 4px 0;">${p.description}</p>
            <div style="font-size: 13px; color: #fff; margin-bottom: 4px;">${pricesStr.join(' | ') || 'لا يوجد سعر'}</div>
            <small style="color: #888;">بواسطة: ${p.creatorName}</small>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 5px; margin-left: 10px;">
          <button onclick="editProductForm('${p.id}')" style="background: #f39c12; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px;">تعديل</button>
          <button onclick="deleteProduct('${p.id}')" style="background: #e74c3c; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px;">حذف</button>
        </div>
      </div>
      `;
    }).join('');
  } else {
    productsHTML = '<p>لا توجد منتجات حالياً.</p>';
  }

  let staffHTML = '';
  if (userRole === 'owner' || userRole === 'admin') {
    if (staffData.ok && staffData.staff.length > 0) {
      staffHTML = staffData.staff.map(s => {
        const roleName = s.role === 'admin' ? 'مسؤول' : 'مشرف';
        const roleColor = s.role === 'admin' ? '#e74c3c' : '#f39c12';
        const canEdit = userRole === 'owner' || (userRole === 'admin' && s.role === 'moderator');

        return `
        <div style="background: #152a47; padding: 10px; margin-bottom: 10px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong style="color: white;">${s.name}</strong> <span style="color: ${roleColor}; font-size: 12px; margin-right: 5px;">(${roleName})</span><br>
            <small style="color: #888;">ID: ${s.id}</small>
          </div>
          ${canEdit ? `
          <div style="display: flex; gap: 5px;">
            ${s.role === 'moderator' && userRole === 'owner' ? `<button onclick="updateRole('${s.id}', 'admin')" style="background: #3498db; color: white; border: none; padding: 5px 8px; border-radius: 5px; cursor: pointer; font-size: 11px;">ترقية لمسؤول</button>` : ''}
            ${s.role === 'admin' && userRole === 'owner' ? `<button onclick="updateRole('${s.id}', 'moderator')" style="background: #f39c12; color: white; border: none; padding: 5px 8px; border-radius: 5px; cursor: pointer; font-size: 11px;">تنزيل لمشرف</button>` : ''}
            <button onclick="updateRole('${s.id}', 'user')" style="background: #e74c3c; color: white; border: none; padding: 5px 8px; border-radius: 5px; cursor: pointer; font-size: 11px;">إزالة</button>
          </div>
          ` : '<small style="color: #666;">لا يمكنك التعديل</small>'}
        </div>
        `;
      }).join('');
    } else {
      staffHTML = '<p>لا يوجد مشرفين حالياً.</p>';
    }
  }

  content.innerHTML = `
    <div style="background: #112238; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
      <h3 style="margin-top: 0; color: white;">إضافة منتج جديد</h3>
      <input type="text" id="new-prod-name" placeholder="اسم المنتج" style="width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 5px; border: none; box-sizing: border-box;">
      <textarea id="new-prod-desc" placeholder="وصف المنتج..." style="width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 5px; border: none; box-sizing: border-box; resize: none;"></textarea>
      <input type="text" id="new-prod-img" placeholder="رابط الصورة (اختياري)" style="width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 5px; border: none; box-sizing: border-box;">
      
      <p style="color: #a0c4ff; font-size: 12px; margin: 5px 0;">الأسعار (اترك الحقل فارغاً إذا لم ترده):</p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
        <input type="number" id="price-usd" placeholder="دولار $" style="padding: 8px; border-radius: 5px; border: none;">
        <input type="number" id="price-ton" placeholder="تون TON" style="padding: 8px; border-radius: 5px; border: none;">
        <input type="number" id="price-stars" placeholder="نجوم ⭐" style="padding: 8px; border-radius: 5px; border: none;">
        <input type="number" id="price-sar" placeholder="ريال 🇸🇦" style="padding: 8px; border-radius: 5px; border: none;">
      </div>

      <button onclick="addProduct()" style="background: #6A0DAD; color: white; padding: 12px; width: 100%; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">إضافة المنتج</button>
    </div>

    <h3 style="color: white;">المنتجات المضافة</h3>
    <div>${productsHTML}</div>
    
    ${userRole === 'owner' || userRole === 'admin' ? `
      <hr style="border-color: #333; margin: 20px 0;">
      
      <div style="background: #112238; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
        <h3 style="margin-top: 0; color: white;">ترقية مستخدم جديد</h3>
        <input type="text" id="target-id" placeholder="Telegram ID للشخص" style="width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 5px; border: none; box-sizing: border-box;">
        <select id="target-role" style="width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 5px; border: none; box-sizing: border-box;">
          <option value="moderator">مشرف عادي</option>
          ${userRole === 'owner' ? '<option value="admin">مسؤول</option>' : ''}
        </select>
        <button onclick="promoteUser()" style="background: #3498db; color: white; padding: 12px; width: 100%; border: none; border-radius: 5px; cursor: pointer;">ترقية</button>
      </div>

      <h3 style="color: white;">إدارة المشرفين والمسؤولين</h3>
      <div>${staffHTML}</div>
    ` : ''}
  `;
}

async function addProduct() {
  const name = document.getElementById('new-prod-name').value;
  const description = document.getElementById('new-prod-desc').value;
  const image = document.getElementById('new-prod-img').value;
  
  const prices = {
    usd: parseFloat(document.getElementById('price-usd').value) || 0,
    ton: parseFloat(document.getElementById('price-ton').value) || 0,
    stars: parseFloat(document.getElementById('price-stars').value) || 0,
    sar: parseFloat(document.getElementById('price-sar').value) || 0,
  };

  if(!name) return alert('أدخل اسم المنتج على الأقل');
  
  const res = await apiCall('/api/products/add', { name, description, image, prices });
  if(res.ok) {
    tg.showAlert('تمت الإضافة بنجاح ✅');
    openAdminPanel();
  } else {
    tg.showAlert(res.error);
  }
}

async function deleteProduct(id) {
  if(!confirm('هل أنت متأكد من الحذف؟')) return;
  const res = await apiCall('/api/products/delete', { productId: id });
  if(res.ok) openAdminPanel();
  else alert(res.error);
}

async function editProductForm(id) {
  const data = await apiCall('/api/products');
  const product = data.products.find(p => p.id === id);
  if(!product) return;

  document.getElementById('new-prod-name').value = product.name;
  document.getElementById('new-prod-desc').value = product.description;
  document.getElementById('new-prod-img').value = product.image;
  
  document.getElementById('price-usd').value = product.prices?.usd || '';
  document.getElementById('price-ton').value = product.prices?.ton || '';
  document.getElementById('price-stars').value = product.prices?.stars || '';
  document.getElementById('price-sar').value = product.prices?.sar || '';

  const addBtn = document.querySelector('button[onclick="addProduct()"]');
  addBtn.textContent = 'حفظ التعديلات';
  addBtn.style.background = '#f39c12';
  addBtn.setAttribute('onclick', `saveEdit('${id}')`);
  
  document.getElementById('page-admin').scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveEdit(id) {
  const name = document.getElementById('new-prod-name').value;
  const description = document.getElementById('new-prod-desc').value;
  const image = document.getElementById('new-prod-img').value;
  
  const prices = {
    usd: parseFloat(document.getElementById('price-usd').value) || 0,
    ton: parseFloat(document.getElementById('price-ton').value) || 0,
    stars: parseFloat(document.getElementById('price-stars').value) || 0,
    sar: parseFloat(document.getElementById('price-sar').value) || 0,
  };

  const res = await apiCall('/api/products/edit', { productId: id, name, description, image, prices });
  if(res.ok) {
    tg.showAlert('تم التعديل بنجاح ✅');
    openAdminPanel();
  } else {
    tg.showAlert(res.error);
  }
}

async function promoteUser() {
  const targetId = document.getElementById('target-id').value;
  const newRole = document.getElementById('target-role').value;
  if(!targetId) return alert('أدخل الآي دي');
  const res = await apiCall('/api/users/promote', { targetId, newRole });
  if(res.ok) {
    tg.showAlert('تمت الترقية بنجاح ✅');
    openAdminPanel();
  } else {
    tg.showAlert(res.error);
  }
}

async function updateRole(targetId, newRole) {
  const actionText = newRole === 'user' ? 'إزالة' : 'تعديل الرتبة';
  if(!confirm(`هل أنت متأكد من ${actionText} لهذا الشخص؟`)) return;
  
  const res = await apiCall('/api/users/update-role', { targetId, newRole });
  if(res.ok) {
    tg.showAlert('تم التحديث بنجاح ✅');
    openAdminPanel();
  } else {
    tg.showAlert(res.error);
  }
}

// إغلاق اللوحة
document.getElementById('close-admin').addEventListener('click', () => {
  document.getElementById('page-admin').classList.remove('active');
  document.getElementById('page-empty').classList.add('active');
});

// دالة العودة من الشاشة الفارغة إلى الصفحة الرئيسية
function returnToNav() {
  document.getElementById('page-empty').classList.remove('active');
  document.getElementById('page-home').classList.add('active');
  document.getElementById('page-nav').classList.add('active');
}