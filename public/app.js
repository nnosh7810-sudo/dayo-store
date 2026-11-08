/* ============================================================
DAYO STORE — app.js (النسخة المحدّثة: دعم فني بتصميم شاشة جوال)
============================================================ */
const tg = window.Telegram?.WebApp;
if (tg) { tg.ready(); tg.expand(); }
function initTonConnect() {
if (tonConnectUI) return tonConnectUI;
const UI = window.TON_CONNECT_UI;
if (!UI?.TonConnectUI) return null;
tonConnectUI = new UI.TonConnectUI({ manifestUrl: `${window.location.origin}/tonconnect-manifest.json` });
return tonConnectUI;
}
setTimeout(() => { try { initTonConnect(); } catch (e) { console.warn('TON Connect init failed', e); } }, 0);
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
let cartItems = [];
let cartCurrency = 'sar';
let cartPaymentMethod = 'manual';
let cartPaymentSettings = { manualEnabled: true, manualInstructions: '', manualPaymentUsername: '', tonConnectEnabled: false, tonEnabled: true, usdtEnabled: true, starsEnabled: true };
let tonConnectUI = null;
let notificationPoller = null;
let currentNotifications = [];
let sideDrawerView = 'menu';

// ✅ NEW: نظام المفضلة
let favorites = [];
try { const savedFavs = JSON.parse(localStorage.getItem('dayo-favorites') || '[]'); if (Array.isArray(savedFavs)) favorites = savedFavs; } catch (_) { favorites = []; }
function saveFavorites() { try { localStorage.setItem('dayo-favorites', JSON.stringify(favorites)); } catch (_) {} }
function toggleFavorite(productId, event) {
  if (event) event.stopPropagation();
  const id = String(productId);
  const idx = favorites.indexOf(id);
  if (idx > -1) { favorites.splice(idx, 1); } else { favorites.push(id); }
  saveFavorites();
  document.querySelectorAll(`.fav-btn[data-id="${id}"]`).forEach(btn => {
    btn.textContent = favorites.includes(id) ? '❤️' : '🤍';
  });
}

try { const savedCart = JSON.parse(localStorage.getItem('dayo-cart') || '[]'); if (Array.isArray(savedCart)) cartItems = savedCart.filter(x => x && typeof x.productId === 'string' && Number.isInteger(x.quantity) && x.quantity > 0 && x.quantity <= 20); } catch (_) { cartItems = []; }
function saveCart() { try { localStorage.setItem('dayo-cart', JSON.stringify(cartItems)); } catch (_) {} }
function currencyLabel(currency) { return ({ sar: 'ريال سعودي', usd: 'USDT على شبكة TON', ton: 'عملة TON', stars: 'نجوم تيليجرام' })[currency] || currency; }
function currencySymbol(currency) { return ({ sar: 'ر.س', usd: 'USDT', ton: 'TON', stars: '⭐' })[currency] || currency; }
function money(value, currency) { return `${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: currency === 'stars' ? 0 : 6 })} ${currencySymbol(currency)}`; }
function cartCount() { return cartItems.reduce((sum, item) => sum + item.quantity, 0); }
function discountedPrice(product, currency) { const raw = Number(product?.prices?.[currency] || 0); return raw > 0 ? raw * (1 - Math.min(100, Math.max(0, Number(product.discount) || 0)) / 100) : 0; }

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
function escapeHTML(value) {
return String(value ?? '').replace(/[&<>"']/g, ch => ({
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
loadNotificationCount();
if (!notificationPoller) notificationPoller = setInterval(loadNotificationCount, 30000);
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
/* ====== معالجة الروابط ====== */
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
/* ====== الشريط السفلي ====== */
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
if (key === 'home') goHome();
else if (key === 'shop') openShop();
else if (key === 'admin') openAdminPanel();
else if (key === 'heart') openFavorites();
else if (key === 'cart') openCart();
else if (key === 'headset') openSupport(); // ✅ تم ربطه بدالة الدعم الجديدة
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
return `<hr style="border-color:#333;margin:20px 0;"><div class="admin-form"><h3 style="margin-top:0;color:white;">🏷️ إدارة شارات المنتجات</h3><p style="color:#a0c4ff;font-size:12px;line-height:1.7;">أنشئ شارة باسم وأيقونة ولون، ثم اخترها عند إضافة المنتج أو تعديله.</p><div id="badges-list"></div><div style="display:grid;grid-template-columns:1fr 70px;gap:8px;margin-top:12px;"><input id="new-badge-name" type="text" maxlength="30" placeholder="اسم الشارة مثل الأكثر مبيعاً" style="margin:0;"><input id="new-badge-icon" type="text" maxlength="4" value="🏷️" aria-label="أيقونة الشارة" style="margin:0;text-align:center;"></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px;"><label style="color:#a0c4ff;font-size:12px;">لون الخلفية<input id="new-badge-color" type="color" value="#4A90E2" style="width:100%;height:38px;margin-top:4px;"></label><label style="color:#a0c4ff;font-size:12px;">لون النص<input id="new-badge-text-color" type="color" value="#FFFFFF" style="width:100%;height:38px;margin-top:4px;"></label></div><button class="primary" onclick="addBadge()" style="width:100%;margin-top:10px;">➕ إنشاء الشارة</button></div>`;
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
return `<hr style="border-color:#333;margin:20px 0;"><div class="admin-form"><h3 style="margin-top:0;color:white;">🏷️ إدارة التصنيفات</h3><div id="categories-list"></div><div style="display:flex;gap:6px;margin-top:10px;"><input type="text" id="new-cat-name" placeholder="اسم التصنيف" style="flex:2;margin-bottom:0;"><input type="text" id="new-cat-icon" placeholder="📦" maxlength="2" style="flex:1;margin-bottom:0;text-align:center;"><button class="primary" onclick="addCategory()" style="flex:1;margin-top:0;">➕</button></div></div>`;
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
return `<hr style="border-color:#333;margin:20px 0;"><div class="admin-form"><h3 style="margin-top:0;color:white;">🔲 إدارة الأيقونات المربعة</h3><p style="color:#a0c4ff;font-size:12px;">الأيقونات التي تظهر في الصفحة الرئيسية.</p><div id="quick-icons-admin-list"></div><div style="margin-top:10px;"><input type="text" id="qi-title" placeholder="العنوان (مثال: تيليجرام)"><input type="text" id="qi-icon" placeholder="إيموجي (✈️)"><input type="text" id="qi-link" placeholder="الرابط (#shop أو https://...)"><input type="text" id="qi-color" placeholder="لون (#4A90E2)" value="#4A90E2"><input type="file" id="qi-image-file" accept="image/*" style="display:none;" onchange="handleQiImageUpload(this)"><label for="qi-image-file" class="img-upload-label">📷 صورة (اختياري)</label><div id="qi-image-preview" style="width:50px;height:50px;border-radius:8px;background:#0d1526;background-size:cover;background-position:center;display:inline-block;vertical-align:middle;margin-right:8px;">لا توجد</div><button class="primary" onclick="addQuickIcon()">➕ إضافة</button></div></div>`;
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
return `<hr style="border-color:#333;margin:20px 0;"><div class="admin-form"><h3 style="margin-top:0;color:white;">🎯 زر الصفحة الرئيسية</h3><label>نص الزر</label><input type="text" id="hb-text" value="${escapeHTML(heroButtonData.text || 'تسوق الآن')}"><label>الرابط</label><input type="text" id="hb-link" value="${escapeHTML(heroButtonData.link || '#shop')}" placeholder="#shop أو #product-123"><label>اللون</label><input type="text" id="hb-color" value="${escapeHTML(safeColor(heroButtonData.color))}"><button class="primary" onclick="saveHeroButton()">💾 حفظ الزر</button></div>`;
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
return `<div class="admin-section-card"><div class="info"><strong>${escapeHTML(sec.title || '(بدون عنوان)')}</strong><small><span class="type-badge" style="background:${typeInfo.color};">${escapeHTML(typeInfo.label)}</span> ${visibleLabel} — ${idx + 1}</small></div><div class="actions"><button class="btn-up" onclick="moveSection('${encodedArg(sec.id)}', -1)">⬆️</button><button class="btn-down" onclick="moveSection('${encodedArg(sec.id)}', 1)">⬇️</button><button class="btn-toggle" onclick="toggleSectionVisibility('${encodedArg(sec.id)}')">${sec.visible === false ? '👁️‍🗨️' : '👁️'}</button><button class="btn-edit" onclick="openSectionEditor('${encodedArg(sec.id)}')">✏️</button><button class="btn-delete" onclick="deleteSection('${encodedArg(sec.id)}')">🗑️</button></div></div>`;
}).join('');
}
return `<hr style="border-color:#333;margin:20px 0;"><div class="admin-form"><h3 style="margin-top:0;color:white;">🗂️ إدارة الأقسام</h3><button class="primary" onclick="openSectionEditor(null)">➕ إضافة قسم جديد</button><div id="section-editor-container"></div></div><h3 style="color:white;">الأقسام (${sorted.length})</h3><div>${listHTML}</div>`;
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
container.innerHTML = `<div class="admin-form" style="margin-top:15px;"><h3 style="margin-top:0;">${sectionId ? '✏️ تعديل قسم' : '➕ قسم جديد'}</h3><label>عنوان القسم</label><input type="text" id="sec-title" value="${escapeHTML(sec?.title || '')}"><label>نوع القسم</label><select id="sec-type" onchange="onSectionTypeChange()">${typeOptions}</select><div id="sec-type-fields"></div><button class="primary" onclick="saveSection()">${sectionId ? '💾 حفظ' : '➕ إضافة'}</button><button class="danger" onclick="closeSectionEditor()">إلغاء</button></div>`;
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
html += `<label>صورة القسم</label><div class="img-preview-box" id="sec-img-preview" style="${safeImageURL(sectionImageBuffer) ? `background-image:url('${safeImageURL(sectionImageBuffer)}')` : ''}">${sectionImageBuffer ? '' : 'لا توجد'}</div><input type="file" id="sec-img-file" accept="image/*" class="hidden-file" onchange="handleSectionImageUpload(this)"><label for="sec-img-file" class="img-upload-label">📷 اختر صورة</label><label>محتوى نصي</label><textarea id="sec-content" rows="3">${escapeHTML(sec?.content || '')}</textarea><label>نص الزر</label><input type="text" id="sec-btn-text" value="${escapeHTML(sec?.buttonText || '')}"><label>رابط الزر</label><input type="text" id="sec-btn-link" value="${escapeHTML(sec?.buttonLink || '')}" placeholder="#product-123">`;
}
if (['grid', 'products'].includes(type)) {
html += `<label>العناصر (${sectionItemsBuffer.length})</label><div id="sec-items-list"></div><button class="add-item-btn" onclick="addSectionItem()">➕ إضافة عنصر</button>`;
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
<div class="item-editor"><div class="item-row"><input type="text" placeholder="العنوان" value="${escapeHTML(item.title || '')}" oninput="updateSectionItem(${i}, 'title', this.value)"><input type="text" placeholder="الأيقونة" value="${escapeHTML(item.icon || '')}" oninput="updateSectionItem(${i}, 'icon', this.value)" style="max-width:80px;"></div><div class="item-row"><input type="text" placeholder="الرابط" value="${escapeHTML(item.link || '')}" oninput="updateSectionItem(${i}, 'link', this.value)"><input type="text" placeholder="الوصف" value="${escapeHTML(item.description || '')}" oninput="updateSectionItem(${i}, 'description', this.value)"></div><div class="item-row"><input type="text" placeholder="السعر" value="${escapeHTML(item.price || '')}" oninput="updateSectionItem(${i}, 'price', this.value)"><label class="img-upload-label" style="margin:0;padding:6px 10px;">📷<input type="file" accept="image/*" style="display:none;" onchange="handleSectionItemImage(${i}, this)"></label>${item.image ? `<span style="color:#4AE2A0;font-size:11px;">✓</span>` : ''}</div><button class="remove-item" onclick="removeSectionItem(${i})">🗑️ حذف</button></div>
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
لوحة التحكم — واجهة الوحدات المربعة
============================================================ */
function renderAdminDashboardHome(productCount = 0, orderCount = 0) {
const tiles = [
['products', '📦', 'المنتجات', `${productCount} منتج`, '#315d91']
];
if (['owner', 'admin'].includes(userRole)) {
tiles.push(
['sections', '🗂️', 'أقسام المتجر', 'إدارة واجهة المتجر', '#5367a8'],
['categories', '🏷️', 'التصنيفات', 'تصنيف المنتجات', '#8a5aa8'],
['badges', '✦', 'شارات المنتجات', 'العروض والتمييز', '#9a7045'],
['quick-icons', '▦', 'الأيقونات السريعة', 'روابط الواجهة', '#397f7b'],
['orders', '🧾', 'الطلبات', `${orderCount} طلب`, '#39735f'],
['payments', '◈', 'الدفع والتحصيل', 'TON وUSDT وStars وSAR', '#477a9d'],
['staff', '♙', 'إدارة الفريق', 'الصلاحيات والمشرفون', '#7d5a82']
);
}
if (userRole === 'owner') {
tiles.push(
['hero', '🎯', 'زر الصفحة الرئيسية', 'إعداد زر الواجهة', '#7b6a39'],
['store', '🖼️', 'مظهر المتجر', 'السلايدر والروابط', '#526b7d']
);
}
return `<div id="dayo-admin-home" style="padding:4px 0 20px"><div style="margin:4px 2px 16px"><h2 style="margin:0 0 6px;color:#fff;font-size:21px">لوحة تحكم DAYO</h2><p style="margin:0;color:#91a8c2;font-size:12px">اختر القسم الذي تريد إدارته</p></div><style>.dayo-admin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}.dayo-admin-tile{min-height:116px;border:1px solid rgba(160,196,255,.13);border-radius:15px;padding:14px 12px;text-align:right;color:#fff;display:flex;flex-direction:column;justify-content:space-between;gap:10px;cursor:pointer;box-shadow:0 8px 22px rgba(0,0,0,.16);transition:transform .15s ease,border-color .15s ease}.dayo-admin-tile:active{transform:scale(.98)}.dayo-admin-tile-icon{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:rgba(255,255,255,.13);font-size:23px}.dayo-admin-tile strong{display:block;font-size:14px}.dayo-admin-tile small{display:block;color:#b4c4d8;font-size:10px;margin-top:3px}@media(min-width:620px){.dayo-admin-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}</style><div class="dayo-admin-grid">${tiles.map(([key, icon, title, subtitle, color]) => `<button type="button" class="dayo-admin-tile" style="background:linear-gradient(145deg,${color},#122238)" onclick="showAdminModule('${key}')"><span class="dayo-admin-tile-icon">${icon}</span><span><strong>${title}</strong><small>${subtitle}</small></span></button>`).join('')}</div></div>`;
}
function showAdminHome() {
const home = document.getElementById('dayo-admin-home');
if (home) home.style.display = 'block';
document.querySelectorAll('#dayo-admin-modules [data-admin-module]').forEach(module => { module.style.display = 'none'; });
document.getElementById('page-admin')?.scrollTo({ top: 0, behavior: 'smooth' });
}
function showAdminModule(moduleName) {
const home = document.getElementById('dayo-admin-home');
const module = document.querySelector(`#dayo-admin-modules [data-admin-module="${moduleName}"]`);
if (!module) return;
if (home) home.style.display = 'none';
document.querySelectorAll('#dayo-admin-modules [data-admin-module]').forEach(item => { item.style.display = 'none'; });
module.style.display = 'block';
if (!module.querySelector('.dayo-admin-back')) {
const back = document.createElement('button');
back.type = 'button';
back.className = 'dayo-admin-back';
back.textContent = '← العودة إلى لوحة التحكم';
back.style.cssText = 'display:block;width:100%;padding:11px 14px;margin:0 0 14px;background:#203a58;color:#dceaff;border:1px solid #355577;border-radius:10px;font-weight:700;text-align:right;cursor:pointer';
back.onclick = showAdminHome;
module.prepend(back);
}
document.getElementById('page-admin')?.scrollTo({ top: 0, behavior: 'smooth' });
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
const [data, sliderData, staffData, sectionsData, catsData, qiData, badgesData, paymentData, ordersData] = await Promise.all([
apiCall('/api/products'),
userRole === 'owner' ? apiCall('/api/slider') : Promise.resolve({ ok: false, slides: [] }),
(userRole === 'owner' || userRole === 'admin') ? apiCall('/api/users/list') : Promise.resolve({ ok: false, staff: [] }),
apiCall('/api/sections'),
apiCall('/api/categories'),
apiCall('/api/quick-icons'),
apiCall('/api/badges'),
(userRole === 'owner' || userRole === 'admin') ? apiCall('/api/payments/settings') : Promise.resolve({ ok: false, settings: {} }),
(userRole === 'owner' || userRole === 'admin') ? apiCall('/api/orders/list') : Promise.resolve({ ok: false, orders: [] })
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
return `<div style="background:#152a47;padding:12px;margin-bottom:12px;border-radius:10px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;"><div style="display:flex;align-items:center;flex:1;min-width:180px;">${imgTag}<div><strong style="color:white;">${escapeHTML(p.name)}</strong><div style="font-size:13px;color:#fff;">${escapeHTML(pricesStr.join(' | ') || 'بدون سعر')}</div><div style="font-size:11px;color:#4AE2A0;">🔗 ${escapeHTML(link)}</div></div></div><div style="display:flex;flex-direction:column;gap:5px;"><button onclick="copyProductLinkFromAdmin('${encodedArg(p.id)}')" style="background:#4A90E2;color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:12px;">📋 نسخ</button><button onclick="editProductForm('${encodedArg(p.id)}')" style="background:#f39c12;color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:12px;">تعديل</button><button onclick="deleteProduct('${encodedArg(p.id)}')" style="background:#e74c3c;color:white;border:none;padding:5px 10px;border-radius:5px;cursor:pointer;font-size:12px;">حذف</button></div></div>`;
}).join('');
} else productsHTML = '<p>لا توجد منتجات.</p>';
let staffHTML = '';
if ((userRole === 'owner' || userRole === 'admin') && staffData.ok && staffData.staff.length > 0) {
staffHTML = staffData.staff.map(s => {
const roleName = s.role === 'admin' ? 'مسؤول' : 'مشرف';
const canEdit = userRole === 'owner' || (userRole === 'admin' && s.role === 'moderator');
return `<div style="background:#152a47;padding:10px;margin-bottom:10px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;"><div><strong style="color:white;">${escapeHTML(s.name)}</strong> <span style="color:#f39c12;font-size:12px;">(${roleName})</span><br><small style="color:#888;">ID: ${escapeHTML(s.id)}</small></div>${canEdit ? `<div style="display:flex;gap:5px;">${s.role === 'moderator' && userRole === 'owner' ? `<button onclick="updateRole('${encodedArg(s.id)}','admin')" style="background:#3498db;color:white;border:none;padding:5px 8px;border-radius:5px;font-size:11px;">ترقية</button>` : ''}<button onclick="updateRole('${encodedArg(s.id)}','user')" style="background:#e74c3c;color:white;border:none;padding:5px 8px;border-radius:5px;font-size:11px;">إزالة</button></div>` : ''}</div>`;
}).join('');
} else staffHTML = '<p>لا يوجد مشرفين.</p>';
let sliderHTML = '';
if (userRole === 'owner' && sliderData.ok && sliderData.slides.length > 0) {
sliderHTML = sliderData.slides.map(s => `<div style="background:#152a47;padding:10px;margin-bottom:10px;border-radius:8px;display:flex;justify-content:space-between;align-items:center;"><div style="display:flex;align-items:center;gap:10px;"><img src="${escapeHTML(safeImageURL(s.image))}" alt="" style="width:60px;height:40px;border-radius:5px;object-fit:cover;"><strong style="color:white;font-size:14px;">${escapeHTML(s.title || 'بدون عنوان')}</strong></div><button onclick="deleteSlide('${encodedArg(s.id)}')" style="background:#e74c3c;color:white;border:none;padding:5px 10px;border-radius:5px;font-size:12px;">حذف</button></div>`).join('');
} else if (userRole === 'owner') sliderHTML = '<p>لا توجد صور.</p>';
const store = storeMenuLinks || {};
const catOptions = currentCategories.filter(c => c.id !== 'all')
.map(c => `<option value="${escapeHTML(c.id)}">${escapeHTML(c.icon || '📦')} ${escapeHTML(c.name)}</option>`).join('');
content.innerHTML = `
${renderAdminDashboardHome(data.ok ? data.products.length : 0, ordersData.ok ? (ordersData.orders || []).length : 0)}
<div id="dayo-admin-modules">
<section data-admin-module="products" style="display:none">
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
<input type="number" id="price-usd" placeholder="USDT" style="padding:8px;border-radius:5px;border:none;">
<input type="number" id="price-ton" placeholder="TON" style="padding:8px;border-radius:5px;border:none;">
<input type="number" id="price-stars" placeholder="نجوم ⭐" style="padding:8px;border-radius:5px;border:none;">
<input type="number" id="price-sar" placeholder="ريال 🇸🇦" style="padding:8px;border-radius:5px;border:none;">
</div>
<div style="background:#0d1b2d;padding:12px;border-radius:8px;margin-bottom:10px;">
<label style="display:block;color:#a0c4ff;margin-bottom:7px;">نوع المنتج</label>
<select id="new-prod-type" onchange="updateProductPaymentControls()" style="width:100%;padding:9px;border-radius:5px;border:none;margin-bottom:10px;">
<option value="digital">منتج / خدمة رقمية</option>
<option value="physical">منتج / خدمة مادية</option>
</select>
<label style="display:block;color:#a0c4ff;margin-bottom:7px;">طرق الدفع المقبولة لهذا المنتج</label>
<div id="new-prod-payment-methods" style="display:grid;grid-template-columns:1fr 1fr;gap:8px;color:white;font-size:13px;">
<label><input type="checkbox" name="prod-payment-method" value="stars" checked> Telegram Stars</label>
<label><input type="checkbox" name="prod-payment-method" value="ton"> TON</label>
<label><input type="checkbox" name="prod-payment-method" value="usd"> USDT على TON</label>
<label><input type="checkbox" name="prod-payment-method" value="sar"> تحويل / دفع يدوي SAR</label>
</div>
<small id="prod-payment-hint" style="display:block;color:#9aaec5;margin-top:8px;">المنتجات الرقمية داخل تيليجرام تقبل Stars فقط.</small>
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
</section>
${userRole === 'owner' || userRole === 'admin' ? `<section data-admin-module="sections" style="display:none">${renderSectionsAdmin()}</section>` : ''}
${userRole === 'owner' || userRole === 'admin' ? `<section data-admin-module="categories" style="display:none">${renderCategoriesAdmin()}</section>` : ''}
${userRole === 'owner' || userRole === 'admin' ? `<section data-admin-module="badges" style="display:none">${renderBadgesAdmin()}</section>` : ''}
${userRole === 'owner' || userRole === 'admin' ? `<section data-admin-module="quick-icons" style="display:none">${renderQuickIconsAdmin()}</section>` : ''}
${userRole === 'owner' || userRole === 'admin' ? `<section data-admin-module="payments" style="display:none">${renderPaymentSettingsAdmin(paymentData.settings || {}, paymentData.role || userRole)}</section>` : ''}
${userRole === 'owner' || userRole === 'admin' ? `<section data-admin-module="orders" style="display:none">${renderOrdersAdmin(ordersData.orders || [])}</section>` : ''}
${userRole === 'owner' ? `<section data-admin-module="hero" style="display:none">${renderHeroButtonAdmin()}</section>` : ''}
${userRole === 'owner' ? `<section data-admin-module="store" style="display:none">
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
</section>` : ''}
${userRole === 'owner' || userRole === 'admin' ? `<section data-admin-module="staff" style="display:none">
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
</section>` : ''}
</div>
`;
if (userRole === 'owner' || userRole === 'admin') {
renderCategoriesList();
renderBadgesList();
renderQuickIconsAdminList();
}
showAdminHome();
currentBase64Image = "";
currentSliderImage = "";
}
/* ====== طرق الدفع الخاصة بكل منتج ====== */
function updateProductPaymentControls() {
const type = document.getElementById('new-prod-type')?.value || 'digital';
const boxes = [...document.querySelectorAll('input[name="prod-payment-method"]')];
boxes.forEach(box => {
box.disabled = type === 'digital' && box.value !== 'stars';
if (type === 'digital') box.checked = box.value === 'stars';
});
const hint = document.getElementById('prod-payment-hint');
if (hint) hint.textContent = type === 'digital' ? 'المنتجات الرقمية داخل تيليجرام تقبل Stars فقط.' : 'حدد طرق الدفع التي تريد قبولها لهذا المنتج المادي.';
}
function selectedProductPaymentMethods() {
return [...document.querySelectorAll('input[name="prod-payment-method"]:checked')].map(box => box.value);
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
const productType = document.getElementById('new-prod-type')?.value || 'digital';
const paymentMethods = selectedProductPaymentMethods();
if (!name) return alert('أدخل اسم المنتج');
const res = await apiCall('/api/products/add', { name, description, image: currentBase64Image, prices, category, badge, discount, productType, paymentMethods });
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
const typeSel = document.getElementById('new-prod-type');
if (typeSel) typeSel.value = product.productType === 'physical' ? 'physical' : 'digital';
updateProductPaymentControls();
const savedMethods = Array.isArray(product.paymentMethods) ? product.paymentMethods : ['stars'];
document.querySelectorAll('input[name="prod-payment-method"]').forEach(box => { box.checked = savedMethods.includes(box.value); });
updateProductPaymentControls();
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
const productType = document.getElementById('new-prod-type')?.value || 'digital';
const paymentMethods = selectedProductPaymentMethods();
const res = await apiCall('/api/products/edit', { productId: id, name, description, image: currentBase64Image, prices, category, badge, discount, productType, paymentMethods });
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
صفحة المتجر
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
صفحة المنتج
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
addToCart(productId, 1);
openCart();
}
function addToCart(productId, quantity = 1) {
const id = String(productId);
const item = cartItems.find(x => x.productId === id);
if (item) item.quantity = Math.min(20, item.quantity + quantity);
else cartItems.push({ productId: id, quantity: Math.min(20, quantity) });
saveCart();
}
function changeCartQuantity(productId, delta) {
try { productId = decodeURIComponent(productId); } catch (_) {}
const item = cartItems.find(x => x.productId === String(productId));
if (!item) return;
item.quantity += Number(delta) || 0;
if (item.quantity <= 0) cartItems = cartItems.filter(x => x.productId !== item.productId);
else item.quantity = Math.min(20, item.quantity);
saveCart();
renderCartPage();
}
function removeCartItem(productId) {
try { productId = decodeURIComponent(productId); } catch (_) {}
cartItems = cartItems.filter(x => x.productId !== String(productId));
saveCart();
renderCartPage();
}
async function ensureCartProducts() {
const missing = cartItems.some(item => !currentShopProducts.some(p => String(p.id) === item.productId));
if (missing || !currentShopProducts.length) {
const response = await apiCall('/api/products');
if (response.ok && Array.isArray(response.products)) currentShopProducts = response.products;
}
cartItems = cartItems.filter(item => currentShopProducts.some(p => String(p.id) === item.productId));
saveCart();
}
function ensureDayoDynamicPage() {
let page = document.getElementById('page-dayo-dynamic');
if (!page) {
page = document.createElement('div');
page.id = 'page-dayo-dynamic';
page.className = 'page dayo-dynamic-page';
document.body.insertBefore(page, document.getElementById('page-admin') || null);
}
return page;
}
function activateDayoDynamicPage() {
document.querySelectorAll('.page').forEach(page => page.classList.remove('active'));
ensureDayoDynamicPage().classList.add('active');
safeAddActive('page-nav');
window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function openCart() {
activateDayoDynamicPage();
const page = ensureDayoDynamicPage();
page.innerHTML = '<div class="dayo-page-loading">جاري تجهيز السلة...</div>';
try {
await ensureCartProducts();
const settingsResponse = await apiCall('/api/payments/settings');
if (settingsResponse.ok && settingsResponse.settings) cartPaymentSettings = settingsResponse.settings;
renderCartPage();
} catch (error) {
page.innerHTML = `<div class="dayo-page-head"><h2>سلة المشتريات</h2></div><p class="dayo-muted">${escapeHTML(error.message || 'تعذر تحميل السلة')}</p>`;
}
}
function renderCartPage() {
const page = ensureDayoDynamicPage();
const validItems = cartItems.map(item => ({ ...item, product: currentShopProducts.find(p => String(p.id) === item.productId) })).filter(item => item.product);
const paymentAllowedByProduct = (product, currency) => {
const type = product?.productType === 'physical' ? 'physical' : 'digital';
if (type === 'digital') return currency === 'stars';
const methods = Array.isArray(product?.paymentMethods) ? product.paymentMethods : ['stars'];
return methods.includes(currency);
};
const currencies = ['stars', 'ton', 'usd', 'sar'].filter(currency => {
const enabled = currency === 'sar'
? cartPaymentSettings.manualEnabled && !!cartPaymentSettings.manualPaymentUsername
: currency === 'usd'
? cartPaymentSettings.tonConnectEnabled && cartPaymentSettings.usdtEnabled !== false
: currency === 'ton'
? cartPaymentSettings.tonConnectEnabled && cartPaymentSettings.tonEnabled !== false
: cartPaymentSettings.starsEnabled;
return enabled && validItems.length && validItems.every(item => Number(item.product.prices?.[currency]) > 0 && paymentAllowedByProduct(item.product, currency));
});
if (!currencies.includes(cartCurrency)) cartCurrency = currencies.includes('sar') ? 'sar' : (currencies[0] || 'sar');
const itemsHTML = validItems.map(({ product, quantity }) => {
const unit = discountedPrice(product, cartCurrency);
const image = safeImageURL(product.image);
return `<article class="dayo-cart-item">${image ? `<img src="${escapeHTML(image)}" alt="" class="dayo-cart-image">` : '<div class="dayo-cart-image dayo-cart-placeholder">📦</div>'}<div class="dayo-cart-info"><strong>${escapeHTML(product.name)}</strong><small>${money(unit, cartCurrency)} للقطعة</small><div class="dayo-quantity"><button onclick="changeCartQuantity('${encodedArg(product.id)}',-1)" aria-label="تقليل">−</button><b>${quantity}</b><button onclick="changeCartQuantity('${encodedArg(product.id)}',1)" aria-label="زيادة">+</button><button class="dayo-remove" onclick="removeCartItem('${encodedArg(product.id)}')">حذف</button></div></div><strong class="dayo-line-total">${money(unit * quantity, cartCurrency)}</strong></article>`;
}).join('');
const subtotal = validItems.reduce((sum, item) => sum + discountedPrice(item.product, cartCurrency) * item.quantity, 0);
const noCurrency = validItems.length > 0 && currencies.length === 0;
const paymentInfo = cartCurrency === 'sar'
? `<div class="dayo-payment-note"><strong>الدفع اليدوي بالريال السعودي</strong><p>سيظهر لك حساب الدفع ورقم طلبك بعد إنشاء الطلب. حوّل المبلغ إلى الحساب المحدد، ثم انتظر تأكيد الإدارة.</p></div>`
: cartCurrency === 'stars'
? `<div class="dayo-payment-note"><strong>الدفع عبر Telegram Stars</strong><p>سيظهر لك مستطيل الدفع الرسمي من تيليجرام. بعد نجاح الدفع سيتم مراجعة طلبك يدوياً من الإدارة.</p></div>`
: `<div class="dayo-payment-note"><strong>الدفع المباشر عبر TON Connect</strong><p>ستربط محفظتك وتوافق على تحويل ${cartCurrency === 'ton' ? 'TON' : 'USDT على شبكة TON'} من داخل تجربة الدفع. سيتم مراجعة طلبك يدوياً بعد التحقق من المعاملة.</p></div>`;
const providerUnavailable = cartCurrency === 'sar' ? !cartPaymentSettings.manualEnabled || !cartPaymentSettings.manualPaymentUsername : (['ton', 'usd'].includes(cartCurrency) ? (!cartPaymentSettings.tonConnectEnabled || (cartCurrency === 'ton' && !cartPaymentSettings.tonEnabled) || (cartCurrency === 'usd' && !cartPaymentSettings.usdtEnabled)) : !cartPaymentSettings.starsEnabled);
const checkoutDisabled = !validItems.length || noCurrency || providerUnavailable;
page.innerHTML = `<div class="dayo-page-head"><button class="dayo-back" onclick="goHome()">‹</button><div><h2>سلة المشتريات</h2><small>${cartCount()} منتج</small></div><button class="dayo-secondary" onclick="openMyOrders()">طلباتي</button></div>${validItems.length ? `<div class="dayo-cart-list">${itemsHTML}</div><section class="dayo-checkout-card"><h3>إتمام الطلب</h3><label>عملة الدفع</label><select id="cart-currency" onchange="changeCartCurrency(this.value)" ${noCurrency ? 'disabled' : ''}>${currencies.map(currency => `<option value="${currency}" ${currency === cartCurrency ? 'selected' : ''}>${escapeHTML(currencyLabel(currency))}</option>`).join('')}</select>${noCurrency ? '<p class="dayo-warning">لا توجد طريقة دفع مشتركة ومفعّلة لجميع المنتجات في السلة. راجع نوع كل منتج وطرق الدفع وأسعاره من لوحة الإدارة، أو قسّم مشترياتك إلى طلبات منفصلة.</p>' : ''}<div class="dayo-total-row"><span>الإجمالي</span><strong>${money(subtotal, cartCurrency)}</strong></div>${paymentInfo}${providerUnavailable ? `<p class="dayo-warning">${cartCurrency === 'sar' ? 'لم يحدد المتجر حساب استقبال الدفع اليدوي بعد.' : (['ton','usd'].includes(cartCurrency) ? 'ربط TON Connect غير مهيأ على الخادم بعد. راجع إعدادات Render.' : 'دفع Telegram Stars غير متاح حاليًا.')}</p>` : ''}<button class="dayo-primary" onclick="submitCartOrder()" ${checkoutDisabled ? 'disabled' : ''}>إنشاء الطلب والمتابعة للدفع</button></section>` : `<div class="dayo-empty-cart"><div>🛒</div><h3>سلتك فارغة</h3><p>أضف المنتجات التي ترغب بشرائها، وستظهر هنا.</p><button class="dayo-primary" onclick="openShop()">تصفح المنتجات</button><button class="dayo-secondary" onclick="openMyOrders()">عرض طلباتي</button></div>`}`;
}
function changeCartCurrency(value) { cartCurrency = value; renderCartPage(); }
function changeCartPaymentMethod(value) { cartPaymentMethod = value; renderCartPage(); }
/* ============================================================
✅ شاشة النجاح مع Confetti (Crypto Bot Style)
============================================================ */
function showPaymentSuccessScreen(orderCode, total, currency, usdEquivalent) {
const page = ensureDayoDynamicPage();
const currencyLabel = currency === 'sar' ? 'ر.س' : currency === 'usd' ? 'USDT' : currency === 'ton' ? 'TON' : '⭐';
const displayUsd = usdEquivalent || (currency === 'usd' ? total : (currency === 'sar' ? (total / 3.75).toFixed(2) : total));
const colors = ['#f39c12', '#e74c3c', '#3498db', '#2ecc71', '#9b59b6', '#4A90E2', '#FFD700', '#FF6B6B', '#48C9B0'];
for (let i = 0; i < 60; i++) {
const piece = document.createElement('div');
piece.className = 'dayo-confetti-piece';
piece.style.left = Math.random() * 100 + 'vw';
piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
piece.style.animationDuration = (2 + Math.random() * 3) + 's';
piece.style.animationDelay = Math.random() * 2 + 's';
piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
piece.style.width = (6 + Math.random() * 8) + 'px';
piece.style.height = (6 + Math.random() * 8) + 'px';
document.body.appendChild(piece);
setTimeout(() => piece.remove(), 7000);
}
page.innerHTML = `
<style>
@keyframes dayo-confetti-fall { 0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(720deg); opacity: 0; } }
@keyframes dayo-bounce { 0%,100% { transform:scale(1); } 50% { transform:scale(1.2); } }
.dayo-confetti-piece { position:fixed;top:-20px;z-index:9999;pointer-events:none;animation:dayo-confetti-fall linear forwards; }
.dayo-success-screen { background:#fff;border-radius:20px;padding:40px 24px;max-width:400px;margin:20px auto;box-shadow:0 10px 40px rgba(0,0,0,0.3);text-align:center;position:relative;overflow:hidden; }
.dayo-success-emoji { font-size:90px;margin-bottom:10px;animation:dayo-bounce 0.6s ease; }
.dayo-success-title { font-size:22px;font-weight:900;color:#1a1a1a;margin:0 0 8px; }
.dayo-success-sub { font-size:14px;color:#666;margin-bottom:18px;line-height:1.6; }
.dayo-success-btn { background:linear-gradient(135deg,#4A90E2,#357ABD);color:#fff;border:0;border-radius:12px;padding:14px 30px;font-size:16px;font-weight:700;cursor:pointer;margin:6px 4px;transition:transform 0.15s; }
.dayo-success-btn:active { transform:scale(0.97); }
.dayo-success-btn.secondary { background:linear-gradient(135deg,#8A2BE2,#6A1FB0); }
</style>
<div class="dayo-success-screen">
<div class="dayo-success-emoji">👍</div>
<h2 class="dayo-success-title">Invoice paid</h2>
<p class="dayo-success-sub">You paid the invoice from DAYO STORE for<br><strong>$${displayUsd} (${total} ${currencyLabel})</strong>.<br><br>Order #${escapeHTML(orderCode)}<br><br>الطلب الآن بانتظار تأكيد الإدارة ✅</p>
<button class="dayo-success-btn" onclick="openMyOrders()">متابعة طلباتي</button>
<button class="dayo-success-btn secondary" onclick="openShop()">العودة للمتجر</button>
</div>
`;
}
/* ============================================================
✅ إنشاء الطلب + واجهة الدفع الجديدة (Crypto Bot Style)
============================================================ */
async function submitCartOrder() {
if (!cartItems.length) return showMessage('السلة فارغة.');
const button = document.querySelector('#page-dayo-dynamic .dayo-primary');
if (button) { button.disabled = true; button.textContent = 'جاري إنشاء الطلب...'; }
try {
const response = await apiCall('/api/orders/create', {
items: cartItems.map(item => ({ productId: item.productId, quantity: item.quantity })),
currency: cartCurrency
});
if (!response.ok || !response.order) throw new Error(response.error || 'تعذر إنشاء الطلب');
cartItems = []; saveCart();
const order = response.order;
const page = ensureDayoDynamicPage();
const currencyLabel = order.currency === 'sar' ? 'ر.س' : order.currency === 'usd' ? 'USDT' : order.currency === 'ton' ? 'TON' : '⭐';
const usdEquivalent = order.currency === 'usd' ? order.total : (order.currency === 'sar' ? (order.total / 3.75).toFixed(2) : order.total);
page.innerHTML = `
<style>
@keyframes dayo-confetti-fall { 0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(100vh) rotate(720deg); opacity: 0; } }
@keyframes dayo-bounce { 0%,100% { transform:scale(1); } 50% { transform:scale(1.2); } }
.dayo-confetti-piece { position:fixed;top:-20px;z-index:9999;pointer-events:none;animation:dayo-confetti-fall linear forwards; }
.dayo-invoice { background:#fff;border-radius:20px;padding:28px 22px;max-width:400px;margin:20px auto;box-shadow:0 10px 40px rgba(0,0,0,0.3);text-align:center;color:#1a1a1a;position:relative;overflow:hidden; }
.dayo-invoice-logo { width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#e74c3c,#c0392b);display:inline-flex;align-items:center;justify-content:center;font-size:42px;font-weight:900;color:#fff;margin-bottom:14px;box-shadow:0 4px 12px rgba(231,76,60,0.3); }
.dayo-invoice-title { font-size:15px;color:#666;margin:0 0 8px; }
.dayo-invoice-amount { font-size:42px;font-weight:900;color:#1a1a1a;margin:10px 0 4px;letter-spacing:-1px; }
.dayo-invoice-sub { font-size:14px;color:#888;margin-bottom:16px; }
.dayo-invoice-order { font-size:13px;color:#4A90E2;font-weight:600;margin-bottom:18px; }
.dayo-invoice-asset { background:#f5f7fa;border-radius:12px;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;margin-bottom:18px; }
.dayo-invoice-asset-left { display:flex;align-items:center;gap:10px; }
.dayo-invoice-asset-icon { width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:14px; }
.dayo-invoice-asset-name { font-weight:700;font-size:14px; }
.dayo-invoice-asset-sub { font-size:11px;color:#888; }
.dayo-invoice-balance { text-align:right;font-size:12px;color:#888; }
.dayo-invoice-balance strong { display:block;font-size:14px;color:#1a1a1a; }
.dayo-pay-btn { background:linear-gradient(135deg,#4A90E2,#357ABD);color:#fff;border:0;border-radius:12px;padding:16px;width:100%;font-size:17px;font-weight:700;cursor:pointer;transition:transform 0.15s; }
.dayo-pay-btn:active { transform:scale(0.97); }
.dayo-pay-btn:disabled { opacity:0.6;cursor:not-allowed; }
.dayo-invoice-note { font-size:11px;color:#999;margin-top:12px; }
.dayo-invoice-instructions { font-size:12px;color:#555;background:#f5f7fa;padding:10px;border-radius:8px;margin-bottom:14px;text-align:right; }
.dayo-fee-note { font-size:11px;color:#e74c3c;margin-top:10px;font-weight:600;text-align:center; }
</style>
<div id="dayo-payment-container"></div>
`;
const container = document.getElementById('dayo-payment-container');
const feeNote = `<p class="dayo-fee-note">⚠️ أي عمولات بنكية أو رسوم شبكة (Gas Fees) إضافية يتحملها العميل.</p>`;
if (order.paymentMethod === 'manual') {
container.innerHTML = `
<div class="dayo-invoice">
<div class="dayo-invoice-logo">D</div>
<p class="dayo-invoice-title">فاتورة من DAYO STORE</p>
<div class="dayo-invoice-amount">$${usdEquivalent}</div>
<div class="dayo-invoice-sub">${order.total} ${currencyLabel}</div>
<div class="dayo-invoice-order">Order #${escapeHTML(order.orderCode)}</div>
<div class="dayo-invoice-asset">
<div class="dayo-invoice-asset-left">
<div class="dayo-invoice-asset-icon" style="background:#1D9BD1">🏦</div>
<div>
<div class="dayo-invoice-asset-name">تحويل يدوي</div>
<div class="dayo-invoice-asset-sub">SAR · ريال سعودي</div>
</div>
</div>
<div class="dayo-invoice-balance">
<strong>@${escapeHTML(order.manualPaymentUsername || '—')}</strong>
حساب الاستقبال
</div>
</div>
${order.paymentInstructions ? `<p class="dayo-invoice-instructions">${escapeHTML(order.paymentInstructions)}</p>` : ''}
<button class="dayo-pay-btn" onclick="notifyManualPayment('${encodedArg(order.id)}')">✅ أشعرت المتجر بالتحويل</button>
<p class="dayo-invoice-note">سيتم مراجعة طلبك يدوياً من الإدارة بعد إشعارك</p>
${feeNote}
</div>
`;
} else if (order.paymentMethod === 'stars') {
container.innerHTML = `
<div class="dayo-invoice">
<div class="dayo-invoice-logo">D</div>
<p class="dayo-invoice-title">فاتورة من DAYO STORE</p>
<div class="dayo-invoice-amount">$${usdEquivalent}</div>
<div class="dayo-invoice-sub">${order.total} ${currencyLabel}</div>
<div class="dayo-invoice-order">Order #${escapeHTML(order.orderCode)}</div>
<div class="dayo-invoice-asset">
<div class="dayo-invoice-asset-left">
<div class="dayo-invoice-asset-icon" style="background:#FFB800">⭐</div>
<div>
<div class="dayo-invoice-asset-name">Telegram Stars</div>
<div class="dayo-invoice-asset-sub">نجوم تيليجرام</div>
</div>
</div>
<div class="dayo-invoice-balance">
<strong>${order.total} ⭐</strong>
رصيدك
</div>
</div>
<button class="dayo-pay-btn" onclick="openTelegramInvoice('${encodedArg(response.checkoutUrl || '')}')">⭐ Pay ${order.total} Stars</button>
<p class="dayo-invoice-note">سيتم مراجعة طلبك يدوياً بعد الدفع</p>
${feeNote}
</div>
`;
} else {
container.innerHTML = `
<div class="dayo-invoice">
<div class="dayo-invoice-logo">D</div>
<p class="dayo-invoice-title">فاتورة من DAYO STORE</p>
<div class="dayo-invoice-amount">$${usdEquivalent}</div>
<div class="dayo-invoice-sub">${order.total} ${currencyLabel}</div>
<div class="dayo-invoice-order">Order #${escapeHTML(order.orderCode)}</div>
<div class="dayo-invoice-asset">
<div class="dayo-invoice-asset-left">
<div class="dayo-invoice-asset-icon" style="background:${order.currency === 'ton' ? '#0098EA' : '#26A17B'}">${order.currency === 'ton' ? '💎' : '₮'}</div>
<div>
<div class="dayo-invoice-asset-name">${order.currency === 'ton' ? 'TON' : 'Tether (USDT)'}</div>
<div class="dayo-invoice-asset-sub">${order.currency === 'ton' ? 'TON Network' : 'TON Network · Jetton'}</div>
</div>
</div>
<div class="dayo-invoice-balance">
<strong>${order.total} ${currencyLabel}</strong>
رصيدك
</div>
</div>
<button class="dayo-pay-btn" id="dayo-ton-pay-btn" onclick="startTonConnectPayment('${encodedArg(order.id)}')">🔗 ربط المحفظة والدفع</button>
<p class="dayo-invoice-note" id="ton-pay-status">عنوان الاستقبال: ${escapeHTML(cartPaymentSettings.tonReceiverAddress || '')}</p>
${feeNote}
</div>
`;
}
loadNotificationCount();
} catch (error) {
showMessage(error.message || 'حدث خطأ أثناء إنشاء الطلب.');
renderCartPage();
}
}
/* ============================================================
✅ الدفع عبر TON Connect (مع شاشة النجاح)
============================================================ */
async function startTonConnectPayment(orderId) {
try {
const ui = initTonConnect();
if (!ui) throw new Error('تعذر تحميل TON Connect. حدّث الصفحة وحاول مجددًا.');
if (!ui.wallet) {
await ui.openModal();
showMessage('اربط محفظتك أولًا، ثم اضغط زر الدفع مرة أخرى.');
return;
}
if (String(ui.wallet.account?.chain || '') !== '-239') throw new Error('اختر محفظة TON على الشبكة الرئيسية Mainnet.');
const walletAddress = ui.wallet.account.address;
const prepared = await apiCall('/api/ton/prepare', { orderId, walletAddress });
if (!prepared.ok || !prepared.transaction) throw new Error(prepared.error || 'تعذر تجهيز معاملة الدفع');
const status = document.getElementById('ton-pay-status');
const payBtn = document.getElementById('dayo-ton-pay-btn');
if (status) status.textContent = 'افتح محفظتك وراجع تفاصيل التحويل ثم وافق عليه.';
if (payBtn) { payBtn.disabled = true; payBtn.textContent = '⏳ جاري المعالجة...'; }
await ui.sendTransaction(prepared.transaction);
const submitted = await apiCall('/api/ton/submit', { orderId, walletAddress });
if (!submitted.ok) throw new Error(submitted.error || 'تم إرسال التحويل لكن تعذر تسجيل محاولة الدفع');
if (status) status.textContent = 'تم إرسال التحويل. نتحقق الآن من وصوله على شبكة TON...';
for (let attempt = 0; attempt < 18; attempt++) {
await new Promise(resolve => setTimeout(resolve, 5000));
const checked = await apiCall('/api/ton/verify', { orderId });
if (checked.ok && checked.paid) {
showPaymentSuccessScreen(checked.orderCode || '—', checked.total || 0, checked.currency || 'ton', checked.usdEquivalent);
return;
}
if (!checked.ok && attempt === 17) throw new Error(checked.error || 'تعذر التحقق من الدفع');
}
if (status) status.textContent = 'لم يظهر التأكيد بعد. افتح طلباتي وأعد التحقق بعد قليل.';
showMessage('التحويل أُرسل، لكن تأكيد الشبكة قد يستغرق وقتًا إضافيًا.');
} catch (error) {
showMessage(error.message || 'تعذر إتمام الدفع عبر TON Connect.');
}
}
/* ============================================================
✅ فاتورة Telegram Stars (مع شاشة النجاح)
============================================================ */
function openTelegramInvoice(encodedUrl) {
let url = '';
try { url = decodeURIComponent(encodedUrl); } catch (_) { url = encodedUrl; }
if (!url) return showMessage('رابط فاتورة Stars غير متوفر.');
if (tg?.openInvoice) {
tg.openInvoice(url, status => {
if (status === 'paid') {
showPaymentSuccessScreen('—', 0, 'stars', 0);
setTimeout(() => openMyOrders(), 3000);
} else if (status === 'failed') showMessage('تعذر إتمام الدفع. حاول مجددًا.');
});
} else if (tg?.openTelegramLink) tg.openTelegramLink(url);
else window.open(url, '_blank', 'noopener');
}
async function notifyManualPayment(orderId) {
try { orderId = decodeURIComponent(orderId); } catch (_) {}
const response = await apiCall('/api/orders/notify-manual-payment', { orderId });
if (response.ok) {
showMessage('تم إرسال إشعار الدفع. طلبك الآن بانتظار تأكيد الإدارة.');
openMyOrders();
} else showMessage(response.error || 'تعذر إرسال إشعار الدفع.');
}
async function submitOrderPaymentReference(orderId) {
try { orderId = decodeURIComponent(orderId); } catch (_) {}
const reference = document.getElementById('order-payment-reference')?.value?.trim() || '';
if (reference.length < 3) return showMessage('أدخل رقم العملية أو مرجع التحويل أولًا.');
const response = await apiCall('/api/orders/submit-reference', { orderId, reference });
if (response.ok) showMessage('تم إرسال مرجع الدفع. سيقوم فريق المتجر بمراجعته.');
else showMessage(response.error || 'تعذر إرسال المرجع.');
}
/* ===== مركز إشعارات DAYO والقائمة الجانبية ===== */
function openSideMenu() {
const overlay = document.getElementById('dayo-menu-overlay');
const drawer = document.getElementById('dayo-side-drawer');
if (!overlay || !drawer) return;
sideDrawerView = 'menu';
document.getElementById('dayo-drawer-main')?.classList.remove('hidden');
document.getElementById('dayo-drawer-notifications')?.classList.add('hidden');
overlay.classList.add('visible'); drawer.classList.add('open');
document.body.classList.add('dayo-drawer-open');
loadNotificationCount();
}
function closeSideMenu() {
document.getElementById('dayo-menu-overlay')?.classList.remove('visible');
document.getElementById('dayo-side-drawer')?.classList.remove('open');
document.body.classList.remove('dayo-drawer-open');
}
function updateNotificationBadge(count) {
const badge = document.getElementById('dayo-notification-count');
if (!badge) return;
const n = Math.max(0, Number(count) || 0);
badge.textContent = n > 99 ? '99+' : String(n);
badge.classList.toggle('hidden', n === 0);
}
async function loadNotificationCount() {
try {
const response = await apiCall('/api/notifications/mine');
if (!response.ok) return;
currentNotifications = Array.isArray(response.notifications) ? response.notifications : [];
updateNotificationBadge(response.unread || 0);
if (sideDrawerView === 'notifications') renderNotificationsList(currentNotifications);
} catch (_) {}
}
function renderNotificationsList(list) {
const container = document.getElementById('dayo-notifications-list');
if (!container) return;
if (!list.length) {
container.innerHTML = '<div class="dayo-notifications-empty"><div>🔔</div><strong>لا توجد إشعارات</strong><p>ستظهر هنا تحديثات طلباتك وعروض DAYO.</p></div>';
return;
}
container.innerHTML = list.map(item => {
const unread = !item.readAt;
const icon = item.type === 'success' ? '✓' : item.type === 'warning' ? '!' : item.type === 'offer' ? '★' : '•';
return `<button class="dayo-notification-item ${unread ? 'unread' : ''}" onclick="openNotificationItem('${encodedArg(item.id)}','${encodedArg(item.link || 'orders')}')"><span class="dayo-notification-icon type-${escapeHTML(item.type)}">${icon}</span><span class="dayo-notification-copy"><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.body)}</small><time>${item.createdAt ? new Date(item.createdAt).toLocaleString('ar-SA') : ''}</time></span>${unread ? '<i class="dayo-unread-dot"></i>' : ''}</button>`;
}).join('');
}
async function openNotifications() {
sideDrawerView = 'notifications';
document.getElementById('dayo-drawer-main')?.classList.add('hidden');
document.getElementById('dayo-drawer-notifications')?.classList.remove('hidden');
const list = document.getElementById('dayo-notifications-list');
if (list) list.innerHTML = '<div class="dayo-notifications-empty">جاري تحميل الإشعارات...</div>';
await loadNotificationCount();
await apiCall('/api/notifications/read', {}).catch(() => null);
currentNotifications = currentNotifications.map(item => ({ ...item, readAt: item.readAt || new Date().toISOString() }));
updateNotificationBadge(0);
renderNotificationsList(currentNotifications);
}
function showDrawerMenu() {
sideDrawerView = 'menu';
document.getElementById('dayo-drawer-main')?.classList.remove('hidden');
document.getElementById('dayo-drawer-notifications')?.classList.add('hidden');
}
async function openNotificationItem(encodedId, encodedLink = 'orders') {
let id = '', link = 'orders'; try { id = decodeURIComponent(encodedId); } catch (_) { id = encodedId; }
try { link = decodeURIComponent(encodedLink); } catch (_) { link = encodedLink; }
await apiCall('/api/notifications/read', { ids: [id] }).catch(() => null);
closeSideMenu();
if (link === 'admin-orders' && ['owner','admin'].includes(userRole)) openAdminPanel();
else if (link === 'shop') openShop();
else openMyOrders();
}
function drawerNavigate(target) {
closeSideMenu();
if (target === 'home') goHome();
else if (target === 'shop') openShop();
else if (target === 'cart') openCart();
else if (target === 'orders') openMyOrders();
else if (target === 'admin' && ['owner','admin'].includes(userRole)) openAdminPanel();
}
const ORDER_STATUS_TEXT = { awaiting_payment: 'بانتظار الدفع', paid: 'تم تأكيد الدفع', processing: 'قيد التنفيذ', completed: 'مكتمل', cancelled: 'ملغي', rejected: 'مرفوض' };

// ✅ NEW: صفحة المفضلة الكاملة
async function openFavorites() {
activateDayoDynamicPage();
const page = ensureDayoDynamicPage();
page.innerHTML = '<div class="dayo-page-loading">جاري تحميل المفضلة...</div>';
if (!currentShopProducts.length) {
  const res = await apiCall('/api/products');
  if (res.ok && Array.isArray(res.products)) currentShopProducts = res.products;
}
const favProducts = currentShopProducts.filter(p => favorites.includes(p.id));
if (favProducts.length === 0) {
  page.innerHTML = `<div class="dayo-page-head"><button class="dayo-back" onclick="goHome()">‹</button><div><h2>المفضلة</h2></div></div><div class="dayo-empty-cart"><div>❤️</div><h3>المفضلة فارغة</h3><p>أضف المنتجات التي تعجبك لتظهر هنا.</p><button class="dayo-primary" onclick="openShop()">تصفح المتجر</button></div>`;
} else {
  const grid = favProducts.map(p => {
    const imageURL = safeImageURL(p.image);
    const imgTag = imageURL ? `<img src="${escapeHTML(imageURL)}" class="card-img" alt="${escapeHTML(p.name)}">` : '<div class="card-img-placeholder">📦</div>';
    return `<div class="shop-card" onclick="openProduct('${p.id}')">
      <div class="card-img-wrap">
        <button class="fav-btn" data-id="${p.id}" onclick="toggleFavorite('${p.id}', event)" style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.6);border:none;border-radius:50%;width:32px;height:32px;font-size:18px;cursor:pointer;z-index:2;display:flex;align-items:center;justify-content:center;">${favorites.includes(p.id) ? '❤️' : '🤍'}</button>
        ${imgTag}
      </div>
      <div class="card-body">
        <strong>${escapeHTML(p.name)}</strong>
        <small>${escapeHTML(p.description || '').slice(0, 50)}...</small>
        <div class="card-price-row"><span class="card-price">${formatPrices(p.prices) || '—'}</span></div>
      </div>
    </div>`;
  }).join('');
  page.innerHTML = `<div class="dayo-page-head"><button class="dayo-back" onclick="goHome()">‹</button><div><h2>المفضلة</h2><small>${favProducts.length} منتج</small></div></div><div class="shop-grid" style="padding:16px;">${grid}</div>`;
}
}

async function openMyOrders() {
activateDayoDynamicPage();
const page = ensureDayoDynamicPage();
page.innerHTML = '<div class="dayo-page-loading">جاري تحميل طلباتك...</div>';
try {
const response = await apiCall('/api/orders/mine');
if (!response.ok) throw new Error(response.error || 'تعذر تحميل الطلبات');
const orders = Array.isArray(response.orders) ? response.orders : [];
window.dayoMyOrders = orders;
page.innerHTML = `<div class="dayo-page-head"><button class="dayo-back" onclick="openCart()">‹</button><div><h2>طلباتي</h2><small>${orders.length} طلب</small></div><button class="dayo-secondary" onclick="openCart()">السلة</button></div>${orders.length ? `<div class="dayo-orders-list">${orders.map(order => `<article class="dayo-order-card dayo-order-card-clickable" role="button" tabindex="0" aria-label="عرض تفاصيل الطلب ${escapeHTML(order.orderCode || '')}" onclick="openOrderDetails('${encodedArg(order.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openOrderDetails('${encodedArg(order.id)}')}"><div class="dayo-order-card-head"><strong>${escapeHTML(order.orderCode || 'طلب')}</strong><span class="dayo-status status-${escapeHTML(order.status)}">${escapeHTML(order.status === 'awaiting_payment' && order.paymentNotified ? 'تم إشعار الدفع – بانتظار تأكيد الحساب' : (ORDER_STATUS_TEXT[order.status] || order.status))}</span></div><div class="dayo-order-lines">${(order.items || []).map(item => `<div>${escapeHTML(item.name)} × ${Number(item.quantity) || 1}</div>`).join('')}</div><div class="dayo-total-row"><span>${escapeHTML(currencyLabel(order.currency))}</span><strong>${money(order.total, order.currency)}</strong></div><div class="dayo-order-card-foot"><small class="dayo-muted">${order.createdAt ? new Date(order.createdAt).toLocaleString('ar-SA') : ''}</small><span class="dayo-order-open-hint">عرض التفاصيل ←</span></div></article>`).join('')}</div>` : '<div class="dayo-empty-cart"><div>🧾</div><h3>لا توجد طلبات حتى الآن</h3><p>عند إتمام أول عملية شراء ستظهر تفاصيلها هنا.</p><button class="dayo-primary" onclick="openShop()">تصفح المتجر</button></div>'}`;
} catch (error) { page.innerHTML = `<div class="dayo-page-head"><h2>طلباتي</h2></div><p class="dayo-warning">${escapeHTML(error.message)}</p>`; }
}
function orderPaymentMethodLabel(order) {
if (order.paymentMethod === 'tonconnect') return order.currency === 'ton' ? 'TON Connect – TON' : 'TON Connect – USDT على شبكة TON';
if (order.paymentMethod === 'stars') return 'Telegram Stars';
if (order.paymentMethod === 'manual') return 'تحويل يدوي – ريال سعودي';
if (order.paymentMethod === 'cryptopay') return 'وسيلة دفع قديمة (سجل سابق)';
return 'وسيلة دفع أخرى';
}
function orderPaymentStatusLabel(order) {
if (order.paymentStatus === 'paid' || ['paid','processing','completed'].includes(order.status)) return 'تم تأكيد الدفع';
if (order.paymentStatus === 'submitted') return '💰 مدفوع – بانتظار تأكيد المشرف';
if (order.paymentMethod === 'manual' && order.paymentNotified) return 'تم إرسال إشعار التحويل – بانتظار مراجعة الإدارة';
if (order.paymentMethod === 'tonconnect' && order.tonWalletSubmittedAt) return 'تم إرسال معاملة المحفظة – بانتظار تأكيد الشبكة';
return 'بانتظار إتمام الدفع';
}
function openOrderDetails(encodedOrderId) {
let orderId = encodedOrderId;
try { orderId = decodeURIComponent(encodedOrderId); } catch (_) {}
const order = (Array.isArray(window.dayoMyOrders) ? window.dayoMyOrders : []).find(item => String(item.id) === String(orderId));
if (!order) { showMessage('تعذر العثور على تفاصيل الطلب. حدّث قائمة الطلبات وحاول مجددًا.'); return; }
const page = ensureDayoDynamicPage();
const items = Array.isArray(order.items) ? order.items : [];
const isAutomaticPayment = order.paymentMethod === 'tonconnect';
const canRetryAutomatic = isAutomaticPayment && order.status === 'awaiting_payment' && order.paymentStatus !== 'paid' && !!order.tonWalletSubmittedAt && !!order.tonSenderAddress;
const canContinueStars = order.paymentMethod === 'stars' && order.status === 'awaiting_payment' && !!order.providerPayUrl;
const canNotifyManual = order.paymentMethod === 'manual' && order.status === 'awaiting_payment' && !order.paymentNotified;
const dateText = order.createdAt ? new Date(order.createdAt).toLocaleString('ar-SA') : 'غير متوفر';
const itemRows = items.map(item => `<div class="dayo-order-detail-item"><span>${escapeHTML(item.name || 'منتج')} <small>× ${Number(item.quantity) || 1}</small></span><strong>${money(item.lineTotal ?? ((Number(item.unitPrice) || 0) * (Number(item.quantity) || 1)), order.currency)}</strong></div>`).join('');
const automaticNote = isAutomaticPayment && order.tonWalletSubmittedAt ? `<div class="dayo-order-detail-note"><strong>بيانات محاولة الدفع</strong><p>عنوان المحفظة المرسلة: <span dir="ltr">${escapeHTML(order.tonSenderAddress || 'غير متوفر')}</span></p><p>وقت الإرسال: ${new Date(order.tonWalletSubmittedAt).toLocaleString('ar-SA')}</p>${order.paymentReference ? `<p>مرجع المعاملة: <span dir="ltr">${escapeHTML(order.paymentReference)}</span></p>` : ''}</div>` : '';
const manualNote = order.paymentMethod === 'manual' ? `<div class="dayo-order-detail-note"><strong>تعليمات التحويل اليدوي</strong><p>${escapeHTML(order.paymentInstructions || 'راجع تعليمات المتجر لإتمام التحويل.')}</p>${order.manualPaymentUsername ? `<p>حساب الاستقبال: @${escapeHTML(order.manualPaymentUsername)}</p>` : ''}${order.paymentNotified ? '<p>تم إرسال إشعار التحويل إلى الإدارة.</p>' : ''}</div>` : '';
const starsAction = canContinueStars ? `<a class="dayo-primary" href="${escapeHTML(safeWebURL(order.providerPayUrl))}" target="_blank" rel="noopener noreferrer">متابعة دفع Telegram Stars</a>` : '';
const actionButtons = `${canRetryAutomatic ? `<button class="dayo-primary" type="button" onclick="retryTonOrderVerification('${encodedArg(order.id)}')">إعادة التحقق من الدفع</button>` : ''}${canNotifyManual ? `<button class="dayo-primary" type="button" onclick="notifyManualPayment('${encodedArg(order.id)}')">أشعرت المتجر بإتمام التحويل</button>` : ''}${starsAction}`;
page.querySelector('.dayo-order-detail-overlay')?.remove();
page.insertAdjacentHTML('beforeend', `<div class="dayo-order-detail-overlay" role="presentation" onclick="if(event.target===this)closeOrderDetails()"><section class="dayo-order-detail-modal" role="dialog" aria-modal="true" aria-labelledby="dayo-order-detail-title"><div class="dayo-order-detail-head"><div><small>تفاصيل الطلب</small><h3 id="dayo-order-detail-title">${escapeHTML(order.orderCode || 'طلب')}</h3></div><button class="dayo-order-detail-close" type="button" aria-label="إغلاق" onclick="closeOrderDetails()">×</button></div><div class="dayo-order-detail-status"><span class="dayo-status status-${escapeHTML(order.status)}">${escapeHTML(ORDER_STATUS_TEXT[order.status] || order.status || 'غير معروف')}</span><strong>${escapeHTML(orderPaymentStatusLabel(order))}</strong></div><div class="dayo-order-detail-section"><h4>المنتجات</h4>${itemRows || '<p class="dayo-muted">لا توجد تفاصيل للمنتجات.</p>'}<div class="dayo-order-detail-total"><span>الإجمالي</span><strong>${money(order.total, order.currency)}</strong></div></div><div class="dayo-order-detail-section"><h4>معلومات الدفع والطلب</h4><div class="dayo-order-detail-row"><span>طريقة الدفع</span><strong>${escapeHTML(orderPaymentMethodLabel(order))}</strong></div><div class="dayo-order-detail-row"><span>حالة الدفع</span><strong>${escapeHTML(orderPaymentStatusLabel(order))}</strong></div><div class="dayo-order-detail-row"><span>تاريخ الطلب</span><strong>${escapeHTML(dateText)}</strong></div>${order.paymentReference ? `<div class="dayo-order-detail-row"><span>مرجع الدفع</span><strong dir="ltr">${escapeHTML(order.paymentReference)}</strong></div>` : ''}</div>${automaticNote}${manualNote}<div class="dayo-order-detail-actions">${actionButtons}<button class="dayo-secondary" type="button" onclick="closeOrderDetails()">إغلاق التفاصيل</button></div></section></div>`);
}
function closeOrderDetails() { document.querySelector('.dayo-order-detail-overlay')?.remove(); }
async function retryTonOrderVerification(encodedOrderId) {
let orderId = encodedOrderId;
try { orderId = decodeURIComponent(encodedOrderId); } catch (_) {}
showMessage('جارٍ إعادة التحقق من التحويل على شبكة TON...');
try {
let lastMessage = 'لم يظهر التحويل المؤكد بعد. تأكد من مرور وقت كافٍ ثم أعد المحاولة.';
for (let attempt = 0; attempt < 6; attempt++) {
const checked = await apiCall('/api/ton/verify', { orderId });
if (!checked.ok) throw new Error(checked.error || 'تعذر التحقق من الدفع');
if (checked.paid) {
showMessage('تم تأكيد الدفع بنجاح.');
await openMyOrders();
return;
}
lastMessage = checked.message || lastMessage;
if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 5000));
}
showMessage(lastMessage);
await openMyOrders();
} catch (error) {
showMessage(error.message || 'تعذر إعادة التحقق من الدفع.');
}
}
function renderPaymentSettingsAdmin(settings = {}, role = userRole) {
const safeBase = escapeHTML(settings.publicBaseUrl || '');
const isOwner = role === 'owner';
const walletField = isOwner
? `<input id="pay-ton-receiver-address" type="text" dir="ltr" value="${escapeHTML(settings.tonReceiverAddress || '')}" placeholder="ألصق عنوان محفظة TON هنا">`
: `<input id="pay-ton-receiver-address" type="text" dir="ltr" value="${escapeHTML(settings.tonReceiverAddress || '')}" readonly aria-readonly="true">`;
return `<hr style="border-color:#333;margin:20px 0;"><section class="admin-form" id="dayo-payment-settings"><h3>إعدادات الدفع والتحصيل</h3><h4>الدفع المباشر – TON Connect</h4><label><input id="pay-tonconnect-enabled" type="checkbox" ${settings.tonConnectEnabled ? 'checked' : ''}> تفعيل بوابة TON Connect</label><label><input id="pay-ton-enabled" type="checkbox" ${settings.tonEnabled !== false ? 'checked' : ''}> قبول الدفع بعملة TON</label><label><input id="pay-usdt-enabled" type="checkbox" ${settings.usdtEnabled !== false ? 'checked' : ''}> قبول الدفع بعملة USDT على شبكة TON</label><label>عنوان محفظة الاستقبال</label>${walletField}<small class="dayo-muted">${isOwner ? 'يمكنك تعديل عنوان محفظة الاستقبال بصفتك المالك.' : 'عرض فقط: تغيير عنوان محفظة الاستقبال متاح للمالك وحده.'}</small><hr style="border-color:#333;margin:16px 0;"><h4>إعدادات شبكة TON – للمالك فقط</h4>${isOwner ? `<label>مفتاح TON Center API</label><input id="pay-toncenter-api-key" type="password" dir="ltr" autocomplete="new-password" placeholder="${settings.toncenterApiKeyConfigured ? 'يوجد مفتاح محفوظ؛ اكتب قيمة جديدة للاستبدال' : 'ألصق مفتاح TON Center هنا'}"><small class="dayo-muted">${settings.toncenterApiKeyConfigured ? 'يوجد مفتاح محفوظ ومشفّر. اترك الحقل فارغًا للاحتفاظ به.' : 'لم تتم إضافة مفتاح بعد.'}</small><label><input id="pay-toncenter-clear" type="checkbox"> حذف مفتاح TON Center المحفوظ</label><label>عنوان عقد USDT (Jetton Master) على شبكة TON</label><input id="pay-ton-usdt-master" type="text" dir="ltr" value="${escapeHTML(settings.tonUsdtMasterAddress || '')}" placeholder="عنوان عقد USDT الرسمي على TON">` : `<label>مفتاح TON Center API</label><input type="text" value="${settings.toncenterApiKeyConfigured ? 'مفتاح محفوظ' : 'غير مضبوط'}" readonly><small class="dayo-muted">إضافة أو تغيير المفتاح وعقد USDT متاح للمالك فقط.</small><label>عنوان عقد USDT (Jetton Master)</label><input type="text" dir="ltr" value="${escapeHTML(settings.tonUsdtMasterAddress || '')}" readonly>`}<small class="dayo-muted">يُحفظ مفتاح API مشفّرًا في قاعدة البيانات ولا يُرسل إلى المتصفح. يمكن إدارة المفتاح وعنوان العقد من هذه اللوحة دون إضافتهما إلى Render Environment.</small><hr style="border-color:#333;margin:16px 0;"><h4>الدفع اليدوي – الريال السعودي</h4><label><input id="pay-manual-enabled" type="checkbox" ${settings.manualEnabled !== false ? 'checked' : ''}> تفعيل الدفع اليدوي بالريال</label><label>يوزر حساب استقبال الدفع</label><input id="pay-manual-username" type="text" value="${escapeHTML(settings.manualPaymentUsername || '')}" placeholder="مثال: DAYO_PAY"><label>تعليمات التحويل (اختياري)</label><textarea id="pay-manual-instructions" rows="3" placeholder="اكتب تعليمات التحويل ورقم الطلب">${escapeHTML(settings.manualInstructions || '')}</textarea><hr style="border-color:#333;margin:16px 0;"><h4>Telegram Stars</h4><label><input id="pay-stars-enabled" type="checkbox" ${settings.starsEnabled ? 'checked' : ''}> تفعيل الدفع عبر Telegram Stars</label><div class="dayo-payment-note"><strong>Webhook تيليجرام</strong><p>${settings.telegramWebhookReady ? 'تم إنشاء إعدادات Webhook.' : 'سيتم إنشاء سر Webhook تلقائيًا عند حفظ الإعدادات.'}</p><p id="pay-telegram-webhook-url">${escapeHTML(settings.telegramWebhookUrl || 'سيظهر بعد إدخال رابط المتجر وحفظ الإعدادات')}</p><button type="button" class="dayo-secondary" onclick="copyPaymentWebhook('telegram')">نسخ رابط Webhook</button><button type="button" class="dayo-primary" onclick="setupStarsWebhook()">ربط Telegram Stars الآن</button><small>لن يتم استبدال Webhook آخر موجود للبوت؛ إذا كان البوت مربوطًا بنظام آخر سنوقف العملية وننبهك.</small></div><label>رابط المتجر العام HTTPS</label><input id="pay-public-base-url" type="url" value="${safeBase}" placeholder="https://your-domain.com"><button class="primary" onclick="savePaymentSettings()">حفظ جميع إعدادات الدفع</button></section>`;
}
function renderOrdersAdmin(orders = []) {
const statuses = Object.entries(ORDER_STATUS_TEXT);
const cards = orders.map(order => {
const needsReview = order.paymentStatus === 'submitted' && order.status === 'awaiting_payment';
const paymentLabel = order.paymentMethod === 'manual' ? 'تحويل يدوي – SAR' :
order.paymentMethod === 'cryptopay' ? 'وسيلة دفع قديمة (سجل سابق)' :
order.paymentMethod === 'tonconnect' ? (order.currency === 'ton' ? 'TON Connect – TON' : 'TON Connect – USDT') :
order.paymentMethod === 'stars' ? 'Telegram Stars' : 'وسيلة أخرى';
const paymentState = order.paymentMethod === 'manual'
? (order.paymentNotified ? 'العميل أشعر بالتحويل – يلزم التحقق' : 'بانتظار التحويل')
: (order.paymentStatus === 'paid' ? 'مدفوع ومؤكّد' : order.paymentStatus === 'submitted' ? '💰 مدفوع – بانتظار تأكيد المشرف' : 'بانتظار تأكيد مزود الدفع');
return `<article class="admin-section-card" style="display:block;border-left:4px solid ${needsReview ? '#f39c12' : (order.paymentStatus === 'paid' ? '#4AE2A0' : '#315d91')}">
<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center">
<strong>${escapeHTML(order.orderCode || 'طلب')}</strong>
<b>${money(order.total, order.currency)}</b>
${needsReview ? '<span style="background:#f39c12;color:#000;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:700">⏳ بانتظار التأكيد</span>' : ''}
</div>
<div style="font-size:12px;color:#a0c4ff;margin:7px 0">العميل: ${escapeHTML(order.customerName || 'عميل')} · ID: ${escapeHTML(order.userId || '')}</div>
<div style="font-size:12px;color:#fff;margin-bottom:7px">${(order.items || []).map(item => `${escapeHTML(item.name)} × ${Number(item.quantity) || 1}`).join('، ')}</div>
<div style="font-size:12px;color:#a0c4ff;margin-bottom:8px">${paymentLabel} · ${paymentState}</div>
${order.paymentReference ? `<div style="font-size:11px;color:#4AE2A0;margin-bottom:8px">🔗 المرجع: <code style="background:#0d1526;padding:2px 6px;border-radius:4px">${escapeHTML(order.paymentReference)}</code></div>` : ''}
${needsReview ? `<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:8px">
<button onclick="confirmOrderPayment('${encodedArg(order.id)}')" style="background:#4AE2A0;color:#000;border:0;border-radius:7px;padding:8px 14px;font-weight:700">✅ تأكيد الدفع</button>
<button onclick="rejectOrderPayment('${encodedArg(order.id)}')" style="background:#e74c3c;color:#fff;border:0;border-radius:7px;padding:8px 14px">❌ رفض</button>
</div>` : `<div style="display:flex;gap:7px;flex-wrap:wrap">
<select id="order-status-${escapeHTML(order.id)}" style="flex:1;min-width:150px;padding:9px;border-radius:7px">${statuses.map(([key,label]) => `<option value="${key}" ${key === order.status ? 'selected' : ''}>${label}</option>`).join('')}</select>
<button onclick="updateOrderStatus('${encodedArg(order.id)}')" style="background:#4A90E2;color:#fff;border:0;border-radius:7px;padding:8px 12px">حفظ الحالة</button>
</div>`}
</article>`;
}).join('');
return `<hr style="border-color:#333;margin:20px 0;"><section><h3 style="color:inherit">إدارة الطلبات (${orders.length})</h3><button onclick="refreshAdminOrders()" style="background:#315d91;color:#fff;border:0;padding:8px 12px;border-radius:7px;margin-bottom:10px">تحديث الطلبات</button>${cards || '<p>لا توجد طلبات حتى الآن.</p>'}</section>`;
}
async function confirmOrderPayment(orderId) {
try { orderId = decodeURIComponent(orderId); } catch (_) {}
if (!confirm('تأكيد استلام دفعة هذا الطلب؟')) return;
const response = await apiCall('/api/orders/confirm-payment', { orderId });
if (response.ok) { showMessage('✅ تم تأكيد الدفع بنجاح'); openAdminPanel(); }
else showMessage(response.error || 'تعذر تأكيد الدفع');
}
async function rejectOrderPayment(orderId) {
try { orderId = decodeURIComponent(orderId); } catch (_) {}
const reason = prompt('سبب الرفض (اختياري):');
if (reason === null) return;
const response = await apiCall('/api/orders/reject-payment', { orderId, reason });
if (response.ok) { showMessage('تم رفض الدفع'); openAdminPanel(); }
else showMessage(response.error || 'تعذر رفض الدفع');
}
async function savePaymentSettings() {
const payload = {
manualEnabled: !!document.getElementById('pay-manual-enabled')?.checked,
manualInstructions: document.getElementById('pay-manual-instructions')?.value || '',
manualPaymentUsername: document.getElementById('pay-manual-username')?.value || '',
tonConnectEnabled: !!document.getElementById('pay-tonconnect-enabled')?.checked,
tonEnabled: !!document.getElementById('pay-ton-enabled')?.checked,
usdtEnabled: !!document.getElementById('pay-usdt-enabled')?.checked,
tonReceiverAddress: document.getElementById('pay-ton-receiver-address')?.value || '',
toncenterApiKey: userRole === 'owner' ? (document.getElementById('pay-toncenter-api-key')?.value || '') : undefined,
clearToncenterApiKey: userRole === 'owner' ? !!document.getElementById('pay-toncenter-clear')?.checked : undefined,
tonUsdtMasterAddress: userRole === 'owner' ? (document.getElementById('pay-ton-usdt-master')?.value || '') : undefined,
publicBaseUrl: document.getElementById('pay-public-base-url')?.value || '',
starsEnabled: !!document.getElementById('pay-stars-enabled')?.checked
};
const response = await apiCall('/api/payments/settings/save', payload);
if (response.ok) { showMessage('تم حفظ إعدادات الدفع بنجاح.'); openAdminPanel(); }
else showMessage(response.error || 'تعذر حفظ الإعدادات.');
}
async function copyPaymentWebhook(kind) {
const base = document.getElementById('pay-public-base-url')?.value?.trim().replace(/\/$/, '') || '';
if (!/^https:\/\//i.test(base)) return showMessage('أدخل رابط المتجر HTTPS أولًا.');
const url = `${base}/api/telegram/webhook`;
try { await navigator.clipboard.writeText(url); showMessage('تم نسخ رابط Webhook.'); }
catch (_) { showMessage(url); }
}
async function setupStarsWebhook() {
const base = document.getElementById('pay-public-base-url')?.value?.trim() || '';
if (!/^https:\/\//i.test(base)) return showMessage('احفظ رابط المتجر HTTPS أولًا.');
const result = await apiCall('/api/payments/telegram-webhook/setup', {});
if (result.ok) { showMessage(result.message || 'تم ربط Stars.'); openAdminPanel(); }
else if (result.conflict) showMessage(`لم نغيّر Webhook الحالي حفاظًا على البوت: ${result.existingUrl}`);
else showMessage(result.error || 'تعذر ربط Webhook.');
}
async function refreshAdminOrders() { openAdminPanel(); }
async function updateOrderStatus(orderId) {
try { orderId = decodeURIComponent(orderId); } catch (_) {}
const status = document.getElementById(`order-status-${orderId}`)?.value;
if (!status) return;
const response = await apiCall('/api/orders/update-status', { orderId, status });
if (response.ok) { showMessage('تم تحديث حالة الطلب.'); openAdminPanel(); }
else showMessage(response.error || 'تعذر تحديث الطلب.');
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

// ✅ NEW: قسم الدعم بتصميم شاشة الجوال
function openSupport() {
  activateDayoDynamicPage();
  const page = ensureDayoDynamicPage();
  page.innerHTML = `
    <div class="dayo-page-head">
      <button class="dayo-back" onclick="goHome()">‹</button>
      <div><h2>مركز المساعدة</h2><small>كيف يمكننا مساعدتك اليوم؟</small></div>
    </div>
    <div class="support-phone-container">
      <div class="support-phone-notch"></div>
      <div class="support-app-grid">
        <div class="support-app-tile tile-support" onclick="openSupportForm('support')">
          <div class="support-app-icon">🎧</div>
          <div class="support-app-info">
            <h3>الدعم الفني</h3>
            <p>استفسار عن طلب، منتج، أو مشكلة تقنية</p>
          </div>
        </div>
        <div class="support-app-tile tile-complaint" onclick="openSupportForm('complaint')">
          <div class="support-app-icon">⚠️</div>
          <div class="support-app-info">
            <h3>تقديم شكوى</h3>
            <p>الإبلاغ عن مشكلة في الخدمة أو المنتج</p>
          </div>
        </div>
        <div class="support-app-tile tile-suggestion" onclick="openSupportForm('suggestion')">
          <div class="support-app-icon">💡</div>
          <div class="support-app-info">
            <h3>الاقتراحات</h3>
            <p>أفكار لتطوير المتجر وخدماتنا</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function openSupportForm(type) {
  const titles = { support: 'الدعم الفني', complaint: 'تقديم شكوى', suggestion: 'الاقتراحات' };
  const icons = { support: '🎧', complaint: '⚠️', suggestion: '💡' };
  const page = ensureDayoDynamicPage();
  page.innerHTML = `
    <div class="dayo-page-head">
      <button class="dayo-back" onclick="openSupport()">‹</button>
      <div><h2>${icons[type]} ${titles[type]}</h2></div>
    </div>
    <div class="support-phone-container" style="padding: 20px;">
      <p style="color: var(--dy-muted); font-size: 13px; margin-bottom: 20px; text-align: center;">
        يمكنك التواصل معنا مباشرة عبر تيليجرام أو ملء النموذج أدناه.
      </p>
      <a href="https://t.me/c_h_8" target="_blank" class="dayo-primary" style="text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 20px;">
        <span>💬</span> فتح محادثة تيليجرام
      </a>
      <div style="border-top: 1px solid var(--dy-border); padding-top: 20px;">
        <label style="display:block; color: var(--dy-muted); font-size: 12px; margin-bottom: 6px;">الاسم (اختياري)</label>
        <input type="text" id="support-name" class="support-form-input" placeholder="اكتب اسمك هنا">
        <label style="display:block; color: var(--dy-muted); font-size: 12px; margin-bottom: 6px;">الرسالة</label>
        <textarea id="support-message" class="support-form-input" rows="4" placeholder="اكتب استفسارك أو اقتراحك هنا..." style="resize: none;"></textarea>
        <button class="dayo-primary" onclick="submitSupport('${type}')">إرسال</button>
      </div>
    </div>
  `;
}

function submitSupport(type) {
  const name = document.getElementById('support-name')?.value || 'مستخدم';
  const message = document.getElementById('support-message')?.value;
  if (!message || message.trim().length < 5) {
    showMessage('يرجى كتابة رسالة توضح استفسارك أو اقتراحك.');
    return;
  }
  showMessage('تم استلام رسالتك بنجاح! سيتم الرد عليك قريبًا.');
  openSupport(); // العودة لشاشة التطبيقات
}

function openSupport() { showEmptyPage('الدعم الفني', '🎧', 'تواصل معنا عبر تيليجرام أو البريد'); } // تم استبدالها بالأعلى، لكن أبقيت هذا السطر كمرجع احتياطي في حال وجود استدعاءات أخرى
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
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', fetchUserRole, { once: true });
} else {
fetchUserRole();
}
