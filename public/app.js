/* ============================================================
   DAYO STORE — app.js (النسخة النهائية)
   ============================================================ */
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }

let userRole = 'user';
let userInfo = null;
let nav1Initialized = false;
let initDataGlobal = "";
let currentBase64Image = "";
let currentSliderImage = "";
let heroSliderInterval = null;
let currentHeroSlideIndex = 0;
let storeMenuLinks = {};

let dynamicSections = [];
let editingSectionId = null;
let sectionImageBuffer = "";
let sectionItemsBuffer = [];

let currentCategories = [];
let currentBadges = [];
let currentShopProducts = [];
let shopState = { search: '', category: 'all', sort: 'newest' };

let quickIcons = [];
let heroButtonData = { text: 'تسوق الآن', link: '#shop', color: '#4A90E2' };
let realStats = { totalUsers: 0, onlineUsers: 0, totalProducts: 0, totalSold: 0 };


/* ===== إعدادات المظهر: داكن / فاتح ===== */
function applyTheme(theme, persist = true) {
  const selected = theme === 'light' ? 'light' : 'dark';
  document.body.dataset.theme = selected;
  document.documentElement.style.colorScheme = selected;
  const button = document.getElementById('theme-toggle');
  if (button) {
    button.textContent = selected === 'dark' ? '☀️' : '🌙';
    button.setAttribute('aria-label', selected === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن');
    button.title = selected === 'dark' ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن';
  }
  if (persist) {
    try { localStorage.setItem('dayo-theme', selected); } catch (_) {}
  }
  if (tg?.setHeaderColor) {
    try { tg.setHeaderColor(selected === 'dark' ? '#080e1d' : '#f3f6fc'); } catch (_) {}
  }
  if (tg?.setBackgroundColor) {
    try { tg.setBackgroundColor(selected === 'dark' ? '#050914' : '#f3f6fc'); } catch (_) {}
  }
}

function toggleTheme() {
  const next = document.body.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(next, true);
}

(function initTheme() {
  let saved = 'dark';
  try { saved = localStorage.getItem('dayo-theme') || 'dark'; } catch (_) {}
  applyTheme(saved, false);
})();

const SECTION_TYPES = {
  grid:     { label: 'شبكة أيقونات (4 أزرار)', color: '#4A90E2' },
  text:     { label: 'قسم نصي',                 color: '#8A2BE2' },
  image:    { label: 'قسم صورة',                color: '#E24A90' },
  products: { label: 'قسم منتجات',              color: '#4AE2A0' },
  banner:   { label: 'بانر دعائي',              color: '#f39c12' }
};

// حماية المخرجات القادمة من قاعدة البيانات قبل إدراجها داخل HTML.
function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>\"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function safeWebURL(value, allowImageData = false) {
  const raw = String(value ?? '').trim();
  if (allowImageData && /^data:image\/(png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]+$/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) {
    try { const url = new URL(raw); if (url.protocol === 'https:' || url.protocol === 'http:') return url.href; } catch (_) {}
  }
  if (allowImageData && raw.startsWith('/') && !raw.startsWith('//')) {
    try { return new URL(raw, window.location.origin).href; } catch (_) {}
  }
  return '';
}

function safeImageURL(value) {
  return safeWebURL(value, true);
}

function safeColor(value, fallback = '#4A90E2') {
  const color = String(value ?? '').trim();
  return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\))$/i.test(color) ? color : fallback;
}

function encodedArg(value) {
  return encodeURIComponent(String(value ?? '')).replace(/[!'()*]/g, ch => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
}

function showMessage(message) {
  if (tg?.showAlert) tg.showAlert(String(message));
  else window.alert(String(message));
}

function safeRemoveActive(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}
function safeAddActive(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

safeRemoveActive('page-nav');
safeRemoveActive('page-admin');
safeRemoveActive('page-empty');
safeAddActive('page-truck');

async function apiCall(endpoint, body = {}) {
  if (typeof endpoint !== 'string' || !endpoint.startsWith('/api/')) {
    throw new Error('مسار API غير صالح');
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ ...body, initData: initDataGlobal }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!payload || typeof payload !== 'object') throw new Error('استجابة غير صالحة من الخادم');
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('انتهت مهلة الاتصال بالخادم');
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchUserRole() {
  if (!tg?.initData) {
    console.warn('يجب فتح المتجر من داخل Telegram Mini App.');
    return;
  }
  initDataGlobal = tg.initData;
  const firstName = tg.initDataUnsafe?.user?.first_name || '';
  const welcomeEl = document.getElementById('welcome-name');
  if (welcomeEl && firstName) welcomeEl.textContent = `أهلاً ${firstName} 👋`;

  try {
    const data = await apiCall('/api/me');
    if (!data?.ok || !data.user) throw new Error(data?.error || 'تعذر التحقق من الحساب');
    userRole = ['owner', 'admin', 'moderator', 'user'].includes(data.user.role) ? data.user.role : 'user';
    userInfo = data.user;
    console.info('DAYO account verified:', { id: data.user.id, role: data.user.role });
    if (nav1Initialized) initNav1();
    await Promise.allSettled([
      loadStoreData(), loadSlider(), loadDynamicSections(), loadCategories(), loadBadges(),
      loadQuickIcons(), loadRealStats()
    ]);
    await loadHomeProducts();
  } catch (err) {
    console.error('فشل التحقق من المستخدم:', err);
    userRole = 'user';
    userInfo = null;
    showMessage(err.message || 'تعذر الاتصال بالخادم. حاول مرة أخرى.');
  }
}

/* ====== أنيميشن الشاحنة ====== */
document.querySelectorAll('.truck-button').forEach(button => {
  button.addEventListener('click', e => {
    e.preventDefault();
    if (typeof gsap === 'undefined') {
      safeRemoveActive('page-truck');
      safeAddActive('page-home');
      safeAddActive('page-nav');
      if (!nav1Initialized) initNav1();
      return;
    }
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
              safeRemoveActive('page-truck');
              safeAddActive('page-home');
              safeAddActive('page-nav');
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

/* ====== أيقونات ====== */
const icons = {
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
  cart:'<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  headset:'<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>',
  shop:'<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  admin:'<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm1-13h-2v6h2zm0 8h-2v2h2z"/>'
};
const svg=(name,size=24,stroke=2)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;

/* ====== معالجة الروابط (بدون تغيير hash) ====== */
function extractHash(link) {
  if (!link) return '';
  const idx = link.indexOf('#');
  if (idx !== -1) return link.substring(idx);
  return '';
}

function handleInternalLink(link) {
  if (!link) return;
  const value = String(link).trim();
  const hash = extractHash(value);
  if (hash === '#shop') { openShop(); return; }
  if (hash.startsWith('#category-')) { openShop(hash.slice('#category-'.length)); return; }
  if (hash.startsWith('#category/')) { openShop(hash.slice('#category/'.length)); return; }
  if (hash === '#home') { goHome(); return; }
  if (hash.startsWith('#product-')) {
    const productId = hash.slice('#product-'.length);
    if (productId) openProduct(productId);
    return;
  }
  const external = safeWebURL(value);
  if (external) {
    window.open(external, '_blank', 'noopener,noreferrer');
    return;
  }
  const el = document.getElementById(value);
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

/* ✅ نسخ رابط أي صفحة */
function copyPageLink(hash) {
  const internalLink = hash || '#home';
  navigator.clipboard.writeText(internalLink).then(() => {
    if (tg && tg.showAlert) tg.showAlert('تم نسخ الرابط الداخلي ✅\n\n' + internalLink + '\n\n(يعمل داخل التطبيق فقط)');
    else alert('الرابط:\n' + internalLink);
  }).catch(() => {
    if (tg && tg.showAlert) tg.showAlert('الرابط: ' + internalLink);
    else alert('الرابط: ' + internalLink);
  });
}

function copyCurrentProductLink() {
  const hash = window.location.hash;
  if (hash.startsWith('#product-')) copyPageLink(hash);
}

/* ====== الشريط السفلي (بدون تغيير hash) ====== */
function initNav1() {
  const nav1 = document.getElementById('nav1');
  if (!nav1) return;
  nav1.innerHTML = '';
  let tabs = [{key:'home'},{key:'heart'},{key:'cart'},{key:'headset'},{key:'shop'}];
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

    const key = currentTabs[i].key;
    if (key === 'home') {
      goHome();
    } else if (key === 'shop') {
      openShop();
    } else if (key === 'admin') {
      openAdminPanel();
    } else if (key === 'heart') {
      openFavorites();
    } else if (key === 'cart') {
      openCart();
    } else if (key === 'headset') {
      openSupport();
    }
  }
  setTimeout(() => setNav1(0, tabs), 50);
  nav1Initialized = true;
}

/* ====== بيانات المتجر ====== */
async function loadStoreData() {
  const data = await apiCall('/api/store');
  if (data.ok && data.store) {
    const nameEl = document.getElementById('store-name');
    if (nameEl) nameEl.textContent = data.store.name;
    if (data.store.logo) {
      const logoEl = document.getElementById('store-logo');
      if (logoEl) { logoEl.style.backgroundImage = safeImageURL(data.store.logo) ? `url("${safeImageURL(data.store.logo)}")` : 'none'; logoEl.innerText = ''; }
    }
    storeMenuLinks = data.store.menuLinks || {};
    if (data.store.heroButton) {
      heroButtonData = data.store.heroButton;
      updateHeroButton();
    }
  }
}

function updateHeroButton() {
  const btn = document.getElementById('hero-cta-btn');
  if (!btn) return;
  btn.textContent = '🛍️ ' + (heroButtonData.text || 'تسوق الآن');
  btn.style.background = `linear-gradient(90deg, ${safeColor(heroButtonData.color)}, #8A2BE2)`;
  btn.onclick = () => handleInternalLink(heroButtonData.link || '#shop');
}

function editCover() {
  const el = document.getElementById('cover-upload');
  if (el) el.click();
}
function editLogo() {
  const el = document.getElementById('logo-upload');
  if (el) el.click();
}

async function handleCoverUpload(input) {
  const file = input.files[0]; if (!file) return;
  if (!file.type?.startsWith('image/') || file.size > 8 * 1024 * 1024) return showMessage('اختر صورة صالحة بحجم أقل من 8MB.');
  try {
    const base64 = await compressImage(file, 800, 400);
    const res = await apiCall('/api/store/update', { cover: base64 });
    if (res.ok) { tg.showAlert('تم تحديث الخلفية ✅'); loadStoreData(); }
    else tg.showAlert(res.error || 'فشل');
  } catch (err) { alert('حدث خطأ'); }
}

async function handleLogoUpload(input) {
  const file = input.files[0]; if (!file) return;
  if (!file.type?.startsWith('image/') || file.size > 8 * 1024 * 1024) return showMessage('اختر صورة صالحة بحجم أقل من 8MB.');
  try {
    const base64 = await compressImage(file, 400, 400);
    const res = await apiCall('/api/store/update', { logo: base64 });
    if (res.ok) { tg.showAlert('تم تحديث اللوجو ✅'); loadStoreData(); }
    else tg.showAlert(res.error || 'فشل');
  } catch (err) { alert('حدث خطأ'); }
}

/* ====== الإحصائيات الحقيقية ====== */
async function loadRealStats() {
  const res = await apiCall('/api/stats');
  if (res.ok && res.stats) {
    realStats = res.stats;
    const usersEl = document.getElementById('stat-users');
    const onlineEl = document.getElementById('stat-online');
    const productsEl = document.getElementById('stat-products');
    if (usersEl) usersEl.textContent = (realStats.totalUsers || 0).toLocaleString();
    if (onlineEl) onlineEl.textContent = (realStats.onlineUsers || 0).toLocaleString();
    if (productsEl) productsEl.textContent = (realStats.totalProducts || 0).toLocaleString();
  }
}

/* ====== البانر الكبير ====== */
async function loadSlider() {
  const data = await apiCall('/api/slider');
  if (data.ok && data.slides) renderHeroSlider(data.slides);
}

function renderHeroSlider(slides) {
  const track = document.getElementById('hero-slider-track');
  const dotsContainer = document.getElementById('hero-slider-dots');
  if (!track || !dotsContainer) return;
  track.replaceChildren();
  dotsContainer.replaceChildren();
  if (heroSliderInterval) clearInterval(heroSliderInterval);
  if (!Array.isArray(slides) || slides.length === 0) {
    track.textContent = 'لا توجد صور.';
    return;
  }
  currentHeroSlideIndex = 0;
  slides.forEach((slide, i) => {
    const slideDiv = document.createElement('div');
    slideDiv.className = 'hero-slide';
    const imageURL = safeImageURL(slide.image);
    if (imageURL) slideDiv.style.backgroundImage = `url("${imageURL}")`;
    const content = document.createElement('div');
    content.className = 'hero-slide-content';
    const badge = document.createElement('span');
    badge.className = 'slide-badge';
    badge.textContent = '👑 عروض خاصة';
    content.appendChild(badge);
    if (slide.title) {
      const title = document.createElement('h3');
      title.className = 'slide-title';
      title.textContent = slide.title;
      content.appendChild(title);
    }
    if (slide.btnText && slide.btnLink) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slide-btn';
      button.textContent = slide.btnText;
      button.addEventListener('click', () => handleInternalLink(slide.btnLink));
      content.appendChild(button);
    }
    slideDiv.appendChild(content);
    track.appendChild(slideDiv);
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = `hero-dot ${i === 0 ? 'active' : ''}`;
    dot.setAttribute('aria-label', `الشريحة ${i + 1}`);
    dot.addEventListener('click', () => goToHeroSlide(i, slides.length));
    dotsContainer.appendChild(dot);
  });
  startHeroSliderTimer(slides.length);
}

function goToHeroSlide(index, totalSlides) {
  const track = document.getElementById('hero-slider-track');
  const dots = document.querySelectorAll('.hero-dot');
  if (!track) return;
  if (index >= totalSlides) index = 0;
  if (index < 0) index = totalSlides - 1;
  currentHeroSlideIndex = index;
  track.style.transform = `translateX(${index * 100}%)`;
  dots.forEach((dot, i) => dot.classList.toggle('active', i === index));
}

function startHeroSliderTimer(totalSlides) {
  if (heroSliderInterval) clearInterval(heroSliderInterval);
  heroSliderInterval = setInterval(() => {
    goToHeroSlide(currentHeroSlideIndex + 1, totalSlides);
  }, 4000);
}

async function handleSliderImageUpload(input) {
  const file = input.files[0]; if (!file) return;
  if (!file.type?.startsWith('image/') || file.size > 8 * 1024 * 1024) return showMessage('اختر صورة صالحة بحجم أقل من 8MB.');
  try {
    const base64 = await compressImage(file, 800, 400);
    currentSliderImage = base64;
    const el = document.getElementById('slider-preview');
    if (el) { el.style.backgroundImage = `url('${base64}')`; el.innerText = ''; }
  } catch (err) { alert('حدث خطأ'); }
}

async function addSlide() {
  const title = document.getElementById('slide-title')?.value || '';
  const btnText = document.getElementById('slide-btn-text')?.value || '';
  const btnLink = document.getElementById('slide-btn-link')?.value || '';
  if (!currentSliderImage) return alert('اختر صورة أولاً');
  const res = await apiCall('/api/slider/add', { image: currentSliderImage, title, btnText, btnLink });
  if (res.ok) { tg.showAlert('تمت الإضافة ✅'); loadSlider(); openAdminPanel(); }
  else tg.showAlert(res.error);
}

async function deleteSlide(id) {
  try { id = decodeURIComponent(id); } catch (_) { return; }
  if(!confirm('حذف الصورة؟')) return;
  const res = await apiCall('/api/slider/delete', { slideId: id });
  if(res.ok) { loadSlider(); openAdminPanel(); } else alert(res.error);
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
        let width = img.width, height = img.height;
        if (width > height) { if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; } }
        else { if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; } }
        width = Math.max(1, Math.round(width)); height = Math.max(1, Math.round(height));
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
  const file = input.files[0]; if (!file) return;
  if (!file.type?.startsWith('image/') || file.size > 8 * 1024 * 1024) return showMessage('اختر صورة صالحة بحجم أقل من 8MB.');
  try {
    const base64 = await compressImage(file);
    currentBase64Image = base64;
    const el = document.getElementById(previewId);
    if (el) { el.style.backgroundImage = `url('${base64}')`; el.innerText = ''; }
  } catch (err) { alert('حدث خطأ'); }
}

/* ====== الأيقونات المربعة ====== */
async function loadQuickIcons() {
  const res = await apiCall('/api/quick-icons');
  if (res.ok && Array.isArray(res.icons)) {
    quickIcons = res.icons;
    renderQuickIcons();
  }
}

function renderQuickIcons() {
  const container = document.getElementById('quick-icons-container');
  if (!container) return;
  container.replaceChildren();
  quickIcons.forEach(icon => {
    const div = document.createElement('div');
    div.className = 'quick-icon';
    div.addEventListener('click', () => handleInternalLink(icon.link));
    const iconBox = document.createElement('div');
    iconBox.className = 'quick-icon-img';
    iconBox.style.color = safeColor(icon.color);
    const imageURL = safeImageURL(icon.image);
    if (imageURL) { const img = document.createElement('img'); img.src = imageURL; img.alt = ''; iconBox.appendChild(img); }
    else { const span = document.createElement('span'); span.textContent = icon.icon || '📦'; iconBox.appendChild(span); }
    const title = document.createElement('div'); title.className = 'quick-icon-title'; title.textContent = icon.title || 'عنصر';
    div.append(iconBox, title); container.appendChild(div);
  });
}

/* ====== الأقسام الديناميكية ====== */
async function loadDynamicSections() {
  const data = await apiCall('/api/sections');
  if (data.ok && Array.isArray(data.sections)) {
    dynamicSections = data.sections;
    renderDynamicSections();
  }
}

function renderDynamicSections() {
  const container = document.getElementById('dynamic-sections-container');
  if (!container) return;
  container.replaceChildren();
  const visible = dynamicSections.filter(s => s.visible !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
  if (visible.length === 0) {
    const empty = document.createElement('p');
    empty.style.cssText = 'text-align:center;color:#a0c4ff;font-size:13px;padding:20px;';
    empty.textContent = 'لا توجد أقسام.';
    container.appendChild(empty);
    return;
  }
  visible.forEach(sec => {
    const el = document.createElement('div');
    el.className = 'dynamic-section';
    el.id = `section-${String(sec.id).replace(/[^a-zA-Z0-9_-]/g, '')}`;
    if (sec.title) {
      const heading = document.createElement('h2');
      heading.textContent = sec.title;
      el.appendChild(heading);
    }
    if (['text', 'image', 'banner'].includes(sec.type)) {
      const imageURL = safeImageURL(sec.image);
      if (imageURL) {
        const img = document.createElement('img');
        img.src = imageURL;
        img.alt = sec.title || 'صورة القسم';
        if (sec.type === 'banner') img.style.cssText = 'height:140px;object-fit:cover;';
        el.appendChild(img);
      }
      if (sec.content) {
        const paragraph = document.createElement('p');
        paragraph.textContent = sec.content;
        el.appendChild(paragraph);
      }
      if (sec.buttonText && sec.buttonLink) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'section-btn';
        button.textContent = sec.buttonText;
        button.addEventListener('click', () => handleInternalLink(sec.buttonLink));
        el.appendChild(button);
      }
    } else if (sec.type === 'grid') {
      const grid = document.createElement('div');
      grid.className = 'grid-menu';
      (Array.isArray(sec.items) ? sec.items : []).forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'grid-item';
        itemDiv.addEventListener('click', () => handleInternalLink(item.link));
        const iconBox = document.createElement('div');
        iconBox.className = 'grid-icon';
        iconBox.style.color = safeColor(item.color);
        const imageURL = safeImageURL(item.image);
        if (imageURL) {
          const img = document.createElement('img'); img.src = imageURL; img.alt = ''; iconBox.appendChild(img);
        } else {
          const span = document.createElement('span'); span.textContent = item.icon || '📦'; iconBox.appendChild(span);
        }
        const title = document.createElement('div'); title.className = 'grid-title'; title.textContent = item.title || 'عنصر';
        itemDiv.append(iconBox, title); grid.appendChild(itemDiv);
      });
      el.appendChild(grid);
    } else if (sec.type === 'products') {
      const grid = document.createElement('div');
      grid.className = 'dynamic-products';
      (Array.isArray(sec.items) ? sec.items : []).forEach(item => {
        const card = document.createElement('div'); card.className = 'prod-card';
        if (item.link) card.addEventListener('click', () => handleInternalLink(item.link));
        const imageURL = safeImageURL(item.image);
        if (imageURL) { const img = document.createElement('img'); img.src = imageURL; img.alt = ''; card.appendChild(img); }
        const info = document.createElement('div'); info.className = 'info';
        const title = document.createElement('strong'); title.textContent = item.title || '';
        info.appendChild(title);
        if (item.description) { const desc = document.createElement('small'); desc.textContent = item.description; info.appendChild(desc); }
        if (item.price) { const price = document.createElement('div'); price.className = 'price'; price.textContent = item.price; info.appendChild(price); }
        card.appendChild(info); grid.appendChild(card);
      });
      el.appendChild(grid);
    }
    container.appendChild(el);
  });
}
/* ============================================================
   ✅ وصل حديثاً + الأكثر مبيعاً
   ============================================================ */
async function loadHomeProducts() {
  const res = await apiCall('/api/products');
  if (!res.ok || !Array.isArray(res.products)) return;
  currentShopProducts = res.products;

  const newProducts = [...res.products].sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da;
  }).slice(0, 6);
  renderHScrollProducts('new-products-scroll', newProducts);

  const popular = [...res.products].sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0)).slice(0, 6);
  renderHScrollProducts('popular-products-scroll', popular);
}

function renderHScrollProducts(containerId, products) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.replaceChildren();
  if (!Array.isArray(products) || products.length === 0) {
    const empty = document.createElement('p'); empty.style.cssText = 'color:#a0c4ff;font-size:12px;padding:10px;';
    empty.textContent = 'لا توجد منتجات.'; container.appendChild(empty); return;
  }
  products.forEach(p => {
    const card = document.createElement('div'); card.className = 'h-card'; card.addEventListener('click', () => openProduct(p.id));
    const wrap = document.createElement('div'); wrap.className = 'h-card-wrap';
    if (Number(p.discount) > 0) {
      const badge = document.createElement('div'); badge.className = 'card-badge discount';
      badge.style.cssText = 'position:absolute;top:6px;right:6px;';
      badge.textContent = `🔥 -${Math.min(100, Number(p.discount) || 0)}%`; wrap.appendChild(badge);
    } else {
      const badge = makeProductBadge(p.badge);
      if (badge) { badge.style.cssText += ';position:absolute;top:6px;right:6px;'; wrap.appendChild(badge); }
    }
    const imageURL = safeImageURL(p.image);
    if (imageURL) { const img = document.createElement('img'); img.src = imageURL; img.className = 'h-card-img'; img.alt = p.name || ''; wrap.appendChild(img); }
    else { const placeholder = document.createElement('div'); placeholder.className = 'h-card-img-placeholder'; placeholder.textContent = '📦'; wrap.appendChild(placeholder); }
    const body = document.createElement('div'); body.className = 'h-card-body';
    const title = document.createElement('strong'); title.textContent = p.name || 'بدون اسم';
    const price = document.createElement('div'); price.className = 'price'; price.textContent = formatPrices(p.prices) || '—';
    body.append(title, price); card.append(wrap, body); container.appendChild(card);
  });
}

/* ============================================================
   التصنيفات
   ============================================================ */
async function loadCategories() {
  const res = await apiCall('/api/categories');
  if (res.ok && Array.isArray(res.categories)) currentCategories = res.categories;
}

async function loadBadges() {
  const res = await apiCall('/api/badges');
  if (res.ok && Array.isArray(res.badges)) currentBadges = res.badges;
}

function getBadgeDefinition(id) {
  return currentBadges.find(b => b.id === id) || null;
}

function makeProductBadge(id, extraClass = '') {
  const config = getBadgeDefinition(id);
  if (!config) return null;
  const el = document.createElement('span');
  el.className = `card-badge ${extraClass}`.trim();
  el.style.backgroundColor = safeColor(config.color, '#4A90E2');
  el.style.color = safeColor(config.textColor, '#FFFFFF');
  el.textContent = `${config.icon || '🏷️'} ${config.name}`;
  return el;
}

function badgeOptionsHTML(selected = '') {
  return '<option value="">بدون شارة</option>' + currentBadges.map(b =>
    `<option value="${escapeHTML(b.id)}" ${b.id === selected ? 'selected' : ''}>${escapeHTML(b.icon || '🏷️')} ${escapeHTML(b.name)}</option>`
  ).join('');
}

function renderBadgesAdmin() {
  return `
    <hr style="border-color:#333;margin:20px 0;">
    <div class="admin-form">
      <h3 style="margin-top:0;color:white;">🏷️ إدارة شارات المنتجات</h3>
      <p style="color:#a0c4ff;font-size:12px;line-height:1.7;">أنشئ شارة باسم وأيقونة ولون، ثم اخترها عند إضافة المنتج أو تعديله.</p>
      <div id="badges-list"></div>
      <div style="display:grid;grid-template-columns:1fr 70px;gap:8px;margin-top:12px;">
        <input id="new-badge-name" type="text" maxlength="30" placeholder="اسم الشارة مثل الأكثر مبيعاً" style="margin:0;">
        <input id="new-badge-icon" type="text" maxlength="4" value="🏷️" aria-label="أيقونة الشارة" style="margin:0;text-align:center;">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;">
        <label style="color:#a0c4ff;font-size:12px;">لون الخلفية<input id="new-badge-color" type="color" value="#4A90E2" style="width:100%;height:38px;margin-top:4px;"></label>
        <label style="color:#a0c4ff;font-size:12px;">لون النص<input id="new-badge-text-color" type="color" value="#FFFFFF" style="width:100%;height:38px;margin-top:4px;"></label>
      </div>
      <button class="primary" onclick="addBadge()" style="width:100%;margin-top:10px;">➕ إنشاء الشارة</button>
    </div>`;
}

function renderBadgesList() {
  const list = document.getElementById('badges-list');
  if (!list) return;
  list.replaceChildren();
  currentBadges.forEach(b => {
    const row = document.createElement('div'); row.className = 'admin-section-card'; row.style.marginBottom = '7px';
    const info = document.createElement('div'); info.className = 'info';
    const preview = document.createElement('span'); preview.textContent = `${b.icon || '🏷️'} ${b.name}`;
    preview.style.cssText = `display:inline-block;padding:5px 10px;border-radius:9px;background:${safeColor(b.color)};color:${safeColor(b.textColor, '#fff')};font-size:12px;font-weight:700;`;
    const id = document.createElement('small'); id.textContent = `المعرّف: ${b.id}`;
    info.append(preview, id); row.appendChild(info);
    if (!['new', 'featured'].includes(b.id)) {
      const actions = document.createElement('div'); actions.className = 'actions';
      const del = document.createElement('button'); del.className = 'btn-delete'; del.textContent = 'حذف';
      del.addEventListener('click', () => deleteBadge(b.id)); actions.appendChild(del); row.appendChild(actions);
    }
    list.appendChild(row);
  });
}

async function addBadge() {
  const name = document.getElementById('new-badge-name')?.value.trim();
  const icon = document.getElementById('new-badge-icon')?.value.trim() || '🏷️';
  const color = document.getElementById('new-badge-color')?.value || '#4A90E2';
  const textColor = document.getElementById('new-badge-text-color')?.value || '#FFFFFF';
  if (!name) return showMessage('اكتب اسم الشارة أولاً.');
  const id = 'badge_' + Date.now().toString(36);
  const badges = [...currentBadges, { id, name, icon, color, textColor }];
  const res = await apiCall('/api/badges/save', { badges });
  if (!res.ok) return showMessage(res.error || 'تعذر إنشاء الشارة.');
  currentBadges = res.badges || badges;
  renderBadgesList();
  const badgeSelect = document.getElementById('new-prod-badge');
  if (badgeSelect) { const selected = badgeSelect.value; badgeSelect.innerHTML = badgeOptionsHTML(selected); }
  const nameInput = document.getElementById('new-badge-name'); if (nameInput) nameInput.value = '';
  showMessage('تم إنشاء الشارة بنجاح.');
}

async function deleteBadge(id) {
  if (!confirm('حذف الشارة؟ المنتجات التي تستخدمها ستظهر دون شارة.')) return;
  const badges = currentBadges.filter(b => b.id !== id);
  const res = await apiCall('/api/badges/save', { badges });
  if (!res.ok) return showMessage(res.error || 'تعذر حذف الشارة.');
  currentBadges = res.badges || badges;
  renderBadgesList();
  const badgeSelect = document.getElementById('new-prod-badge');
  if (badgeSelect) { const selected = badgeSelect.value; badgeSelect.innerHTML = badgeOptionsHTML(selected); }
}

function renderCategoriesAdmin() {
  return `
    <hr style="border-color:#333;margin:20px 0;">
    <div class="admin-form">
      <h3 style="margin-top:0;color:white;">🏷️ إدارة التصنيفات</h3>
      <div id="categories-list"></div>
      <div style="display:flex;gap:6px;margin-top:10px;">
        <input type="text" id="new-cat-name" placeholder="اسم التصنيف" style="flex:2;margin-bottom:0;">
        <input type="text" id="new-cat-icon" placeholder="📦" maxlength="2" style="flex:1;margin-bottom:0;text-align:center;">
        <button class="primary" onclick="addCategory()" style="flex:1;margin-top:0;">➕</button>
      </div>
    </div>
  `;
}

function renderCategoriesList() {
  const list = document.getElementById('categories-list');
  if (!list) return;
  list.replaceChildren();
  if (!Array.isArray(currentCategories) || currentCategories.length === 0) {
    const empty = document.createElement('p'); empty.style.cssText = 'color:#a0c4ff;font-size:12px;'; empty.textContent = 'لا توجد تصنيفات.'; list.appendChild(empty); return;
  }
  currentCategories.forEach(cat => {
    const row = document.createElement('div'); row.className = 'admin-section-card'; row.style.marginBottom = '6px';
    const info = document.createElement('div'); info.className = 'info';
    const strong = document.createElement('strong'); strong.textContent = `${cat.icon || '📦'} ${cat.name || ''}`;
    const small = document.createElement('small'); small.textContent = `الرابط الداخلي: ${cat.id === 'all' ? '#shop' : '#category-' + cat.id}`;
    info.append(strong, small); row.appendChild(info);
    const actions = document.createElement('div'); actions.className = 'actions';
    const copy = document.createElement('button'); copy.textContent = 'نسخ الرابط'; copy.style.cssText = 'background:#315d91;color:white;border:0;padding:7px 9px;border-radius:7px;font-size:11px;';
    copy.addEventListener('click', () => copyPageLink(cat.id === 'all' ? '#shop' : '#category-' + cat.id)); actions.appendChild(copy);
    if (cat.id !== 'all') {
      const del = document.createElement('button'); del.className = 'btn-delete'; del.textContent = 'حذف'; del.addEventListener('click', () => deleteCategory(cat.id));
      actions.appendChild(del);
    }
    row.appendChild(actions);
    list.appendChild(row);
  });
}

async function addCategory() {
  const name = document.getElementById('new-cat-name')?.value.trim();
  const icon = document.getElementById('new-cat-icon')?.value.trim() || '📦';
  if (!name) return alert('أدخل اسم التصنيف');
  const id = 'cat_' + Date.now();
  const newCats = [...currentCategories, { id, name, icon }];
  const res = await apiCall('/api/categories/save', { categories: newCats });
  if (res.ok) {
    currentCategories = newCats;
    document.getElementById('new-cat-name').value = '';
    document.getElementById('new-cat-icon').value = '';
    renderCategoriesList();
    tg.showAlert('تمت الإضافة ✅');
  } else tg.showAlert(res.error);
}

async function deleteCategory(id) {
  try { id = decodeURIComponent(id); } catch (_) { return; }
  if (!confirm('حذف هذا التصنيف؟')) return;
  const newCats = currentCategories.filter(c => c.id !== id);
  const res = await apiCall('/api/categories/save', { categories: newCats });
  if (res.ok) {
    currentCategories = newCats;
    renderCategoriesList();
    tg.showAlert('تم الحذف ✅');
  } else tg.showAlert(res.error);
}

/* ============================================================
   إدارة الأيقونات المربعة
   ============================================================ */
let editingQuickIconIndex = -1;
let quickIconsBuffer = [];

function renderQuickIconsAdmin() {
  return `
    <hr style="border-color:#333;margin:20px 0;">
    <div class="admin-form">
      <h3 style="margin-top:0;color:white;">🔲 إدارة الأيقونات المربعة</h3>
      <p style="color:#a0c4ff;font-size:12px;">الأيقونات التي تظهر في الصفحة الرئيسية.</p>
      <div id="quick-icons-admin-list"></div>
      <div style="margin-top:10px;">
        <input type="text" id="qi-title" placeholder="العنوان (مثال: تيليجرام)">
        <input type="text" id="qi-icon" placeholder="إيموجي (✈️)">
        <input type="text" id="qi-link" placeholder="الرابط (#shop أو https://...)">
        <input type="text" id="qi-color" placeholder="لون (#4A90E2)" value="#4A90E2">
        <input type="file" id="qi-image-file" accept="image/*" style="display:none;" onchange="handleQiImageUpload(this)">
        <label for="qi-image-file" class="img-upload-label">📷 صورة (اختياري)</label>
        <div id="qi-image-preview" style="width:50px;height:50px;border-radius:8px;background:#0d1526;background-size:cover;background-position:center;display:inline-block;vertical-align:middle;margin-right:8px;">لا توجد</div>
        <button class="primary" onclick="addQuickIcon()">➕ إضافة</button>
      </div>
    </div>
  `;
}

let qiImageBuffer = '';

async function handleQiImageUpload(input) {
  const file = input.files[0]; if (!file) return;
  if (!file.type?.startsWith('image/') || file.size > 8 * 1024 * 1024) return showMessage('اختر صورة صالحة بحجم أقل من 8MB.');
  try {
    const base64 = await compressImage(file, 200, 200);
    qiImageBuffer = base64;
    const p = document.getElementById('qi-image-preview');
    if (p) { p.style.backgroundImage = `url('${base64}')`; p.innerText = ''; }
  } catch (e) { alert('خطأ في الصورة'); }
}

function renderQuickIconsAdminList() {
  const list = document.getElementById('quick-icons-admin-list');
  if (!list) return;
  list.replaceChildren();
  if (!Array.isArray(quickIcons) || quickIcons.length === 0) {
    const empty = document.createElement('p'); empty.style.cssText = 'color:#a0c4ff;font-size:12px;'; empty.textContent = 'لا توجد أيقونات.'; list.appendChild(empty); return;
  }
  quickIcons.forEach((item, i) => {
    const row = document.createElement('div'); row.className = 'admin-section-card';
    const info = document.createElement('div'); info.className = 'info';
    const strong = document.createElement('strong');
    const imageURL = safeImageURL(item.image);
    if (imageURL) { const img = document.createElement('img'); img.src = imageURL; img.alt = ''; img.style.cssText = 'width:24px;height:24px;border-radius:4px;vertical-align:middle;margin-left:5px;'; strong.appendChild(img); }
    else strong.append(document.createTextNode(`${item.icon || '📦'} `));
    strong.append(document.createTextNode(item.title || ''));
    const small = document.createElement('small'); small.textContent = item.link || '';
    info.append(strong, small);
    const actions = document.createElement('div'); actions.className = 'actions';
    const buttons = [['btn-up','⬆️',() => moveQuickIcon(i,-1)],['btn-down','⬇️',() => moveQuickIcon(i,1)],['btn-delete','🗑️',() => deleteQuickIcon(i)]];
    buttons.forEach(([cls,label,handler]) => { const button = document.createElement('button'); button.className = cls; button.textContent = label; button.addEventListener('click', handler); actions.appendChild(button); });
    row.append(info, actions); list.appendChild(row);
  });
}

async function saveQuickIcons() {
  await apiCall('/api/quick-icons/save', { icons: quickIcons });
  renderQuickIcons();
}

async function addQuickIcon() {
  const title = document.getElementById('qi-title')?.value.trim();
  const icon = document.getElementById('qi-icon')?.value.trim() || '📦';
  const link = document.getElementById('qi-link')?.value.trim() || '#shop';
  const color = document.getElementById('qi-color')?.value.trim() || '#4A90E2';
  if (!title) return alert('أدخل عنوان الأيقونة');
  const newIcon = { id: 'qi_' + Date.now(), title, icon, image: qiImageBuffer, link, color };
  quickIcons.push(newIcon);
  await saveQuickIcons();
  qiImageBuffer = '';
  document.getElementById('qi-title').value = '';
  document.getElementById('qi-icon').value = '';
  document.getElementById('qi-link').value = '';
  document.getElementById('qi-image-preview').style.backgroundImage = 'none';
  document.getElementById('qi-image-preview').innerText = 'لا توجد';
  renderQuickIconsAdminList();
  tg.showAlert('تمت إضافة الأيقونة ✅');
}

async function deleteQuickIcon(i) {
  if (!confirm('حذف هذه الأيقونة؟')) return;
  quickIcons.splice(i, 1);
  await saveQuickIcons();
  renderQuickIconsAdminList();
  tg.showAlert('تم الحذف ✅');
}

async function moveQuickIcon(i, dir) {
  const ni = i + dir;
  if (ni < 0 || ni >= quickIcons.length) return;
  const t = quickIcons[i]; quickIcons[i] = quickIcons[ni]; quickIcons[ni] = t;
  await saveQuickIcons();
  renderQuickIconsAdminList();
}

/* ============================================================
   إدارة زر CTA
   ============================================================ */
function renderHeroButtonAdmin() {
  return `
    <hr style="border-color:#333;margin:20px 0;">
    <div class="admin-form">
      <h3 style="margin-top:0;color:white;">🎯 زر الصفحة الرئيسية</h3>
      <label>نص الزر</label>
      <input type="text" id="hb-text" value="${escapeHTML(heroButtonData.text || 'تسوق الآن')}">
      <label>الرابط</label>
      <input type="text" id="hb-link" value="${escapeHTML(heroButtonData.link || '#shop')}" placeholder="#shop أو #product-123">
      <label>اللون</label>
      <input type="text" id="hb-color" value="${escapeHTML(safeColor(heroButtonData.color))}">
      <button class="primary" onclick="saveHeroButton()">💾 حفظ الزر</button>
    </div>
  `;
}

async function saveHeroButton() {
  const text = document.getElementById('hb-text')?.value || 'تسوق الآن';
  const link = document.getElementById('hb-link')?.value || '#shop';
  const color = document.getElementById('hb-color')?.value || '#4A90E2';
  const res = await apiCall('/api/store/update-hero-button', { text, link, color });
  if (res.ok) {
    heroButtonData = { text, link, color };
    updateHeroButton();
    tg.showAlert('تم حفظ الزر ✅');
  } else tg.showAlert(res.error);
}

/* ============================================================
   إدارة الأقسام
   ============================================================ */
function renderSectionsAdmin() {
  let listHTML = '';
  const sorted = [...dynamicSections].sort((a,b) => (a.order||0)-(b.order||0));
  if (sorted.length === 0) {
    listHTML = '<p style="color:#a0c4ff;font-size:13px;">لا توجد أقسام.</p>';
  } else {
    listHTML = sorted.map((sec, idx) => {
      const typeInfo = SECTION_TYPES[sec.type] || { label: sec.type, color: '#666' };
      const visibleLabel = sec.visible === false ? '👁️‍🗨️ مخفي' : '👁️ ظاهر';
      return `
        <div class="admin-section-card">
          <div class="info">
            <strong>${escapeHTML(sec.title || '(بدون عنوان)')}</strong>
            <small><span class="type-badge" style="background:${typeInfo.color};">${escapeHTML(typeInfo.label)}</span> ${visibleLabel} — ${idx + 1}</small>
          </div>
          <div class="actions">
            <button class="btn-up" onclick="moveSection('${encodedArg(sec.id)}', -1)">⬆️</button>
            <button class="btn-down" onclick="moveSection('${encodedArg(sec.id)}', 1)">⬇️</button>
            <button class="btn-toggle" onclick="toggleSectionVisibility('${encodedArg(sec.id)}')">${sec.visible === false ? '👁️‍🗨️' : '👁️'}</button>
            <button class="btn-edit" onclick="openSectionEditor('${encodedArg(sec.id)}')">✏️</button>
            <button class="btn-delete" onclick="deleteSection('${encodedArg(sec.id)}')">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  }
  return `
    <hr style="border-color:#333;margin:20px 0;">
    <div class="admin-form">
      <h3 style="margin-top:0;color:white;">🗂️ إدارة الأقسام</h3>
      <button class="primary" onclick="openSectionEditor(null)">➕ إضافة قسم جديد</button>
      <div id="section-editor-container"></div>
    </div>
    <h3 style="color:white;">الأقسام (${sorted.length})</h3>
    <div>${listHTML}</div>
  `;
}

function openSectionEditor(sectionId) {
  if (sectionId !== null && sectionId !== undefined) { try { sectionId = decodeURIComponent(sectionId); } catch (_) { return; } }
  editingSectionId = sectionId;
  const sec = sectionId ? dynamicSections.find(s => s.id === sectionId) : null;
  sectionImageBuffer = sec?.image || '';
  sectionItemsBuffer = sec?.items ? JSON.parse(JSON.stringify(sec.items)) : [];
  const currentType = sec?.type || 'grid';
  const container = document.getElementById('section-editor-container');
  if (!container) return;
  let typeOptions = Object.entries(SECTION_TYPES).map(([key, val]) =>
    `<option value="${key}" ${key === currentType ? 'selected' : ''}>${val.label}</option>`
  ).join('');
  container.innerHTML = `
    <div class="admin-form" style="margin-top:15px;">
      <h3 style="margin-top:0;">${sectionId ? '✏️ تعديل قسم' : '➕ قسم جديد'}</h3>
      <label>عنوان القسم</label>
      <input type="text" id="sec-title" value="${escapeHTML(sec?.title || '')}">
      <label>نوع القسم</label>
      <select id="sec-type" onchange="onSectionTypeChange()">${typeOptions}</select>
      <div id="sec-type-fields"></div>
      <button class="primary" onclick="saveSection()">${sectionId ? '💾 حفظ' : '➕ إضافة'}</button>
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

function onSectionTypeChange() {
  const typeEl = document.getElementById('sec-type');
  if (!typeEl) return;
  const type = typeEl.value;
  const fields = document.getElementById('sec-type-fields');
  if (!fields) return;
  const sec = editingSectionId ? dynamicSections.find(s => s.id === editingSectionId) : null;
  let html = '';
  if (['text', 'image', 'banner'].includes(type)) {
    html += `
      <label>صورة القسم</label>
      <div class="img-preview-box" id="sec-img-preview" style="${safeImageURL(sectionImageBuffer) ? `background-image:url('${safeImageURL(sectionImageBuffer)}')` : ''}">${sectionImageBuffer ? '' : 'لا توجد'}</div>
      <input type="file" id="sec-img-file" accept="image/*" class="hidden-file" onchange="handleSectionImageUpload(this)">
      <label for="sec-img-file" class="img-upload-label">📷 اختر صورة</label>
      <label>محتوى نصي</label>
      <textarea id="sec-content" rows="3">${escapeHTML(sec?.content || '')}</textarea>
      <label>نص الزر</label>
      <input type="text" id="sec-btn-text" value="${escapeHTML(sec?.buttonText || '')}">
      <label>رابط الزر</label>
      <input type="text" id="sec-btn-link" value="${escapeHTML(sec?.buttonLink || '')}" placeholder="#product-123">
    `;
  }
  if (['grid', 'products'].includes(type)) {
    html += `<label>العناصر (${sectionItemsBuffer.length})</label>
             <div id="sec-items-list"></div>
             <button class="add-item-btn" onclick="addSectionItem()">➕ إضافة عنصر</button>`;
  }
  fields.innerHTML = html;
  if (['grid', 'products'].includes(type)) renderSectionItems();
}

async function handleSectionImageUpload(input) {
  const file = input.files[0]; if (!file) return;
  if (!file.type?.startsWith('image/') || file.size > 8 * 1024 * 1024) return showMessage('اختر صورة صالحة بحجم أقل من 8MB.');
  try {
    const base64 = await compressImage(file, 800, 600);
    sectionImageBuffer = base64;
    const p = document.getElementById('sec-img-preview');
    if (p) { p.style.backgroundImage = `url('${base64}')`; p.innerText = ''; }
  } catch (e) { alert('خطأ في الصورة'); }
}

function renderSectionItems() {
  const list = document.getElementById('sec-items-list');
  if (!list) return;
  if (sectionItemsBuffer.length === 0) {
    list.innerHTML = '<p style="color:#a0c4ff;font-size:12px;">لا توجد عناصر.</p>';
    return;
  }
  list.innerHTML = sectionItemsBuffer.map((item, i) => `
    <div class="item-editor">
      <div class="item-row">
        <input type="text" placeholder="العنوان" value="${escapeHTML(item.title || '')}" oninput="updateSectionItem(${i}, 'title', this.value)">
        <input type="text" placeholder="الأيقونة" value="${escapeHTML(item.icon || '')}" oninput="updateSectionItem(${i}, 'icon', this.value)" style="max-width:80px;">
      </div>
      <div class="item-row">
        <input type="text" placeholder="الرابط" value="${escapeHTML(item.link || '')}" oninput="updateSectionItem(${i}, 'link', this.value)">
        <input type="text" placeholder="الوصف" value="${escapeHTML(item.description || '')}" oninput="updateSectionItem(${i}, 'description', this.value)">
      </div>
      <div class="item-row">
        <input type="text" placeholder="السعر" value="${escapeHTML(item.price || '')}" oninput="updateSectionItem(${i}, 'price', this.value)">
        <label class="img-upload-label" style="margin:0;padding:6px 10px;">
          📷<input type="file" accept="image/*" style="display:none;" onchange="handleSectionItemImage(${i}, this)">
        </label>
        ${item.image ? `<span style="color:#4AE2A0;font-size:11px;">✓</span>` : ''}
      </div>
      <button class="remove-item" onclick="removeSectionItem(${i})">🗑️ حذف</button>
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
  if (!file.type?.startsWith('image/') || file.size > 8 * 1024 * 1024) return showMessage('اختر صورة صالحة بحجم أقل من 8MB.');
  try {
    const base64 = await compressImage(file, 300, 300);
    sectionItemsBuffer[i].image = base64;
    renderSectionItems();
  } catch (e) { alert('خطأ في الصورة'); }
}

async function saveSection() {
  const title = document.getElementById('sec-title')?.value.trim();
  const type = document.getElementById('sec-type')?.value;
  if (!title) return alert('أدخل عنوان القسم');
  const payload = {
    title, type,
    image: sectionImageBuffer || '',
    content: document.getElementById('sec-content')?.value || '',
    buttonText: document.getElementById('sec-btn-text')?.value || '',
    buttonLink: document.getElementById('sec-btn-link')?.value || '',
    items: ['grid', 'products'].includes(type) ? sectionItemsBuffer : []
  };
  let res;
  if (editingSectionId) res = await apiCall('/api/sections/edit', { sectionId: editingSectionId, ...payload });
  else res = await apiCall('/api/sections/add', payload);
  if (res.ok) {
    tg.showAlert(editingSectionId ? 'تم التعديل ✅' : 'تمت الإضافة ✅');
    closeSectionEditor();
    await loadDynamicSections();
    openAdminPanel();
  } else tg.showAlert(res.error || 'فشل');
}

async function deleteSection(id) {
  try { id = decodeURIComponent(id); } catch (_) { return; }
  if (!confirm('حذف هذا القسم؟')) return;
  const res = await apiCall('/api/sections/delete', { sectionId: id });
  if (res.ok) { tg.showAlert('تم الحذف ✅'); await loadDynamicSections(); openAdminPanel(); }
  else tg.showAlert(res.error);
}

async function toggleSectionVisibility(id) {
  try { id = decodeURIComponent(id); } catch (_) { return; }
  const sec = dynamicSections.find(s => s.id === id);
  if (!sec) return;
  const res = await apiCall('/api/sections/toggle', { sectionId: id, visible: sec.visible === false });
  if (res.ok) { await loadDynamicSections(); openAdminPanel(); }
  else tg.showAlert(res.error);
}

async function moveSection(id, direction) {
  try { id = decodeURIComponent(id); } catch (_) { return; }
  const sorted = [...dynamicSections].sort((a,b)=>(a.order||0)-(b.order||0));
  const idx = sorted.findIndex(s => s.id === id);
  if (idx === -1) return;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= sorted.length) return;
  const tmp = sorted[idx]; sorted[idx] = sorted[newIdx]; sorted[newIdx] = tmp;
  const orders = sorted.map((s, i) => ({ id: s.id, order: i }));
  const res = await apiCall('/api/sections/reorder', { orders });
  if (res.ok) { await loadDynamicSections(); openAdminPanel(); }
  else tg.showAlert(res.error);
}

/* ============================================================
   لوحة التحكم
   ============================================================ */
async function openAdminPanel() {
  safeRemoveActive('page-home');
  safeRemoveActive('page-nav');
  safeRemoveActive('page-shop');
  safeRemoveActive('page-product');
  safeAddActive('page-admin');

  const content = document.getElementById('admin-content');
  if (!content) return;
  content.innerHTML = `<div class="custom-loader-wrapper"><div class="loader"><p class="loader-text">جاري التحميل...</p><span class="load"></span></div></div>`;

  const [data, sliderData, staffData, sectionsData, catsData, qiData, badgesData] = await Promise.all([
    apiCall('/api/products'),
    userRole === 'owner' ? apiCall('/api/slider') : Promise.resolve({ ok: false, slides: [] }),
    (userRole === 'owner' || userRole === 'admin') ? apiCall('/api/users/list') : Promise.resolve({ ok: false, staff: [] }),
    apiCall('/api/sections'),
    apiCall('/api/categories'),
    apiCall('/api/quick-icons'),
    apiCall('/api/badges')
  ]);

  if (sectionsData.ok && Array.isArray(sectionsData.sections)) {
    dynamicSections = sectionsData.sections;
    renderDynamicSections();
  }
  if (catsData.ok && Array.isArray(catsData.categories)) currentCategories = catsData.categories;
  if (qiData.ok && Array.isArray(qiData.icons)) quickIcons = qiData.icons;
  if (badgesData.ok && Array.isArray(badgesData.badges)) currentBadges = badgesData.badges;
  if (data.ok && Array.isArray(data.products)) currentShopProducts = data.products;

  let productsHTML = '';
  if (data.ok && data.products.length > 0) {
    productsHTML = data.products.map(p => {
      let pricesStr = [];
      if (p.prices?.usd > 0) pricesStr.push(`$${p.prices.usd}`);
      if (p.prices?.ton > 0) pricesStr.push(`💎 ${p.prices.ton}`);
      if (p.prices?.stars > 0) pricesStr.push(`⭐ ${p.prices.stars}`);
      if (p.prices?.sar > 0) pricesStr.push(`🇸🇦 ${p.prices.sar}`);
      const productImage = safeImageURL(p.image);
      const imgTag = productImage ? `<img src="${escapeHTML(productImage)}" alt="" style="width:50px;height:50px;border-radius:5px;object-fit:cover;margin-left:10px;">` : '';
      const link = p.link && (String(p.link).startsWith('#') || safeWebURL(p.link)) ? p.link : ('#product-' + p.id);
      return `<div style="background:#152a47;padding:12px;margin-bottom:12px;border-radius:10px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;flex:1;min-width:180px;">${imgTag}<div>
          <strong style="color:white;">${escapeHTML(p.name)}</strong>
          <div style="font-size:13px;color:#fff;">${escapeHTML(pricesStr.join(' | ') || 'بدون سعر')}</div>
          <div style="font-size:11px;color:#4AE2A0;">🔗 ${escapeHTML(link)}</div>
        </div></div>
        <div style="display:flex;flex-direction:column;gap:5px;">
          <button onclick="copyProductLinkFromAdmin('${encodedArg(p.id)}')" style="background:#4A90E2;color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:12px;">📋 نسخ</button>
          <button onclick="editProductForm('${encodedArg(p.id)}')" style="background:#f39c12;color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:12px;">تعديل</button>
          <button onclick="deleteProduct('${encodedArg(p.id)}')" style="background:#e74c3c;color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:12px;">حذف</button>
        </div>
      </div>`;
    }).join('');
  } else productsHTML = '<p>لا توجد منتجات.</p>';

  let staffHTML = '';
  if ((userRole === 'owner' || userRole === 'admin') && staffData.ok && staffData.staff.length > 0) {
    staffHTML = staffData.staff.map(s => {
      const roleName = s.role === 'admin' ? 'مسؤول' : 'مشرف';
      const canEdit = userRole === 'owner' || (userRole === 'admin' && s.role === 'moderator');
      return `<div style="background:#152a47;padding:10px;margin-bottom:10px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
        <div><strong style="color:white;">${escapeHTML(s.name)}</strong> <span style="color:#f39c12;font-size:12px;">(${roleName})</span><br><small style="color:#888;">ID: ${escapeHTML(s.id)}</small></div>
        ${canEdit ? `<div style="display:flex;gap:5px;">
          ${s.role === 'moderator' && userRole === 'owner' ? `<button onclick="updateRole('${encodedArg(s.id)}','admin')" style="background:#3498db;color:white;border:none;padding:5px 8px;border-radius:5px;font-size:11px;">ترقية</button>` : ''}
          <button onclick="updateRole('${encodedArg(s.id)}','user')" style="background:#e74c3c;color:white;border:none;padding:5px 8px;border-radius:5px;font-size:11px;">إزالة</button>
        </div>` : ''}
      </div>`;
    }).join('');
  } else staffHTML = '<p>لا يوجد مشرفين.</p>';

  let sliderHTML = '';
  if (userRole === 'owner' && sliderData.ok && sliderData.slides.length > 0) {
    sliderHTML = sliderData.slides.map(s => `
      <div style="background:#152a47;padding:10px;margin-bottom:10px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;align-items:center;gap:10px;">
          <img src="${escapeHTML(safeImageURL(s.image))}" alt="" style="width:60px;height:40px;border-radius:5px;object-fit:cover;">
          <strong style="color:white;font-size:14px;">${escapeHTML(s.title || 'بدون عنوان')}</strong>
        </div>
        <button onclick="deleteSlide('${encodedArg(s.id)}')" style="background:#e74c3c;color:white;border:none;padding:5px 10px;border-radius:5px;font-size:12px;">حذف</button>
      </div>
    `).join('');
  } else if (userRole === 'owner') sliderHTML = '<p>لا توجد صور.</p>';

  const store = storeMenuLinks || {};
  const catOptions = currentCategories.filter(c => c.id !== 'all')
    .map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.icon || '📦')} ${escapeHTML(c.name)}</option>`).join('');

  content.innerHTML = `
    <div style="background:#112238;padding:15px;border-radius:10px;margin-bottom:20px;">
      <h3 style="margin-top:0;color:white;">إضافة / تعديل منتج</h3>
      <input type="text" id="new-prod-name" placeholder="اسم المنتج" style="width:100%;padding:10px;margin-bottom:8px;border-radius:5px;border:none;box-sizing:border-box;">
      <textarea id="new-prod-desc" placeholder="وصف المنتج" style="width:100%;padding:10px;margin-bottom:8px;border-radius:5px;border:none;box-sizing:border-box;resize:none;"></textarea>
      <div style="margin-bottom:8px;">
        <label for="image-upload" style="color:#a0c4ff;font-size:12px;display:block;margin-bottom:5px;">الصورة:</label>
        <input type="file" id="image-upload" accept="image/*" onchange="handleImageUpload(this,'image-preview')" style="display:none;">
        <label for="image-upload" style="background:#2a3b5c;color:white;padding:8px 15px;border-radius:5px;cursor:pointer;font-size:12px;display:inline-block;">اختر صورة</label>
        <div id="image-preview" style="width:40px;height:40px;border-radius:5px;background:#0d1526;background-size:cover;background-position:center;display:inline-block;vertical-align:middle;margin-right:8px;text-align:center;line-height:40px;color:#666;font-size:10px;">لا توجد</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <input type="number" id="price-usd" placeholder="دولار $" style="padding:8px;border-radius:5px;border:none;">
        <input type="number" id="price-ton" placeholder="TON" style="padding:8px;border-radius:5px;border:none;">
        <input type="number" id="price-stars" placeholder="نجوم ⭐" style="padding:8px;border-radius:5px;border:none;">
        <input type="number" id="price-sar" placeholder="ريال 🇸🇦" style="padding:8px;border-radius:5px;border:none;">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <select id="new-prod-category" style="padding:8px;border-radius:5px;border:none;">
          <option value="all">بدون تصنيف</option>
          ${catOptions}
        </select>
        <select id="new-prod-badge" style="padding:8px;border-radius:5px;border:none;">
          ${badgeOptionsHTML()}
        </select>
      </div>
      <input type="number" id="new-prod-discount" placeholder="نسبة الخصم %" style="width:100%;padding:8px;margin-bottom:8px;border-radius:5px;border:none;" min="0" max="99">
            <button onclick="addProduct()" id="submit-btn" style="background:#6A0DAD;color:white;padding:12px;width:100%;border:none;border-radius:5px;cursor:pointer;font-weight:bold;">إضافة المنتج</button>
      <button id="cancel-edit-btn" onclick="openAdminPanel()" style="display:none;background:#e74c3c;color:white;padding:12px;width:100%;border:none;border-radius:5px;cursor:pointer;font-weight:bold;margin-top:8px;">إلغاء التعديل</button>
    </div>
    <h3 style="color:white;">المنتجات المضافة</h3>
    <div>${productsHTML}</div>

    ${userRole === 'owner' || userRole === 'admin' ? renderSectionsAdmin() : ''}
    ${userRole === 'owner' || userRole === 'admin' ? renderCategoriesAdmin() : ''}
    ${userRole === 'owner' || userRole === 'admin' ? renderBadgesAdmin() : ''}
    ${userRole === 'owner' || userRole === 'admin' ? renderQuickIconsAdmin() : ''}
    ${userRole === 'owner' ? renderHeroButtonAdmin() : ''}

    ${userRole === 'owner' ? `
      <hr style="border-color:#333;margin:20px 0;">
      <div style="background:#112238;padding:15px;border-radius:10px;margin-bottom:20px;">
        <h3 style="margin-top:0;color:white;">إضافة صورة للسلايدر</h3>
        <input type="file" id="slider-upload" accept="image/*" onchange="handleSliderImageUpload(this)" style="display:none;">
        <label for="slider-upload" style="background:#2a3b5c;color:white;padding:8px 15px;border-radius:5px;cursor:pointer;font-size:12px;display:inline-block;margin-bottom:8px;">اختر صورة</label>
        <div id="slider-preview" style="width:80px;height:40px;border-radius:5px;background:#0d1526;background-size:cover;background-position:center;display:inline-block;vertical-align:middle;text-align:center;line-height:40px;color:#666;font-size:10px;margin-bottom:8px;">لا توجد</div>
        <input type="text" id="slide-title" placeholder="عنوان" style="width:100%;padding:10px;margin-bottom:8px;border-radius:5px;border:none;box-sizing:border-box;">
        <input type="text" id="slide-btn-text" placeholder="نص الزر" style="width:100%;padding:10px;margin-bottom:8px;border-radius:5px;border:none;box-sizing:border-box;">
        <input type="text" id="slide-btn-link" placeholder="#product-123" style="width:100%;padding:10px;margin-bottom:8px;border-radius:5px;border:none;box-sizing:border-box;">
        <button onclick="addSlide()" style="background:#4A90E2;color:white;padding:12px;width:100%;border:none;border-radius:5px;cursor:pointer;font-weight:bold;">إضافة</button>
      </div>
      <h3 style="color:white;">صور السلايدر</h3>
      <div>${sliderHTML}</div>
      <hr style="border-color:#333;margin:20px 0;">
      <div style="background:#112238;padding:15px;border-radius:10px;margin-bottom:20px;">
        <h3 style="margin-top:0;color:white;">روابط الأقسام القديمة</h3>
        <input type="text" id="link-telegram" value="${escapeHTML(store.telegram || '')}" placeholder="تيليجرام" style="width:100%;padding:10px;margin-bottom:8px;border-radius:5px;border:none;">
        <input type="text" id="link-nft" value="${escapeHTML(store.nft || '')}" placeholder="NFT" style="width:100%;padding:10px;margin-bottom:8px;border-radius:5px;border:none;">
        <input type="text" id="link-social" value="${escapeHTML(store.social || '')}" placeholder="تواصل" style="width:100%;padding:10px;margin-bottom:8px;border-radius:5px;border:none;">
        <input type="text" id="link-games" value="${escapeHTML(store.games || '')}" placeholder="ألعاب" style="width:100%;padding:10px;margin-bottom:8px;border-radius:5px;border:none;">
        <button onclick="saveMenuLinks()" style="background:#8A2BE2;color:white;padding:12px;width:100%;border:none;border-radius:5px;cursor:pointer;font-weight:bold;">حفظ</button>
      </div>
    ` : ''}

    ${userRole === 'owner' || userRole === 'admin' ? `
      <hr style="border-color:#333;margin:20px 0;">
      <div style="background:#112238;padding:15px;border-radius:10px;margin-bottom:20px;">
        <h3 style="margin-top:0;color:white;">ترقية مستخدم</h3>
        <input type="text" id="target-id" placeholder="Telegram ID" style="width:100%;padding:10px;margin-bottom:8px;border-radius:5px;border:none;box-sizing:border-box;">
        <select id="target-role" style="width:100%;padding:10px;margin-bottom:8px;border-radius:5px;border:none;box-sizing:border-box;">
          <option value="moderator">مشرف</option>
          ${userRole === 'owner' ? '<option value="admin">مسؤول</option>' : ''}
        </select>
        <button onclick="promoteUser()" style="background:#3498db;color:white;padding:12px;width:100%;border:none;border-radius:5px;cursor:pointer;">ترقية</button>
      </div>
      <h3 style="color:white;">إدارة المشرفين</h3>
      <div>${staffHTML}</div>
    ` : ''}
  `;

  if (userRole === 'owner' || userRole === 'admin') {
    renderCategoriesList();
    renderBadgesList();
    renderQuickIconsAdminList();
  }

  currentBase64Image = "";
  currentSliderImage = "";
}

/* ====== المنتجات ====== */
async function addProduct() {
  const name = document.getElementById('new-prod-name').value;
  const description = document.getElementById('new-prod-desc').value;
  const prices = {
    usd: parseFloat(document.getElementById('price-usd').value) || 0,
    ton: parseFloat(document.getElementById('price-ton').value) || 0,
    stars: parseFloat(document.getElementById('price-stars').value) || 0,
    sar: parseFloat(document.getElementById('price-sar').value) || 0
  };
  const category = document.getElementById('new-prod-category')?.value || 'all';
  const badge = document.getElementById('new-prod-badge')?.value || '';
  const discount = parseFloat(document.getElementById('new-prod-discount')?.value) || 0;
  if (!name) return alert('أدخل اسم المنتج');
  const res = await apiCall('/api/products/add', { name, description, image: currentBase64Image, prices, category, badge, discount });
  if (res.ok) {
    const link = res.link || ('#product-' + res.product.id);
    tg.showAlert('✅ تمت الإضافة!\n\nرابط المنتج:\n' + link);
    navigator.clipboard.writeText(link).catch(() => {});
    openAdminPanel();
  } else tg.showAlert(res.error || 'فشل');
}

async function editProductForm(id) {
  try { id = decodeURIComponent(id); } catch (_) { return; }
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
  const catSel = document.getElementById('new-prod-category');
  if (catSel) catSel.value = product.category || 'all';
  const badgeSel = document.getElementById('new-prod-badge');
  if (badgeSel) badgeSel.value = product.badge || '';
  const discInp = document.getElementById('new-prod-discount');
  if (discInp) discInp.value = product.discount || '';
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
  const category = document.getElementById('new-prod-category')?.value || 'all';
  const badge = document.getElementById('new-prod-badge')?.value || '';
  const discount = parseFloat(document.getElementById('new-prod-discount')?.value) || 0;
  const res = await apiCall('/api/products/edit', { productId: id, name, description, image: currentBase64Image, prices, category, badge, discount });
  if(res.ok) { tg.showAlert('تم التعديل ✅'); openAdminPanel(); } else tg.showAlert(res.error);
}

async function deleteProduct(id) {
  try { id = decodeURIComponent(id); } catch (_) { return; }
  if(!confirm('حذف هذا المنتج؟')) return;
  const res = await apiCall('/api/products/delete', { productId: id });
  if(res.ok) openAdminPanel(); else alert(res.error);
}

async function promoteUser() {
  const targetId = document.getElementById('target-id').value;
  const newRole = document.getElementById('target-role').value;
  if(!targetId) return alert('أدخل الآي دي');
  const res = await apiCall('/api/users/promote', { targetId, newRole });
  if(res.ok) { tg.showAlert('تمت الترقية ✅'); openAdminPanel(); } else tg.showAlert(res.error);
}

async function updateRole(targetId, newRole) {
  try { targetId = decodeURIComponent(targetId); } catch (_) { return; }
  if(!confirm('تعديل الرتبة؟')) return;
  const res = await apiCall('/api/users/update-role', { targetId, newRole });
  if(res.ok) { tg.showAlert('تم التحديث ✅'); openAdminPanel(); } else tg.showAlert(res.error);
}

async function saveMenuLinks() {
  const links = {
    telegram: document.getElementById('link-telegram')?.value || '',
    nft: document.getElementById('link-nft')?.value || '',
    social: document.getElementById('link-social')?.value || '',
    games: document.getElementById('link-games')?.value || ''
  };
  const res = await apiCall('/api/store/update-links', { links });
  if(res.ok) { tg.showAlert('تم حفظ الروابط ✅'); loadStoreData(); openAdminPanel(); }
  else tg.showAlert(res.error);
}

/* ============================================================
   صفحة المتجر (بدون تغيير hash)
   ============================================================ */
async function openShop(categoryId = null) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-shop').classList.add('active');
  document.getElementById('page-nav').classList.add('active');

  const content = document.getElementById('shop-content');
  if (!content) return;
  content.innerHTML = '<div class="shop-empty">جاري التحميل...</div>';

  const [productsRes, catsRes, badgesRes] = await Promise.all([
    apiCall('/api/products'),
    apiCall('/api/categories'),
    apiCall('/api/badges')
  ]);

  if (catsRes.ok && Array.isArray(catsRes.categories)) currentCategories = catsRes.categories;
  if (badgesRes?.ok && Array.isArray(badgesRes.badges)) currentBadges = badgesRes.badges;
  if (productsRes.ok && Array.isArray(productsRes.products)) currentShopProducts = productsRes.products;
  else currentShopProducts = [];

  const requestedCategory = categoryId && currentCategories.some(c => c.id === categoryId) ? categoryId : 'all';
  shopState = { search: '', category: requestedCategory, sort: 'newest' };
  const searchInput = document.getElementById('shop-search-input');
  if (searchInput) searchInput.value = '';
  const sortSelect = document.getElementById('shop-sort');
  if (sortSelect) sortSelect.value = 'newest';
  const clearBtn = document.getElementById('shop-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';

  renderCategoriesBar();
  applyShopFilters();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderCategoriesBar() {
  const bar = document.getElementById('shop-categories');
  if (!bar) return;
  bar.innerHTML = '';
  const allCat = currentCategories.find(c => c.id === 'all') || { id: 'all', name: 'الكل', icon: '🛍️' };
  const allCats = [allCat, ...currentCategories.filter(c => c.id !== 'all')];
  allCats.forEach(cat => {
    const chip = document.createElement('div');
    chip.className = 'cat-chip' + (shopState.category === cat.id ? ' active' : '');
    chip.textContent = `${cat.icon || '📦'} ${cat.name || ''}`;
    chip.onclick = () => { shopState.category = cat.id; renderCategoriesBar(); applyShopFilters(); };
    bar.appendChild(chip);
  });
}

function onShopSearch(val) {
  shopState.search = (val || '').trim().toLowerCase();
  const clearBtn = document.getElementById('shop-search-clear');
  if (clearBtn) clearBtn.style.display = val ? 'flex' : 'none';
  applyShopFilters();
}

function clearShopSearch() {
  const input = document.getElementById('shop-search-input');
  if (input) input.value = '';
  shopState.search = '';
  const clearBtn = document.getElementById('shop-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  applyShopFilters();
}

function onShopSort(val) { shopState.sort = val; applyShopFilters(); }

function applyShopFilters() {
  let list = [...currentShopProducts];
  if (shopState.category && shopState.category !== 'all') list = list.filter(p => p.category === shopState.category);
  if (shopState.search) {
    list = list.filter(p =>
      (p.name || '').toLowerCase().includes(shopState.search) ||
      (p.description || '').toLowerCase().includes(shopState.search)
    );
  }
  if (shopState.sort === 'newest') {
    list.sort((a, b) => {
      const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return db - da;
    });
  } else if (shopState.sort === 'cheapest') list.sort((a, b) => (a.prices?.usd || 0) - (b.prices?.usd || 0));
  else if (shopState.sort === 'expensive') list.sort((a, b) => (b.prices?.usd || 0) - (a.prices?.usd || 0));
  else if (shopState.sort === 'popular') list.sort((a, b) => (b.soldCount || 0) - (a.soldCount || 0));
  renderShopProducts(list);
  const countEl = document.getElementById('shop-results-count');
  if (countEl) countEl.textContent = `${list.length} منتج`;
}

function renderShopProducts(products) {
  const content = document.getElementById('shop-content');
  if (!content) return;
  content.replaceChildren();
  if (!Array.isArray(products) || products.length === 0) {
    const empty = document.createElement('div'); empty.className = 'shop-empty'; empty.textContent = 'لا توجد منتجات مطابقة 🔍'; content.appendChild(empty); return;
  }
  const grid = document.createElement('div'); grid.className = 'shop-grid';
  products.forEach(p => {
    const card = document.createElement('div'); card.className = 'shop-card';
    card.addEventListener('click', () => openProduct(p.id));
    const imageWrap = document.createElement('div'); imageWrap.className = 'card-img-wrap';
    if (Number(p.discount) > 0) {
      const badge = document.createElement('div'); badge.className = 'card-badge discount';
      badge.textContent = `🔥 خصم ${Math.min(100, Number(p.discount) || 0)}%`; imageWrap.appendChild(badge);
    } else {
      const badge = makeProductBadge(p.badge); if (badge) imageWrap.appendChild(badge);
    }
    const imageURL = safeImageURL(p.image);
    if (imageURL) { const img = document.createElement('img'); img.src = imageURL; img.className = 'card-img'; img.alt = p.name || ''; imageWrap.appendChild(img); }
    else { const placeholder = document.createElement('div'); placeholder.className = 'card-img-placeholder'; placeholder.textContent = '📦'; imageWrap.appendChild(placeholder); }
    const body = document.createElement('div'); body.className = 'card-body';
    const name = document.createElement('strong'); name.textContent = p.name || 'بدون اسم';
    const desc = document.createElement('small'); desc.textContent = p.description || '';
    const priceRow = document.createElement('div'); priceRow.className = 'card-price-row';
    const price = document.createElement('span'); price.className = 'card-price'; price.textContent = formatPrices(p.prices) || '—';
    const cat = document.createElement('span'); cat.className = 'card-cat'; cat.textContent = currentCategories.find(c => c.id === p.category)?.name || '';
    priceRow.append(price, cat); body.append(name, desc, priceRow); card.append(imageWrap, body); grid.appendChild(card);
  });
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

/* ============================================================
   صفحة المنتج (بدون تغيير hash)
   ============================================================ */
async function openProduct(productId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-product').classList.add('active');
  document.getElementById('page-nav').classList.add('active');
  await loadProductPage(productId);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function loadProductPage(productId) {
  const content = document.getElementById('product-content');
  if (!content) return;
  content.textContent = 'جاري التحميل...';
  let product = currentShopProducts.find(p => String(p.id) === String(productId));
  if (!product) {
    try { const res = await apiCall('/api/products/get', { productId }); if (res.ok && res.product) product = res.product; }
    catch (error) { console.error(error); }
  }
  if (!product) { content.textContent = '❌ المنتج غير موجود'; return; }
  content.replaceChildren();
  const hero = document.createElement('div'); hero.className = 'product-hero';
  const imageURL = safeImageURL(product.image);
  if (imageURL) { const img = document.createElement('img'); img.src = imageURL; img.alt = product.name || ''; hero.appendChild(img); }
  else { const placeholder = document.createElement('div'); placeholder.className = 'hero-placeholder'; placeholder.textContent = '📦'; hero.appendChild(placeholder); }
  const info = document.createElement('div'); info.className = 'product-info';
  if (Number(product.discount) > 0) {
    const badge = document.createElement('span'); badge.className = 'card-badge discount';
    badge.style.cssText = 'position:static;display:inline-block;margin-bottom:8px;';
    badge.textContent = `🔥 خصم ${Math.min(100, Number(product.discount) || 0)}%`; info.appendChild(badge);
  } else {
    const badge = makeProductBadge(product.badge);
    if (badge) { badge.style.cssText += ';position:static;display:inline-block;margin-bottom:8px;'; info.appendChild(badge); }
  }
  const title = document.createElement('h2'); title.textContent = product.name || 'بدون اسم'; info.appendChild(title);
  const categoryName = currentCategories.find(c => c.id === product.category)?.name || '';
  if (categoryName) { const cat = document.createElement('div'); cat.style.cssText = 'color:#8A2BE2;font-size:12px;margin-bottom:8px;'; cat.textContent = `🏷️ ${categoryName}`; info.appendChild(cat); }
  if (product.description) { const desc = document.createElement('p'); desc.textContent = product.description; info.appendChild(desc); }
  const prices = product.prices || {};
  const priceEntries = [['usd','دولار','$'],['ton','TON',''],['stars','نجوم',''],['sar','ريال','']].filter(([key]) => Number(prices[key]) > 0);
  if (priceEntries.length) { const priceBox = document.createElement('div'); priceBox.className = 'product-prices'; priceEntries.forEach(([key,label,prefix]) => { const chip = document.createElement('span'); chip.className = 'price-chip'; chip.textContent = `${label}: ${prefix}${prices[key]}`; priceBox.appendChild(chip); }); info.appendChild(priceBox); }
  const buy = document.createElement('button'); buy.className = 'product-buy-btn'; buy.textContent = '🛒 اطلب الآن'; buy.addEventListener('click', () => buyProduct(product.id));
  const share = document.createElement('button'); share.className = 'product-share-btn'; share.textContent = '🔗 نسخ رابط المنتج'; share.addEventListener('click', () => copyProductLink(product.id));
  info.append(buy, share); content.append(hero, info);
}

function buyProduct(productId) {
  const product = currentShopProducts.find(p => String(p.id) === String(productId));
  if (!product) return showMessage('المنتج غير متاح حالياً.');
  showMessage('تم اختيار المنتج. لإتمام الطلب، تواصل مع إدارة المتجر. لن تُحتسب المبيعة إلا بعد تأكيد الدفع.');
}

function copyProductLink(productId) {
  const product = currentShopProducts.find(p => p.id === productId);
  const internalLink = product?.link && (String(product.link).startsWith('#') || safeWebURL(product.link)) ? product.link : ('#product-' + productId);
  navigator.clipboard.writeText(internalLink).then(() => {
    if (tg && tg.showAlert) tg.showAlert('تم نسخ الرابط الداخلي ✅\n\n' + internalLink + '\n\n(يعمل داخل التطبيق)');
    else alert('الرابط:\n' + internalLink);
  }).catch(() => {
    if (tg && tg.showAlert) tg.showAlert('الرابط: ' + internalLink);
    else alert('الرابط: ' + internalLink);
  });
}

function copyProductLinkFromAdmin(productId) {
  try { productId = decodeURIComponent(productId); } catch (_) { return; }
  copyProductLink(productId);
}

function goHome() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-home').classList.add('active');
  document.getElementById('page-nav').classList.add('active');
}

function showEmptyPage(title, icon, message) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  let emptyPage = document.getElementById('page-dynamic-empty');
  if (!emptyPage) {
    emptyPage = document.createElement('div');
    emptyPage.id = 'page-dynamic-empty';
    emptyPage.className = 'page';
    emptyPage.style.cssText = 'background:#0A192F;min-height:100vh;padding:30px 20px;align-items:center;justify-content:center;text-align:center;color:white;flex-direction:column;';
    const adminPage = document.getElementById('page-admin');
    document.body.insertBefore(emptyPage, adminPage || null);
  }
  emptyPage.replaceChildren();
  const iconEl = document.createElement('div'); iconEl.style.cssText = 'font-size:60px;margin-bottom:20px;'; iconEl.textContent = icon;
  const titleEl = document.createElement('h2'); titleEl.style.cssText = 'color:white;margin:0 0 10px;'; titleEl.textContent = title;
  const messageEl = document.createElement('p'); messageEl.style.cssText = 'color:#a0c4ff;font-size:14px;margin:0 0 30px;'; messageEl.textContent = message;
  const button = document.createElement('button'); button.textContent = '🏠 العودة للرئيسية';
  button.style.cssText = 'background:linear-gradient(90deg,#4A90E2,#8A2BE2);color:white;border:none;padding:12px 30px;border-radius:12px;font-weight:bold;cursor:pointer;';
  button.addEventListener('click', goHome);
  emptyPage.append(iconEl, titleEl, messageEl, button);
  emptyPage.classList.add('active');
  safeAddActive('page-nav');
}

function openFavorites() { showEmptyPage('المفضلة', '❤️', 'لا توجد منتجات في المفضلة بعد'); }
function openCart() { showEmptyPage('السلة', '🛒', 'السلة فاضية'); }
function openSupport() { showEmptyPage('الدعم الفني', '🎧', 'تواصل معنا عبر تيليجرام أو البريد'); }

/* ============================================================
   إغلاق لوحة التحكم + العودة
   ============================================================ */
const closeAdminBtn = document.getElementById('close-admin');
if (closeAdminBtn) {
  closeAdminBtn.addEventListener('click', () => {
    safeRemoveActive('page-admin');
    safeAddActive('page-empty');
  });
}

function returnToNav() {
  safeRemoveActive('page-empty');
  safeAddActive('page-home');
  safeAddActive('page-nav');
}

// تهيئة التطبيق والتحقق من هوية المستخدم عند تحميل الصفحة.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', fetchUserRole, { once: true });
} else {
  fetchUserRole();
}
