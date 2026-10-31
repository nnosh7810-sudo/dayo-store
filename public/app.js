/* ============================================================
   DAYO STORE — app.js (نسخة كاملة: القديم + نظام الأقسام الديناميكي)
   ============================================================ */

const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

let userRole = 'user';
let userInfo = null;
let nav1Initialized = false;
let initDataGlobal = "";
let currentBase64Image = "";
let currentSliderImage = "";
let sliderInterval = null;
let currentSlideIndex = 0;
let storeMenuLinks = {};

/* ====== متغيرات نظام الأقسام الديناميكي ====== */
let dynamicSections = [];        // الأقسام المحمّلة من السيرفر
let editingSectionId = null;     // null = إضافة جديدة، وإلا = تعديل
let sectionImageBuffer = "";     // صورة القسم (Base64)
let sectionItemsBuffer = [];     // عناصر القسم (للشبكة/المنتجات)

/* أنواع الأقسام المدعومة */
const SECTION_TYPES = {
  grid:     { label: 'شبكة أيقونات (4 أزرار)', color: '#4A90E2' },
  text:     { label: 'قسم نصي',                 color: '#8A2BE2' },
  image:    { label: 'قسم صورة',                color: '#E24A90' },
  products: { label: 'قسم منتجات',              color: '#4AE2A0' },
  banner:   { label: 'بانر دعائي',              color: '#f39c12' }
};

document.getElementById('page-nav').classList.remove('active');
document.getElementById('page-admin').classList.remove('active');
document.getElementById('page-empty').classList.remove('active');
document.getElementById('page-truck').classList.add('active');

/* ====== API ====== */
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
      loadSlider();
      loadDynamicSections();
    }
  } catch (err) { console.error(err); }
}
fetchUserRole();

/* ====== أنيميشن الشاحنة ====== */
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

/* ====== أيقونات الشريط السفلي ====== */
const icons = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  cart:'<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  headset:'<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
  bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  admin:'<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm1-13h-2v6h2zm0 8h-2v2h2z"/>'
};
const svg=(name,size=24,stroke=2)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;

/* ====== الشريط السفلي ====== */
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

/* ====== دوال المتجر ====== */
async function loadStoreData() {
  const data = await apiCall('/api/store');
  if (data.ok && data.store) {
    document.getElementById('store-name').textContent = data.store.name;
    document.getElementById('store-users').textContent = (data.store.usersCount || 0).toLocaleString();
    document.getElementById('store-online').textContent = (data.store.onlineCount || 0).toLocaleString();

    if (data.store.logo) {
      const logoEl = document.getElementById('store-logo');
      logoEl.style.backgroundImage = `url('${data.store.logo}')`;
      logoEl.innerText = '';
    }

    storeMenuLinks = data.store.menuLinks || {};

    if (userRole === 'owner') {
      document.getElementById('edit-cover-btn').style.display = 'block';
      document.getElementById('edit-logo-btn').style.display = 'block';
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
    if (res.ok) { tg.showAlert('تم تحديث الخلفية بنجاح ✅'); loadStoreData(); }
    else { tg.showAlert(res.error || 'فشل التحديث'); }
  } catch (err) { alert('حدث خطأ'); }
}

async function handleLogoUpload(input) {
  const file = input.files[0]; if (!file) return;
  try {
    const base64 = await compressImage(file, 400, 400);
    const res = await apiCall('/api/store/update', { logo: base64 });
    if (res.ok) { tg.showAlert('تم تحديث اللوجو بنجاح ✅'); loadStoreData(); }
    else { tg.showAlert(res.error || 'فشل التحديث'); }
  } catch (err) { alert('حدث خطأ'); }
}

/* ====== السلايدر ====== */
async function loadSlider() {
  const data = await apiCall('/api/slider');
  if (data.ok && data.slides) renderSlider(data.slides);
}

function renderSlider(slides) {
  const track = document.getElementById('slider-track');
  const dotsContainer = document.getElementById('slider-dots');
  track.innerHTML = '';
  dotsContainer.innerHTML = '';

  if (sliderInterval) clearInterval(sliderInterval);

  if (slides.length === 0) {
    track.innerHTML = '<div style="color:#a0c4ff; text-align:center; width:100%; padding-top:80px;">لا توجد صور حالياً. أضف صوراً من لوحة التحكم.</div>';
    return;
  }

  currentSlideIndex = 0;

  slides.forEach((slide, i) => {
    const slideDiv = document.createElement('div');
    slideDiv.className = 'slide';
    slideDiv.style.backgroundImage = `url('${slide.image}')`;

    let contentHTML = `<div class="slide-content">`;
    contentHTML += `<span class="slide-badge">👑 عروض خاصة</span>`;
    if (slide.title) contentHTML += `<h3 class="slide-title">${slide.title}</h3>`;
    if (slide.btnText && slide.btnLink) {
      contentHTML += `<a href="${slide.btnLink}" target="_blank" class="slide-btn">${slide.btnText} <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></a>`;
    }
    contentHTML += `</div>`;
    slideDiv.innerHTML = contentHTML;
    track.appendChild(slideDiv);

    const dot = document.createElement('div');
    dot.className = `slider-dot ${i === 0 ? 'active' : ''}`;
    dot.onclick = () => goToSlide(i, slides.length);
    dotsContainer.appendChild(dot);
  });

  startSliderTimer(slides.length);
}

function goToSlide(index, totalSlides) {
  const track = document.getElementById('slider-track');
  const dots = document.querySelectorAll('.slider-dot');
  if (index >= totalSlides) index = 0;
  if (index < 0) index = totalSlides - 1;
  currentSlideIndex = index;
  track.style.transform = `translateX(${index * 100}%)`;
  dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
}

function startSliderTimer(totalSlides) {
  if (sliderInterval) clearInterval(sliderInterval);
  sliderInterval = setInterval(() => {
    goToSlide(currentSlideIndex + 1, totalSlides);
  }, 4000);
}

async function handleSliderImageUpload(input) {
  const file = input.files[0]; if (!file) return;
  try {
    const base64 = await compressImage(file, 800, 400);
    currentSliderImage = base64;
    document.getElementById('slider-preview').style.backgroundImage = `url('${base64}')`;
    document.getElementById('slider-preview').innerText = '';
  } catch (err) { alert('حدث خطأ'); }
}

async function addSlide() {
  const title = document.getElementById('slide-title').value;
  const btnText = document.getElementById('slide-btn-text').value;
  const btnLink = document.getElementById('slide-btn-link').value;
  if (!currentSliderImage) return alert('اختر صورة أولاً');
  const res = await apiCall('/api/slider/add', { image: currentSliderImage, title, btnText, btnLink });
  if (res.ok) {
    tg.showAlert('تمت الإضافة بنجاح ✅');
    loadSlider();
    openAdminPanel();
  } else { tg.showAlert(res.error); }
}

async function deleteSlide(id) {
  if(!confirm('حذف هذه الصورة؟')) return;
  const res = await apiCall('/api/slider/delete', { slideId: id });
  if(res.ok) { loadSlider(); openAdminPanel(); }
  else { alert(res.error); }
}

async function saveMenuLinks() {
  const links = {
    telegram: document.getElementById('link-telegram').value,
    nft: document.getElementById('link-nft').value,
    social: document.getElementById('link-social').value,
    games: document.getElementById('link-games').value
  };
  const res = await apiCall('/api/store/update-links', { links });
  if(res.ok) {
    tg.showAlert('تم حفظ الروابط بنجاح ✅');
    loadStoreData();
    openAdminPanel();
  } else { tg.showAlert(res.error); }
}

/* ====== ضغط الصور ====== */
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
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
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
  } catch (err) { alert('حدث خطأ'); }
}

/* ============================================================
   ✅✅✅  نظام الأقسام الديناميكي  ✅✅✅
   ============================================================ */

/* جلب الأقسام من السيرفر */
async function loadDynamicSections() {
  const data = await apiCall('/api/sections');
  if (data.ok && Array.isArray(data.sections)) {
    dynamicSections = data.sections;
    renderDynamicSections();
  }
}

/* رسم الأقسام على الصفحة الرئيسية */
function renderDynamicSections() {
  const container = document.getElementById('dynamic-sections-container');
  if (!container) return;
  container.innerHTML = '';

  const visible = dynamicSections
    .filter(s => s.visible !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  if (visible.length === 0) {
    container.innerHTML = '<p style="text-align:center;color:#a0c4ff;font-size:13px;padding:20px;">لا توجد أقسام. أضفها من لوحة التحكم.</p>';
    return;
  }

  visible.forEach(sec => {
    const el = document.createElement('div');
    el.className = 'dynamic-section';
    el.id = `section-${sec.id}`;

    if (sec.type === 'grid') {
      el.innerHTML = sec.title ? `<h2>${sec.title}</h2>` : '';
      const grid = document.createElement('div');
      grid.className = 'grid-menu';
      (sec.items || []).forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'grid-item';
        itemDiv.onclick = () => handleSectionItemClick(item);
        const iconHTML = item.image
          ? `<img src="${item.image}" alt="">`
          : `<span>${item.icon || '📦'}</span>`;
        itemDiv.innerHTML = `
          <div class="grid-icon" style="color:${item.color || '#4A90E2'};">${iconHTML}</div>
          <div class="grid-title">${item.title || 'عنصر'}</div>
        `;
        grid.appendChild(itemDiv);
      });
      el.appendChild(grid);

    } else if (sec.type === 'text') {
      el.innerHTML = `
        ${sec.image ? `<img src="${sec.image}" alt="">` : ''}
        ${sec.title ? `<h2>${sec.title}</h2>` : ''}
        ${sec.content ? `<p>${sec.content}</p>` : ''}
        ${sec.buttonText && sec.buttonLink ? `<a class="section-btn" href="${sec.buttonLink}" target="_blank">${sec.buttonText}</a>` : ''}
      `;

    } else if (sec.type === 'image') {
      el.innerHTML = `
        ${sec.title ? `<h2>${sec.title}</h2>` : ''}
        ${sec.image ? `<img src="${sec.image}" alt="">` : ''}
        ${sec.content ? `<p>${sec.content}</p>` : ''}
        ${sec.buttonText && sec.buttonLink ? `<a class="section-btn" href="${sec.buttonLink}" target="_blank">${sec.buttonText}</a>` : ''}
      `;

    } else if (sec.type === 'products') {
      el.innerHTML = `<h2>${sec.title || 'منتجات'}</h2>`;
      const grid = document.createElement('div');
      grid.className = 'dynamic-products';
      (sec.items || []).forEach(item => {
        const card = document.createElement('div');
        card.className = 'prod-card';
        const price = item.price ? `<div class="price">${item.price}</div>` : '';
        card.innerHTML = `
          ${item.image ? `<img src="${item.image}" alt="">` : ''}
          <div class="info">
            <strong>${item.title || ''}</strong>
            ${item.description ? `<small>${item.description}</small>` : ''}
            ${price}
          </div>
        `;
        grid.appendChild(card);
      });
      el.appendChild(grid);

    } else if (sec.type === 'banner') {
      el.innerHTML = `
        ${sec.image ? `<img src="${sec.image}" alt="" style="height:140px;object-fit:cover;">` : ''}
        ${sec.title ? `<h2>${sec.title}</h2>` : ''}
        ${sec.content ? `<p>${sec.content}</p>` : ''}
        ${sec.buttonText && sec.buttonLink ? `<a class="section-btn" href="${sec.buttonLink}" target="_blank">${sec.buttonText}</a>` : ''}
      `;
    }

    container.appendChild(el);
  });
}

/* ضغط عنصر داخل قسم (شبكة/منتجات) */
function handleSectionItemClick(item) {
  if (item.link) {
    if (item.link.startsWith('http')) window.open(item.link, '_blank');
    else {
      const el = document.getElementById(item.link);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  }
}

/* ============================================================
   لوحة تحكم إدارة الأقسام
   ============================================================ */

function renderSectionsAdmin() {
  let listHTML = '';
  const sorted = [...dynamicSections].sort((a,b) => (a.order||0)-(b.order||0));

  if (sorted.length === 0) {
    listHTML = '<p style="color:#a0c4ff;font-size:13px;">لا توجد أقسام بعد. أضف أول قسم من الأعلى.</p>';
  } else {
    listHTML = sorted.map((sec, idx) => {
      const typeInfo = SECTION_TYPES[sec.type] || { label: sec.type, color: '#666' };
      const visibleLabel = sec.visible === false ? '👁️‍🗨️ مخفي' : '👁️ ظاهر';
      return `
        <div class="admin-section-card">
          <div class="info">
            <strong>${sec.title || '(بدون عنوان)'}</strong>
            <small>
              <span class="type-badge" style="background:${typeInfo.color};">${typeInfo.label}</span>
              ${visibleLabel} — ترتيب: ${idx + 1}
              ${sec.items && sec.items.length ? ` — ${sec.items.length} عنصر` : ''}
            </small>
          </div>
          <div class="actions">
            <button class="btn-up" onclick="moveSection('${sec.id}', -1)" title="أعلى">⬆️</button>
            <button class="btn-down" onclick="moveSection('${sec.id}', 1)" title="أسفل">⬇️</button>
            <button class="btn-toggle" onclick="toggleSectionVisibility('${sec.id}')" title="إظهار/إخفاء">${sec.visible === false ? '👁️‍🗨️' : '👁️'}</button>
            <button class="btn-edit" onclick="openSectionEditor('${sec.id}')" title="تعديل">✏️</button>
            <button class="btn-delete" onclick="deleteSection('${sec.id}')" title="حذف">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  }

  return `
    <hr style="border-color:#333;margin:20px 0;">
    <div class="admin-form">
      <h3 style="margin-top:0;color:white;">🗂️ إدارة الأقسام</h3>
      <p style="color:#a0c4ff;font-size:12px;">أضف/عدّل/رتّب أقسام الصفحة الرئيسية. التغييرات تُطبَّق فوراً بعد الحفظ.</p>
      <button class="primary" onclick="openSectionEditor(null)">➕ إضافة قسم جديد</button>
      <div id="section-editor-container"></div>
    </div>
    <h3 style="color:white;">الأقسام الحالية (${sorted.length})</h3>
    <div>${listHTML}</div>
  `;
}

/* فتح محرر قسم (null = قسم جديد) */
function openSectionEditor(sectionId) {
  editingSectionId = sectionId;
  const sec = sectionId ? dynamicSections.find(s => s.id === sectionId) : null;

  sectionImageBuffer = sec?.image || '';
  sectionItemsBuffer = sec?.items ? JSON.parse(JSON.stringify(sec.items)) : [];

  const currentType = sec?.type || 'grid';
  const container = document.getElementById('section-editor-container');

  let typeOptions = Object.entries(SECTION_TYPES).map(([key, val]) =>
    `<option value="${key}" ${key === currentType ? 'selected' : ''}>${val.label}</option>`
  ).join('');

  container.innerHTML = `
    <div class="admin-form" style="margin-top:15px;">
      <h3 style="margin-top:0;">${sectionId ? '✏️ تعديل قسم' : '➕ قسم جديد'}</h3>

      <label>عنوان القسم</label>
      <input type="text" id="sec-title" value="${sec?.title || ''}" placeholder="مثال: خدماتنا">

      <label>نوع القسم</label>
      <select id="sec-type" onchange="onSectionTypeChange()">${typeOptions}</select>

      <div id="sec-type-fields"></div>

      <button class="primary" onclick="saveSection()">${sectionId ? '💾 حفظ التعديلات' : '➕ إضافة القسم'}</button>
      <button class="danger" onclick="closeSectionEditor()">إلغاء</button>
    </div>
  `;

  onSectionTypeChange();
}

function closeSectionEditor() {
  editingSectionId = null;
  sectionImageBuffer = '';
  sectionItemsBuffer = [];
  const c = document.getElementById('section-editor-container');
  if (c) c.innerHTML = '';
}

/* تحديث الحقول حسب النوع المختار */
function onSectionTypeChange() {
  const type = document.getElementById('sec-type').value;
  const fields = document.getElementById('sec-type-fields');
  const sec = editingSectionId ? dynamicSections.find(s => s.id === editingSectionId) : null;

  let html = '';

  // الصورة (تظهر لكل الأنواع عدا الشبكة والمنتجات حيث الصورة داخل العناصر)
  if (['text', 'image', 'banner'].includes(type)) {
    html += `
      <label>صورة القسم</label>
      <div class="img-preview-box" id="sec-img-preview" style="${sectionImageBuffer ? `background-image:url('${sectionImageBuffer}')` : ''}">${sectionImageBuffer ? '' : 'لا توجد'}</div>
      <input type="file" id="sec-img-file" accept="image/*" class="hidden-file" onchange="handleSectionImageUpload(this)">
      <label for="sec-img-file" class="img-upload-label">📷 اختر صورة</label>
    `;
  }

  // نص المحتوى
  if (['text', 'image', 'banner'].includes(type)) {
    html += `
      <label>محتوى نصي</label>
      <textarea id="sec-content" rows="3" placeholder="اكتب الوصف...">${sec?.content || ''}</textarea>
    `;
  }

  // زر CTA
  if (['text', 'image', 'banner'].includes(type)) {
    html += `
      <label>نص الزر (اختياري)</label>
      <input type="text" id="sec-btn-text" value="${sec?.buttonText || ''}" placeholder="مثال: اضغط هنا">
      <label>رابط الزر (اختياري)</label>
      <input type="text" id="sec-btn-link" value="${sec?.buttonLink || ''}" placeholder="https://...">
    `;
  }

  // عناصر (للشبكة والمنتجات)
  if (['grid', 'products'].includes(type)) {
    html += `<label>العناصر (${sectionItemsBuffer.length})</label>
             <div id="sec-items-list"></div>
             <button class="add-item-btn" onclick="addSectionItem()">➕ إضافة عنصر</button>`;
  }

  fields.innerHTML = html;
  if (['grid', 'products'].includes(type)) renderSectionItems();
}

/* رفع صورة القسم */
async function handleSectionImageUpload(input) {
  const file = input.files[0]; if (!file) return;
  try {
    const base64 = await compressImage(file, 800, 600);
    sectionImageBuffer = base64;
    const p = document.getElementById('sec-img-preview');
    if (p) { p.style.backgroundImage = `url('${base64}')`; p.innerText = ''; }
  } catch (e) { alert('خطأ في الصورة'); }
}

/* إدارة عناصر القسم */
function renderSectionItems() {
  const list = document.getElementById('sec-items-list');
  if (!list) return;

  if (sectionItemsBuffer.length === 0) {
    list.innerHTML = '<p style="color:#a0c4ff;font-size:12px;">لا توجد عناصر بعد.</p>';
    return;
  }

  list.innerHTML = sectionItemsBuffer.map((item, i) => `
    <div class="item-editor">
      <div class="item-row">
        <input type="text" placeholder="العنوان" value="${item.title || ''}" oninput="updateSectionItem(${i}, 'title', this.value)">
        <input type="text" placeholder="الأيقونة (إيموجي)" value="${item.icon || ''}" oninput="updateSectionItem(${i}, 'icon', this.value)" style="max-width:80px;">
      </div>
      <div class="item-row">
        <input type="text" placeholder="الرابط (http أو #id)" value="${item.link || ''}" oninput="updateSectionItem(${i}, 'link', this.value)">
        <input type="text" placeholder="الوصف" value="${item.description || ''}" oninput="updateSectionItem(${i}, 'description', this.value)">
      </div>
      <div class="item-row">
        <input type="text" placeholder="السعر (اختياري)" value="${item.price || ''}" oninput="updateSectionItem(${i}, 'price', this.value)">
        <label class="img-upload-label" style="margin:0;padding:6px 10px;">
          📷 صورة
          <input type="file" accept="image/*" style="display:none;" onchange="handleSectionItemImage(${i}, this)">
        </label>
        ${item.image ? `<span style="color:#4AE2A0;font-size:11px;">✓ صورة مرفقة</span>` : ''}
      </div>
      <button class="remove-item" onclick="removeSectionItem(${i})">🗑️ حذف العنصر</button>
    </div>
  `).join('');
}

function addSectionItem() {
  sectionItemsBuffer.push({ title: '', icon: '', link: '', description: '', price: '', image: '' });
  renderSectionItems();
}

function updateSectionItem(i, key, val) {
  if (!sectionItemsBuffer[i]) return;
  sectionItemsBuffer[i][key] = val;
}

function removeSectionItem(i) {
  sectionItemsBuffer.splice(i, 1);
  renderSectionItems();
}

async function handleSectionItemImage(i, input) {
  const file = input.files[0]; if (!file) return;
  try {
    const base64 = await compressImage(file, 300, 300);
    sectionItemsBuffer[i].image = base64;
    renderSectionItems();
  } catch (e) { alert('خطأ في الصورة'); }
}

/* حفظ القسم (إضافة أو تعديل) */
async function saveSection() {
  const title = document.getElementById('sec-title').value.trim();
  const type = document.getElementById('sec-type').value;

  if (!title) return alert('أدخل عنوان القسم');

  const payload = {
    title,
    type,
    image: sectionImageBuffer || '',
    content: document.getElementById('sec-content')?.value || '',
    buttonText: document.getElementById('sec-btn-text')?.value || '',
    buttonLink: document.getElementById('sec-btn-link')?.value || '',
    items: ['grid', 'products'].includes(type) ? sectionItemsBuffer : []
  };

  let res;
  if (editingSectionId) {
    res = await apiCall('/api/sections/edit', { sectionId: editingSectionId, ...payload });
  } else {
    res = await apiCall('/api/sections/add', payload);
  }

  if (res.ok) {
    tg.showAlert(editingSectionId ? 'تم تعديل القسم ✅' : 'تمت إضافة القسم ✅');
    closeSectionEditor();
    await loadDynamicSections();
    openAdminPanel();
  } else {
    tg.showAlert(res.error || 'فشل الحفظ');
  }
}

/* حذف قسم */
async function deleteSection(id) {
  if (!confirm('حذف هذا القسم نهائياً؟')) return;
  const res = await apiCall('/api/sections/delete', { sectionId: id });
  if (res.ok) {
    tg.showAlert('تم الحذف ✅');
    await loadDynamicSections();
    openAdminPanel();
  } else { tg.showAlert(res.error); }
}

/* إظهار/إخفاء قسم */
async function toggleSectionVisibility(id) {
  const sec = dynamicSections.find(s => s.id === id);
  if (!sec) return;
  const res = await apiCall('/api/sections/toggle', { sectionId: id, visible: sec.visible === false });
  if (res.ok) {
    await loadDynamicSections();
    openAdminPanel();
  } else { tg.showAlert(res.error); }
}
/* ترتيب قسم لأعلى/أسفل */
async function moveSection(id, direction) {
  const sorted = [...dynamicSections].sort((a,b)=>(a.order||0)-(b.order||0));
  const idx = sorted.findIndex(s => s.id === id);
  if (idx === -1) return;

  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= sorted.length) return; // لا تغيير

  // تبديل المواضع
  const tmp = sorted[idx];
  sorted[idx] = sorted[newIdx];
  sorted[newIdx] = tmp;

  // إعادة تعيين order لكل الأقسام
  const orders = sorted.map((s, i) => ({ id: s.id, order: i }));

  const res = await apiCall('/api/sections/reorder', { orders });
  if (res.ok) {
    await loadDynamicSections();
    openAdminPanel();
  } else {
    tg.showAlert(res.error || 'فشل الترتيب');
  }
}

/* ============================================================
   لوحة التحكم الرئيسية — مدمج مع نظام الأقسام
   ============================================================ */

async function openAdminPanel() {
  document.getElementById('page-home').classList.remove('active');
  document.getElementById('page-nav').classList.remove('active');
  document.getElementById('page-admin').classList.add('active');

  const content = document.getElementById('admin-content');
  content.innerHTML = `<div class="custom-loader-wrapper"><div class="loader"><p class="loader-text">جاري التحميل...</p><span class="load"></span></div></div>`;

  // تحميل كل البيانات بالتوازي
  const [data, sliderData, staffData, sectionsData] = await Promise.all([
    apiCall('/api/products'),
    userRole === 'owner' ? apiCall('/api/slider') : Promise.resolve({ ok: false, slides: [] }),
    (userRole === 'owner' || userRole === 'admin') ? apiCall('/api/users/list') : Promise.resolve({ ok: false, staff: [] }),
    apiCall('/api/sections')
  ]);

  // تحديث الأقسام المحلية
  if (sectionsData.ok && Array.isArray(sectionsData.sections)) {
    dynamicSections = sectionsData.sections;
    renderDynamicSections();
  }

  // ===== 1. المنتجات =====
  let productsHTML = '';
  if (data.ok && data.products.length > 0) {
    productsHTML = data.products.map(p => {
      let pricesStr = [];
      if (p.prices?.usd > 0) pricesStr.push(`$${p.prices.usd}`);
      if (p.prices?.ton > 0) pricesStr.push(`💎 ${p.prices.ton} TON`);
      if (p.prices?.stars > 0) pricesStr.push(`⭐ ${p.prices.stars}`);
      if (p.prices?.sar > 0) pricesStr.push(`🇸🇦 ${p.prices.sar} ريال`);
      const imgTag = p.image ? `<img src="${p.image}" style="width: 50px; height: 50px; border-radius: 5px; object-fit: cover; margin-left: 10px;">` : '';
      return `<div style="background: #152a47; padding: 12px; margin-bottom: 12px; border-radius: 10px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div style="display: flex; align-items: center; flex: 1;">${imgTag}<div>
          <strong style="font-size: 16px; color: white;">${p.name}</strong>
          <p style="font-size: 12px; color: #a0c4ff; margin: 4px 0;">${p.description}</p>
          <div style="font-size: 13px; color: #fff; margin-bottom: 4px;">${pricesStr.join(' | ') || 'لا يوجد سعر'}</div>
        </div></div>
        <div style="display: flex; flex-direction: column; gap: 5px; margin-left: 10px;">
          <button onclick="editProductForm('${p.id}')" style="background: #f39c12; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px;">تعديل</button>
          <button onclick="deleteProduct('${p.id}')" style="background: #e74c3c; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px;">حذف</button>
        </div>
      </div>`;
    }).join('');
  } else { productsHTML = '<p>لا توجد منتجات.</p>'; }

  // ===== 2. المشرفين =====
  let staffHTML = '';
  if (userRole === 'owner' || userRole === 'admin') {
    if (staffData.ok && staffData.staff.length > 0) {
      staffHTML = staffData.staff.map(s => {
        const roleName = s.role === 'admin' ? 'مسؤول' : 'مشرف';
        const roleColor = s.role === 'admin' ? '#e74c3c' : '#f39c12';
        const canEdit = userRole === 'owner' || (userRole === 'admin' && s.role === 'moderator');
        return `<div style="background: #152a47; padding: 10px; margin-bottom: 10px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div><strong style="color: white;">${s.name}</strong> <span style="color: ${roleColor}; font-size: 12px;">(${roleName})</span><br><small style="color: #888;">ID: ${s.id}</small></div>
          ${canEdit ? `<div style="display: flex; gap: 5px;">
            ${s.role === 'moderator' && userRole === 'owner' ? `<button onclick="updateRole('${s.id}', 'admin')" style="background: #3498db; color: white; border: none; padding: 5px 8px; border-radius: 5px; font-size: 11px;">ترقية</button>` : ''}
            ${s.role === 'admin' && userRole === 'owner' ? `<button onclick="updateRole('${s.id}', 'moderator')" style="background: #f39c12; color: white; border: none; padding: 5px 8px; border-radius: 5px; font-size: 11px;">تنزيل</button>` : ''}
            <button onclick="updateRole('${s.id}', 'user')" style="background: #e74c3c; color: white; border: none; padding: 5px 8px; border-radius: 5px; font-size: 11px;">إزالة</button>
          </div>` : ''}
        </div>`;
      }).join('');
    } else { staffHTML = '<p>لا يوجد مشرفين.</p>'; }
  }

  // ===== 3. السلايدر =====
  let sliderHTML = '';
  if (userRole === 'owner') {
    if (sliderData.ok && sliderData.slides.length > 0) {
      sliderHTML = sliderData.slides.map(s => `
        <div style="background: #152a47; padding: 10px; margin-bottom: 10px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="${s.image}" style="width: 60px; height: 40px; border-radius: 5px; object-fit: cover;">
            <div><strong style="color: white; font-size: 14px;">${s.title || 'بدون عنوان'}</strong><br>${s.btnText ? `<small style="color: #4A90E2;">زر: ${s.btnText}</small>` : ''}</div>
          </div>
          <button onclick="deleteSlide('${s.id}')" style="background: #e74c3c; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 12px;">حذف</button>
        </div>
      `).join('');
    } else { sliderHTML = '<p>لا توجد صور في السلايدر.</p>'; }
  }

  const store = storeMenuLinks || {};

  // ===== بناء لوحة التحكم =====
  content.innerHTML = `
    <!-- المنتجات -->
    <div style="background: #112238; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
      <h3 style="margin-top: 0; color: white;">إضافة / تعديل منتج</h3>
      <input type="text" id="new-prod-name" placeholder="اسم المنتج" style="width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 5px; border: none; box-sizing: border-box;">
      <textarea id="new-prod-desc" placeholder="وصف المنتج..." style="width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 5px; border: none; box-sizing: border-box; resize: none;"></textarea>
      <div style="margin-bottom: 8px;">
        <label for="image-upload" style="display: block; color: #a0c4ff; font-size: 12px; margin-bottom: 5px;">صورة المنتج:</label>
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

    ${userRole === 'owner' || userRole === 'admin' ? renderSectionsAdmin() : ''}

    ${userRole === 'owner' ? `
      <hr style="border-color: #333; margin: 20px 0;">

      <!-- إدارة السلايدر -->
      <div style="background: #112238; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
        <h3 style="margin-top: 0; color: white;">إضافة صورة للسلايدر</h3>
        <div style="margin-bottom: 8px;">
          <label for="slider-upload" style="display: block; color: #a0c4ff; font-size: 12px; margin-bottom: 5px;">الصورة (مطلوبة):</label>
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

      <!-- إدارة روابط الأقسام القديمة -->
      <div style="background: #112238; padding: 15px; border-radius: 10px; margin-bottom: 20px;">
        <h3 style="margin-top: 0; color: white;">روابط الأقسام الأربعة (القديمة)</h3>
        <p style="font-size: 12px; color: #a0c4ff;">ملاحظة: هذه الروابط لم تعد مستخدمة إذا كانت الأقسام الديناميكية مفعّلة.</p>
        <input type="text" id="link-telegram" value="${store.telegram || ''}" placeholder="رابط قسم تيليجرام" style="width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 5px; border: none;">
        <input type="text" id="link-nft" value="${store.nft || ''}" placeholder="رابط قسم المقتنيات" style="width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 5px; border: none;">
        <input type="text" id="link-social" value="${store.social || ''}" placeholder="رابط قسم التواصل" style="width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 5px; border: none;">
        <input type="text" id="link-games" value="${store.games || ''}" placeholder="رابط قسم الألعاب" style="width: 100%; padding: 10px; margin-bottom: 8px; border-radius: 5px; border: none;">
        <button onclick="saveMenuLinks()" style="background: #8A2BE2; color: white; padding: 12px; width: 100%; border: none; border-radius: 5px; cursor: pointer; font-weight: bold;">حفظ الروابط</button>
      </div>
    ` : ''}

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

  currentBase64Image = "";
  currentSliderImage = "";
}

/* ====== دوال المنتجات (مبقاة كما هي) ====== */
async function addProduct() {
  const name = document.getElementById('new-prod-name').value;
  const description = document.getElementById('new-prod-desc').value;
  const prices = {
    usd: parseFloat(document.getElementById('price-usd').value) || 0,
    ton: parseFloat(document.getElementById('price-ton').value) || 0,
    stars: parseFloat(document.getElementById('price-stars').value) || 0,
    sar: parseFloat(document.getElementById('price-sar').value) || 0
  };
  if(!name) return alert('أدخل اسم المنتج');
  const res = await apiCall('/api/products/add', { name, description, image: currentBase64Image, prices });
  if(res.ok) { tg.showAlert('تمت الإضافة ✅'); openAdminPanel(); } else { tg.showAlert(res.error); }
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
    sar: parseFloat(document.getElementById('price-sar').value) || 0
  };
  const res = await apiCall('/api/products/edit', { productId: id, name, description, image: currentBase64Image, prices });
  if(res.ok) { tg.showAlert('تم التعديل ✅'); openAdminPanel(); } else { tg.showAlert(res.error); }
}

async function deleteProduct(id) {
  if(!confirm('حذف هذا المنتج؟')) return;
  const res = await apiCall('/api/products/delete', { productId: id });
  if(res.ok) openAdminPanel(); else alert(res.error);
}

async function promoteUser() {
  const targetId = document.getElementById('target-id').value;
  const newRole = document.getElementById('target-role').value;
  if(!targetId) return alert('أدخل الآي دي');
  const res = await apiCall('/api/users/promote', { targetId, newRole });
  if(res.ok) { tg.showAlert('تمت الترقية ✅'); openAdminPanel(); } else { tg.showAlert(res.error); }
}

async function updateRole(targetId, newRole) {
  if(!confirm(`تعديل الرتبة؟`)) return;
  const res = await apiCall('/api/users/update-role', { targetId, newRole });
  if(res.ok) { tg.showAlert('تم التحديث ✅'); openAdminPanel(); } else { tg.showAlert(res.error); }
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
/* ============================================================
   ✅✅✅  نظام رابط المنتج + صفحة المتجر + صفحة المنتج  ✅✅✅
   ============================================================ */

let currentShopProducts = [];

/* فتح صفحة المتجر */
async function openShop() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-shop').classList.add('active');
  document.getElementById('page-nav').classList.add('active');

  const content = document.getElementById('shop-content');
  content.innerHTML = '<div class="shop-empty">جاري التحميل...</div>';

  const data = await apiCall('/api/products');
  if (!data.ok || !data.products || data.products.length === 0) {
    content.innerHTML = '<div class="shop-empty">لا توجد منتجات بعد 🛍️</div>';
    return;
  }

  currentShopProducts = data.products;
  renderShopProducts(data.products);
}

function renderShopProducts(products) {
  const content = document.getElementById('shop-content');
  const sorted = [...products].sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da; // الأحدث أولاً
  });

  const grid = document.createElement('div');
  grid.className = 'shop-grid';

  sorted.forEach(p => {
    const card = document.createElement('div');
    card.className = 'shop-card';
    card.onclick = () => openProduct(p.id);

    const pricesStr = formatPrices(p.prices);

    card.innerHTML = `
      ${p.image
        ? `<img src="${p.image}" class="card-img" alt="">`
        : `<div class="card-img-placeholder">📦</div>`}
      <div class="card-body">
        <strong>${p.name || 'بدون اسم'}</strong>
        <small>${p.description || ''}</small>
        <div class="card-price">${pricesStr || '—'}</div>
      </div>
    `;
    grid.appendChild(card);
  });

  content.innerHTML = '';
  content.appendChild(grid);
}

function formatPrices(prices) {
  if (!prices) return '';
  const parts = [];
  if (prices.usd > 0) parts.push(`$${prices.usd}`);
  if (prices.ton > 0) parts.push(`💎 ${prices.ton}`);
  if (prices.stars > 0) parts.push(`⭐ ${prices.stars}`);
  if (prices.sar > 0) parts.push(`🇸🇦 ${prices.sar}`);
  return parts.join(' | ');
}

/* فتح صفحة منتج مفرد */
async function openProduct(productId) {
  window.location.hash = '#product-' + productId;
  await loadProductPage(productId);
}

async function loadProductPage(productId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-product').classList.add('active');
  document.getElementById('page-nav').classList.add('active');

  const content = document.getElementById('product-content');
  content.innerHTML = '<div class="shop-empty">جاري التحميل...</div>';

    // جرّب تجيبه من الكاش أولاً
  let product = currentShopProducts.find(p => p.id === productId);

  if (!product) {
    // اطلبه من السيرفر
    const res = await apiCall('/api/products/get', { productId });
    if (res.ok && res.product) product = res.product;
  }

  if (!product) {
    content.innerHTML = '<div class="shop-empty">❌ المنتج غير موجود</div>';
    return;
  }

  const pricesStr = formatPrices(product.prices);
  const shareLink = '#' + (product.slug || 'product-' + product.id);

  content.innerHTML = `
    <div class="product-hero">
      ${product.image
        ? `<img src="${product.image}" alt="">`
        : `<div class="hero-placeholder">📦</div>`}
    </div>

    <div class="product-info">
      <h2>${product.name || 'بدون اسم'}</h2>
      ${product.description ? `<p>${product.description}</p>` : ''}
      ${pricesStr
        ? `<div class="product-prices">
             ${product.prices.usd > 0 ? `<span class="price-chip">دولار: <strong>$${product.prices.usd}</strong></span>` : ''}
             ${product.prices.ton > 0 ? `<span class="price-chip">TON: <strong>${product.prices.ton}</strong></span>` : ''}
             ${product.prices.stars > 0 ? `<span class="price-chip">نجوم: <strong>${product.prices.stars}</strong></span>` : ''}
             ${product.prices.sar > 0 ? `<span class="price-chip">ريال: <strong>${product.prices.sar}</strong></span>` : ''}
           </div>`
        : ''}
      <button class="product-buy-btn" onclick="buyProduct('${product.id}')">🛒 اطلب الآن</button>
      <button class="product-share-btn" onclick="copyProductLink('${product.id}')">🔗 نسخ رابط المنتج</button>
    </div>
  `;
}

/* زر الشراء (يفتح محادثة البوت أو ينسخ الرابط) */
function buyProduct(productId) {
  const product = currentShopProducts.find(p => p.id === productId);
  const link = product?.link || ('#product-' + productId);
  const shareUrl = window.location.origin + window.location.pathname + link;

  if (tg && tg.showPopup) {
    tg.showPopup({
      title: 'اطلب المنتج',
      message: 'هل تريد نسخ رابط المنتج للمشاركة أو إرساله للمتجر؟',
      buttons: [
        { id: 'copy', type: 'default', text: '📋 نسخ الرابط' },
        { id: 'cancel', type: 'cancel', text: 'إلغاء' }
      ]
    }, (btnId) => {
      if (btnId === 'copy') {
        navigator.clipboard.writeText(shareUrl).then(() => {
          tg.showAlert('تم نسخ الرابط ✅');
        }).catch(() => {
          tg.showAlert('تعذر النسخ، الرابط: ' + shareUrl);
        });
      }
    });
  } else {
    navigator.clipboard.writeText(shareUrl).then(() => alert('تم نسخ الرابط ✅'));
  }
}

/* نسخ رابط المنتج */
function copyProductLink(productId) {
  const product = currentShopProducts.find(p => p.id === productId);
  const link = product?.link || ('#product-' + productId);
  const shareUrl = window.location.origin + window.location.pathname + link;

  navigator.clipboard.writeText(shareUrl).then(() => {
    if (tg && tg.showAlert) tg.showAlert('تم نسخ الرابط ✅');
    else alert('تم نسخ الرابط ✅');
  }).catch(() => {
    if (tg && tg.showAlert) tg.showAlert('الرابط: ' + shareUrl);
    else alert('الرابط: ' + shareUrl);
  });
}

/* الرجوع للرئيسية */
function goHome() {
  window.location.hash = '';
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-home').classList.add('active');
  document.getElementById('page-nav').classList.add('active');
}

/* ============================================================
   ✅ مستمع تغيير الـ hash (يفتح المنتج من أي رابط #product-xxx)
   ============================================================ */
async function handleHashChange() {
  const hash = window.location.hash.replace('#', '');
  if (!hash) return;

  if (hash.startsWith('product-')) {
    const productId = hash.replace('product-', '');
    // تأكد من تحميل المنتجات أولاً
    if (currentShopProducts.length === 0) {
      const data = await apiCall('/api/products');
      if (data.ok && data.products) currentShopProducts = data.products;
    }
    await loadProductPage(productId);
  }
}

// استمع لتغيّر الـ hash
window.addEventListener('hashchange', handleHashChange);

// عند التحميل الأول، إذا فيه hash، افتح المنتج
setTimeout(() => {
  if (window.location.hash) handleHashChange();
}, 1500);

/* ============================================================
   ✅ زر المتجر بدل الجرس + تحديث openAdminPanel لعرض رابط المنتج
   ============================================================ */

// استبدال أيقونة bell بـ shop في الشريط السفلي
// (عدّل الدالة initNav1 — استبدل السطر tabs فقط)
//
// في initNav1، غيّر:
//   let tabs = [{key:'home'},{key:'heart'},{key:'cart'},{key:'headset'},{key:'bell'}];
// إلى:
//   let tabs = [{key:'home'},{key:'heart'},{key:'cart'},{key:'headset'},{key:'shop'}];
//
// وأضف في switch:
//   else if (currentTabs[i].key === 'shop') { openShop(); }

/* إعادة تعريف initNav1 مع زر المتجر */
const originalInitNav1 = initNav1;
initNav1 = function() {
  const nav1 = document.getElementById('nav1');
  nav1.innerHTML = '';
  let tabs = [{key:'home'},{key:'heart'},{key:'cart'},{key:'headset'},{key:'shop'}];
  if (userRole !== 'user') tabs.push({key:'admin'});

  const indicator = document.createElement('span'); indicator.className = 'active-indicator';
  const spotlight = document.createElement('span'); spotlight.className = 'spotlight';

  // أيقونة المتجر
  const shopIcon = '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>';
  if (!icons.shop) icons.shop = shopIcon;

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

    const key = currentTabs[i].key;
    if (key === 'admin') {
      openAdminPanel();
    } else if (key === 'shop') {
      openShop();
    } else if (key === 'home') {
      window.location.hash = '';
      document.getElementById('page-admin').classList.remove('active');
      document.getElementById('page-empty').classList.remove('active');
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-home').classList.add('active');
      document.getElementById('page-nav').classList.add('active');
    } else {
      // heart / cart / headset — مؤقتاً الرئيسية
      document.getElementById('page-admin').classList.remove('active');
      document.getElementById('page-empty').classList.remove('active');
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById('page-home').classList.add('active');
      document.getElementById('page-nav').classList.add('active');
    }
  }
  setTimeout(() => setNav1(0, tabs), 50);
  nav1Initialized = true;
};

// إعادة تفعيل الشريط بعد الاستبدال
if (nav1Initialized) initNav1();

/* ============================================================
   ✅ إضافة عرض رابط المنتج في لوحة التحكم
   ============================================================ */
// في openAdminPanel، بعد إضافة منتج بنجاح، نعرض الرابط.
// عدّل دالة addProduct لتكون:

const originalAddProduct = addProduct;
addProduct = async function() {
  const name = document.getElementById('new-prod-name').value;
  const description = document.getElementById('new-prod-desc').value;
  const prices = {
    usd: parseFloat(document.getElementById('price-usd').value) || 0,
    ton: parseFloat(document.getElementById('price-ton').value) || 0,
    stars: parseFloat(document.getElementById('price-stars').value) || 0,
    sar: parseFloat(document.getElementById('price-sar').value) || 0
  };
  if (!name) return alert('أدخل اسم المنتج');

  const res = await apiCall('/api/products/add', {
    name, description, image: currentBase64Image, prices
  });

  if (res.ok) {
    // إظهار الرابط
    const link = res.link || ('#product-' + res.product.id);
    const fullUrl = window.location.origin + window.location.pathname + link;

    if (tg && tg.showAlert) {
      tg.showAlert('✅ تمت الإضافة!\n\nرابط المنتج:\n' + fullUrl);
    } else {
      alert('✅ تمت الإضافة!\n\nرابط المنتج:\n' + fullUrl);
    }

    // نسخ الرابط تلقائياً
    navigator.clipboard.writeText(fullUrl).catch(() => {});

    openAdminPanel();
  } else {
    tg.showAlert(res.error || 'فشل الإضافة');
  }
};

// تحديث قائمة المنتجات في لوحة التحكم لتظهر الرابط مع كل منتج
// (هذا يتم داخل openAdminPanel — استبدل قسم productsHTML)

const originalOpenAdminPanel = openAdminPanel;
openAdminPanel = async function() {
  // استدعِ الأصلية
  await originalOpenAdminPanel();

  // بعد الرسم، أضف روابط المنتجات لكل منتج
  const products = await apiCall('/api/products');
  if (!products.ok || !products.products) return;

  // ابحث عن كل بطاقة منتج في لوحة التحكم وأضف الرابط
  // (هذا سيتم عبر إعادة رسم بطاقات المنتجات بالروابط)
  // نستخدم طريقة أسهل: نضيف زر "نسخ الرابط" بجانب كل منتج
  // لكن هذا يتطلب تعديل productsHTML — نفعله في الإصدار القادم

  // حالياً: فقط تأكد أن منتجات المتجر محدّثة
  currentShopProducts = products.products;
};

/* ============================================================
   ✅ إضافة زر "نسخ رابط المنتج" لكل منتج في لوحة التحكم
   ============================================================ */
// هذه الدالة تُستدعى من بطاقات المنتجات في لوحة التحكم
function copyProductLinkFromAdmin(productId) {
  const product = currentShopProducts.find(p => p.id === productId);
  const link = product?.link || ('#product-' + productId);
  const fullUrl = window.location.origin + window.location.pathname + link;

  navigator.clipboard.writeText(fullUrl).then(() => {
    if (tg && tg.showAlert) tg.showAlert('تم نسخ رابط المنتج ✅\n\n' + fullUrl);
    else alert('تم نسخ الرابط:\n' + fullUrl);
  }).catch(() => {
    if (tg && tg.showAlert) tg.showAlert('الرابط:\n' + fullUrl);
    else alert('الرابط:\n' + fullUrl);
  });
}
