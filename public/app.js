const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

let userRole = 'user'; 
let userInfo = null;
let nav1Initialized = false;
let initDataGlobal = "";
let currentBase64Image = ""; 
let currentSliderImage = ""; // متغير لصورة السلايدر
let sliderInterval = null; // مؤقت التمرير التلقائي
let currentSlideIndex = 0; // مؤشر الشريحة الحالية

// إخفاء الصفحات وإظهار الشاحنة
document.getElementById('page-nav').classList.remove('active');
document.getElementById('page-admin').classList.remove('active');
document.getElementById('page-empty').classList.remove('active');
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
      loadStoreData();
      loadSlider(); // تحميل السلايدر
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
              document.getElementById('page-home').classList.add('active');
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
      document.getElementById('page-admin').classList.remove('active');
      document.getElementById('page-empty').classList.remove('active');
      document.getElementById('page-home').classList.add('active');
    }
  }
  setTimeout(() => setNav1(0, tabs), 50);
  nav1Initialized = true;
}

// ====== دوال المتجر (الغلاف واللوجو) ======
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

    if (userRole === 'owner') {
      document.getElementById('edit-cover-btn').style.display = 'flex';
      if (!data.store.logo) editLogoBtn.style.display = 'flex';
    }
  }
}

function editCover() { document.getElementById('cover-upload').click(); }
function editLogo() { document.getElementById('logo-upload').click(); }

async function handleCoverUpload(input) {
  const file = input.files[0]; if (!file) return;
  try {
    const base64 = await compressImage(file, 800, 400); 
    const res = await apiCall('/api/store/update', { cover: base64 });
    if (res.ok) { tg.showAlert('تم تحديث الغلاف بنجاح ✅'); loadStoreData(); } 
    else { tg.showAlert(res.error || 'فشل التحديث'); }
  } catch (err) { alert('حدث خطأ أثناء معالجة الصورة'); console.error(err); }
}

async function handleLogoUpload(input) {
  const file = input.files[0]; if (!file) return;
  try {
    const base64 = await compressImage(file, 400, 400); 
    const res = await apiCall('/api/store/update', { logo: base64 });
    if (res.ok) { tg.showAlert('تم تحديث اللوجو بنجاح ✅'); loadStoreData(); } 
    else { tg.showAlert(res.error || 'فشل التحديث'); }
  } catch (err) { alert('حدث خطأ أثناء معالجة الصورة'); console.error(err); }
}

// ====== دوال السلايدر الجديد ======
async function loadSlider() {
  const data = await apiCall('/api/slider');
  if (data.ok && data.slides) {
    renderSlider(data.slides);
  }
}

function renderSlider(slides) {
  const track = document.getElementById('slider-track');
  const dotsContainer = document.getElementById('slider-dots');
  track.innerHTML = '';
  dotsContainer.innerHTML = '';
  
  if (sliderInterval) clearInterval(sliderInterval); // إيقاف المؤقت القديم
  
  if (slides.length === 0) {
    track.innerHTML = '<div style="color:#a0c4ff; text-align:center; width:100%; padding-top:80px;">لا توجد صور حالياً</div>';
    return;
  }
  
  currentSlideIndex = 0;

  slides.forEach((slide, i) => {
    // إنشاء الشريحة
    const slideDiv = document.createElement('div');
    slideDiv.className = 'slide';
    slideDiv.style.backgroundImage = `url('${slide.image}')`;
    
    // محتوى الشريحة (عنوان + زر)
    let contentHTML = `<div class="slide-content">`;
    if (slide.title) contentHTML += `<h3 class="slide-title">${slide.title}</h3>`;
    if (slide.btnText && slide.btnLink) {
      contentHTML += `<a href="${slide.btnLink}" target="_blank" class="slide-btn">${slide.btnText}</a>`;
    }
    contentHTML += `</div>`;
    slideDiv.innerHTML = contentHTML;
    track.appendChild(slideDiv);

    // إنشاء النقطة (Dot)
    const dot = document.createElement('div');
    dot.className = `slider-dot ${i === 0 ? 'active' : ''}`;
    dot.onclick = () => goToSlide(i, slides.length);
    dotsContainer.appendChild(dot);
  });

  // بدء التمرير التلقائي
  startSliderTimer(slides.length);
}

function goToSlide(index, totalSlides) {
  const track = document.getElementById('slider-track');
  const dots = document.querySelectorAll('.slider-dot');
  
  if (index >= totalSlides) index = 0;
  if (index < 0) index = totalSlides - 1;
  
  currentSlideIndex = index;
  track.style.transform = `translateX(${index * 100}%)`; // في RTL نستخدم القيم الموجبة
  
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === index);
  });
}

function startSliderTimer(totalSlides) {
  if (sliderInterval) clearInterval(sliderInterval);
  sliderInterval = setInterval(() => {
    goToSlide(currentSlideIndex + 1, totalSlides);
  }, 4000); // التمرير كل 4 ثواني
}

// ====== دوال لوحة التحكم (السلايدر) ======
async function handleSliderImageUpload(input) {
  const file = input.files[0]; if (!file) return;
  try {
    const base64 = await compressImage(file, 800, 400); // أبعاد مناسبة للسلايدر
    currentSliderImage = base64;
    document.getElementById('slider-preview').style.backgroundImage = `url('${base64}')`;
    document.getElementById('slider-preview').innerText = '';
  } catch (err) {
    alert('حدث خطأ أثناء معالجة الصورة');
    console.error(err);
  }
}

async function addSlide() {
  const title = document.getElementById('slide-title').value;
  const btnText = document.getElementById('slide-btn-text').value;
  const btnLink = document.getElementById('slide-btn-link').value;

  if (!currentSliderImage) return alert('اختر صورة للسلايدر أولاً');

  const res = await apiCall('/api/slider/add', { 
    image: currentSliderImage, 
    title, 
    btnText, 
    btnLink 
  });

  if (res.ok) {
    tg.showAlert('تمت إضافة الصورة بنجاح ✅');
    loadSlider(); // تحديث السلايدر
    openAdminPanel(); // تحديث اللوحة
  } else {
    tg.showAlert(res.error);
  }
}

async function deleteSlide(id) {
  if(!confirm('هل أنت متأكد من حذف هذه الصورة؟')) return;
  const res = await apiCall('/api/slider/delete', { slideId: id });
  if(res.ok) {
    loadSlider();
    openAdminPanel();
  } else {
    alert(res.error);
  }
}

// ====== ضغط الصور ======
function compressImage(file, maxWidth = 400, maxHeight = 400) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = event => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
        } else {
          if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl);
      };
      img.onerror = error => reject(error);
    };
    reader.onerror = error => reject(error);
  });
}

async function handleImageUpload(input, previewId) {
  const file = input.files[0];
  if (!file) return;

  try {
    const base64 = await compressImage(file);
    currentBase64Image = base64;
    document.getElementById(previewId).style.backgroundImage = `url('${base64}')`;
    document.getElementById(previewId).innerText = ''; 
  } catch (err) {
    alert('حدث خطأ أثناء معالجة الصورة');
    console.error(err);
  }
}

// ====== لوحة التحكم ======
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
  let sliderData = { ok: false, slides: [] };
  let staffData = { ok: false, staff: [] };
  
  if (userRole === 'owner') {
    sliderData = await apiCall('/api/slider');
  }
  if (userRole === 'owner' || userRole === 'admin') {
    staffData = await apiCall('/api/users/list');
  }

  // 1. قائمة المنتجات
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
        <div style="display: flex; align-items: center; flex: 1;">${imgTag}<div>
          <strong style="font-size: 16px; color: white;">${p.name}</strong>
          <p style="font-size: 12px; color: #a0c4ff; margin: 4px 0;">${p.description}</p>
          <div style="font-size: 13px; color: #fff; margin-bottom: 4px;">${pricesStr.join(' | ') || 'لا يوجد سعر'}</div>
          <small style="color: #888;">بواسطة: ${p.creatorName}</small>
        </div></div>
        <div style="display: flex; flex-direction: column; gap: 5px; margin-left: 10px;">
          <button onclick="editProductForm('${p.id}')" style="background: #f39c12; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px;">تعديل</button>
          <button onclick="deleteProduct('${p.id}')" style="background: #e74c3c; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px;">حذف</button>
        </div>
      </div>`;
    }).join('');
  } else { productsHTML = '<p>لا توجد منتجات حالياً.</p>'; }

  // 2. قائمة المشرفين
  let staffHTML = '';
  if (userRole === 'owner' || userRole === 'admin') {
    if (staffData.ok && staffData.staff.length > 0) {
      staffHTML = staffData.staff.map(s => {
        const roleName = s.role === 'admin' ? 'مسؤول' : 'مشرف';
        const roleColor = s.role === 'admin' ? '#e74c3c' : '#f39c12';
        const canEdit = userRole === 'owner' || (userRole === 'admin' && s.role === 'moderator');
        return `
        <div style="background: #152a47; padding: 10px; margin-bottom: 10px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div><strong style="color: white;">${s.name}</strong> <span style="color: ${roleColor}; font-size: 12px;">(${roleName})</span><br><small style="color: #888;">ID: ${s.id}</small></div>
          ${canEdit ? `
          <div style="display: flex; gap: 5px;">
            ${s.role === 'moderator' && userRole === 'owner' ? `<button onclick="updateRole('${s.id}', 'admin')" style="background: #3498db; color: white; border: none; padding: 5px 8px; border-radius: 5px; font-size: 11px;">ترقية</button>` : ''}
            ${s.role === 'admin' && userRole === 'owner' ? `<button onclick="updateRole('${s.id}', 'moderator')" style="background: #f39c12; color: white; border: none; padding: 5px 8px; border-radius: 5px; font-size: 11px;">تنزيل</button>` : ''}
            <button onclick="updateRole('${s.id}', 'user')" style="background: #e74c3c; color: white; border: none; padding: 5px 8px; border-radius: 5px; font-size: 11px;">إزالة</button>
          </div>` : ''}
        </div>`;
      }).join('');
    } else { staffHTML = '<p>لا يوجد مشرفين حالياً.</p>'; }
  }

  // 3. قائمة صور السلايدر (للمالك فقط)
  let sliderHTML = '';
  if (userRole === 'owner') {
    if (sliderData.ok && sliderData.slides.length > 0) {
      sliderHTML = sliderData.slides.map(s => `
        <div style="background: #152a47; padding: 10px; margin-bottom: 10px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="${s.image}" style="width: 60px; height: 40px; border-radius: 5px; object-fit: cover;">
            <div>
              <strong style="color: white; font-size: 14px;">${s.title || 'بدون عنوان'}</strong><br>
              ${s.btnText ? `<small style="color: #4A90E2;">زر: ${s.btnText}</small>` : ''}
            </div>
          </div>
          <button onclick="deleteSlide('${s.id}')" style="background: #e74c3c; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px;">حذف</button>
        </div>
      `).join('');
    } else {
      sliderHTML = '<p>لا توجد صور في السلايدر.</p>';
    }
  }

  // بناء الواجهة النهائية
  content.innerHTML = `
    <!-- المنتجات -->
    <div style="background: #112238; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
      <h3 style="margin-top: 0; color: white;">إضافة / تعديل منتج</h3>
      <input type="text" id="new-prod-name" placeholder="اسم المنتج" style="width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 5px; border: none; box-sizing: border-box;">
      <textarea id="new-prod-desc" placeholder="وصف المنتج..." style="width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 5px; border: none; box-sizing: border-box; resize: none;"></textarea>
      
      <div style="margin-bottom: 8px;">
        <label for="image-upload" style="display: block; color: #a0c4ff; font-size: 12px; margin-bottom: 5px;">صورة المنتج (اختياري):</label>
        <div style="display: flex; align-items: center; gap: 10px;">
          <input type="file" id="image-upload" accept="image/*" onchange="handleImageUpload(this, 'image-preview')" style="display: none;">
          <label for="image-upload" style="background: #2a3b5c; color: white; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-size: 12px;">اختر صورة</label>
          <div id="image-preview" style="width: 40px; height: 40px; border-radius: 5px; background: #0d1526; background-size: cover; background-position: center; display: flex; justify-content: center; align-items: center; color: #666; font-size: 10px;">لا توجد</div>
        </div>
      </div>

      <p style="color: #a0c4ff; font-size: 12px; margin: 5px 0;">الأسعار:</p>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
        <input type="number" id="price-usd" placeholder="دولار $" style="padding: 8px; border-radius: 5px; border: none;">
        <input type="number" id="price-ton" placeholder="تون TON" style="padding: 8px; border-radius: 5px; border: none;">
        <input type="number" id="price-stars" placeholder="نجوم ⭐" style="padding: 8px; border-radius: 5px; border: none;">
        <input type="number" id="price-sar" placeholder="ريال 🇸🇦" style="padding: 8px; border-radius: 5px; border: none;">
      </div>

      <button onclick="addProduct()" id="submit-btn" style="background: #6A0DAD; color: white; padding: 12px; width: 100%; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">إضافة المنتج</button>
      <button id="cancel-edit-btn" onclick="openAdminPanel()" style="display: none; background: #e74c3c; color: white; padding: 12px; width: 100%; border: none; border-radius: 5px; cursor: pointer; font-weight: bold; margin-top: 8px;">إلغاء التعديل</button>
    </div>

    <h3 style="color: white;">المنتجات المضافة</h3>
    <div>${productsHTML}</div>
    
    ${userRole === 'owner' ? `
      <hr style="border-color: #333; margin: 20px 0;">
      
      <!-- إدارة السلايدر -->
      <div style="background: #112238; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
        <h3 style="margin-top: 0; color: white;">إضافة صورة للسلايدر</h3>
        
        <div style="margin-bottom: 8px;">
          <label for="slider-upload" style="display: block; color: #a0c4ff; font-size: 12px; margin-bottom: 5px;">صورة السلايدر (مطلوبة):</label>
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="file" id="slider-upload" accept="image/*" onchange="handleSliderImageUpload(this)" style="display: none;">
            <label for="slider-upload" style="background: #2a3b5c; color: white; padding: 8px 15px; border-radius: 5px; cursor: pointer; font-size: 12px;">اختر صورة</label>
            <div id="slider-preview" style="width: 80px; height: 40px; border-radius: 5px; background: #0d1526; background-size: cover; background-position: center; display: flex; justify-content: center; align-items: center; color: #666; font-size: 10px;">لا توجد</div>
          </div>
        </div>

        <input type="text" id="slide-title" placeholder="عنوان الصورة (اختياري)" style="width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 5px; border: none; box-sizing: border-box;">
        <input type="text" id="slide-btn-text" placeholder="نص الزر (اختياري)" style="width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 5px; border: none; box-sizing: border-box;">
        <input type="text" id="slide-btn-link" placeholder="رابط الزر (مثال: https://...)" style="width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 5px; border: none; box-sizing: border-box;">
        
        <button onclick="addSlide()" style="background: #4A90E2; color: white; padding: 12px; width: 100%; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">إضافة الصورة</button>
      </div>

      <h3 style="color: white;">صور السلايدر الحالية</h3>
      <div>${sliderHTML}</div>
      <hr style="border-color: #333; margin: 20px 0;">
    ` : ''}

    ${userRole === 'owner' || userRole === 'admin' ? `
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
  currentBase64Image = ""; 
  currentSliderImage = "";
}

async function addProduct() {
  const name = document.getElementById('new-prod-name').value;
  const description = document.getElementById('new-prod-desc').value;
  const prices = {
    usd: parseFloat(document.getElementById('price-usd').value) || 0,
    ton: parseFloat(document.getElementById('price-ton').value) || 0,
    stars: parseFloat(document.getElementById('price-stars').value) || 0,
    sar: parseFloat(document.getElementById('price-sar').value) || 0,
  };
  if(!name) return alert('أدخل اسم المنتج على الأقل');
  const res = await apiCall('/api/products/add', { name, description, image: currentBase64Image, prices });
  if(res.ok) { tg.showAlert('تمت الإضافة بنجاح ✅'); openAdminPanel(); } 
  else { tg.showAlert(res.error); }
}

async function editProductForm(id) {
  const data = await apiCall('/api/products');
  const product = data.products.find(p => p.id === id);
  if(!product) return;

  document.getElementById('new-prod-name').value = product.name;
  document.getElementById('new-prod-desc').value = product.description;
  if(product.image) {
    document.getElementById('image-preview').style.backgroundImage = `url('${product.image}')`;
    document.getElementById('image-preview').innerText = '';
    currentBase64Image = product.image;
  }
  document.getElementById('price-usd').value = product.prices?.usd || '';
  document.getElementById('price-ton').value = product.prices?.ton || '';
  document.getElementById('price-stars').value = product.prices?.stars || '';
  document.getElementById('price-sar').value = product.prices?.sar || '';

  const submitBtn = document.getElementById('submit-btn');
  submitBtn.textContent = 'حفظ التعديلات';
  submitBtn.style.background = '#f39c12';
  submitBtn.setAttribute('onclick', `saveEdit('${id}')`);
  document.getElementById('cancel-edit-btn').style.display = 'block';
  document.getElementById('page-admin').scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveEdit(id) {
  const name = document.getElementById('new-prod-name').value;
  const description = document.getElementById('new-prod-desc').value;
  const prices = {
    usd: parseFloat(document.getElementById('price-usd').value) || 0,
    ton: parseFloat(document.getElementById('price-ton').value) || 0,
    stars: parseFloat(document.getElementById('price-stars').value) || 0,
    sar: parseFloat(document.getElementById('price-sar').value) || 0,
  };
  const res = await apiCall('/api/products/edit', { productId: id, name, description, image: currentBase64Image, prices });
  if(res.ok) { tg.showAlert('تم التعديل بنجاح ✅'); openAdminPanel(); } 
  else { tg.showAlert(res.error); }
}

async function deleteProduct(id) {
  if(!confirm('هل أنت متأكد من الحذف؟')) return;
  const res = await apiCall('/api/products/delete', { productId: id });
  if(res.ok) openAdminPanel();
  else alert(res.error);
}

async function promoteUser() {
  const targetId = document.getElementById('target-id').value;
  const newRole = document.getElementById('target-role').value;
  if(!targetId) return alert('أدخل الآي دي');
  const res = await apiCall('/api/users/promote', { targetId, newRole });
  if(res.ok) { tg.showAlert('تمت الترقية بنجاح ✅'); openAdminPanel(); } 
  else { tg.showAlert(res.error); }
}

async function updateRole(targetId, newRole) {
  const actionText = newRole === 'user' ? 'إزالة' : 'تعديل الرتبة';
  if(!confirm(`هل أنت متأكد من ${actionText} لهذا الشخص؟`)) return;
  const res = await apiCall('/api/users/update-role', { targetId, newRole });
  if(res.ok) { tg.showAlert('تم التحديث بنجاح ✅'); openAdminPanel(); } 
  else { tg.showAlert(res.error); }
}

document.getElementById('close-admin').addEventListener('click', () => {
  document.getElementById('page-admin').classList.remove('active');
  document.getElementById('page-empty').classList.add('active');
});

function returnToNav() {
  document.getElementById('page-empty').classList.remove('active');
  document.getElementById('page-home').classList.add('active');
  document.getElementById('page-nav').classList.add('active');
}
