const express = require('express');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ⚠️ ضع التوكن الجديد هنا (الأفضل استخدام متغيرات البيئة على Render، لكن هذا يعمل)
const BOT_TOKEN = '8944449366:AAF-2I10o__647D8eAxlatu_pipO1n8KCW4';

const DB_FILE = path.join(__dirname, 'database.json');

// إنشاء قاعدة البيانات إذا لم تكن موجودة مع القيم الافتراضية للمتجر
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({
    users: { '51442749': { role: 'owner', name: 'المالك' } },
    products: [],
    store: {
      name: 'DAYO STORE',
      cover: '',
      logo: '',
      usersCount: 12846,
      onlineCount: 1245
    }
  }, null, 2));
}

const getDB = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const saveDB = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

function verifyTelegramData(initData, botToken) {
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');
  const dataCheckString = Array.from(urlParams.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (calculatedHash !== hash) throw new Error('توقيع غير صالح');
  return { user: JSON.parse(urlParams.get('user')) };
}

function getUserFromReq(req) {
  const { initData } = req.body;
  if (!initData) throw new Error('مفقود');
  const parsed = verifyTelegramData(initData, BOT_TOKEN);
  const db = getDB();
  const userId = parsed.user.id.toString();
  const dbUser = db.users[userId] || { role: 'user', name: parsed.user.first_name };
  return { id: userId, ...dbUser };
}

// --- جلب الصلاحيات ---
app.post('/api/me', (req, res) => {
  try {
    const user = getUserFromReq(req);
    res.json({ ok: true, user });
  } catch (err) { res.status(401).json({ ok: false }); }
});

// --- جلب المنتجات ---
app.post('/api/products', (req, res) => {
  try {
    getUserFromReq(req);
    res.json({ ok: true, products: getDB().products });
  } catch (err) { res.status(401).json({ ok: false }); }
});

// --- إضافة منتج جديد ---
app.post('/api/products/add', (req, res) => {
  try {
    const user = getUserFromReq(req);
    if (user.role === 'user') throw new Error('ليس لديك صلاحية');

    const { name, description, image, prices } = req.body; 
    
    const db = getDB();
    const newProduct = {
      id: Date.now().toString(),
      name,
      description: description || 'لا يوجد وصف',
      image: image || '',
      prices: prices || { usd: 0, ton: 0, stars: 0, sar: 0 },
      creatorId: user.id,
      creatorName: user.name
    };
    
    db.products.push(newProduct);
    saveDB(db);
    res.json({ ok: true, product: newProduct });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

// --- تعديل منتج ---
app.post('/api/products/edit', (req, res) => {
  try {
    const user = getUserFromReq(req);
    const { productId, name, description, image, prices } = req.body;
    const db = getDB();
    
    const product = db.products.find(p => p.id === productId);
    if (!product) throw new Error('المنتج غير موجود');
    
    if (user.role === 'owner' || user.role === 'admin' || (user.role === 'moderator' && product.creatorId === user.id)) {
      product.name = name || product.name;
      product.description = description || product.description;
      product.image = image !== undefined ? image : product.image;
      product.prices = prices || product.prices;
      
      saveDB(db);
      res.json({ ok: true });
    } else {
      throw new Error('ليس لديك صلاحية لتعديل هذا المنتج');
    }
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

// --- حذف منتج ---
app.post('/api/products/delete', (req, res) => {
  try {
    const user = getUserFromReq(req);
    const { productId } = req.body;
    const db = getDB();
    
    const index = db.products.findIndex(p => p.id === productId);
    if (index === -1) throw new Error('المنتج غير موجود');
    
    const product = db.products[index];
    if (user.role === 'owner' || user.role === 'admin' || (user.role === 'moderator' && product.creatorId === user.id)) {
      db.products.splice(index, 1);
      saveDB(db);
      res.json({ ok: true });
    } else {
      throw new Error('ليس لديك صلاحية لحذف هذا المنتج');
    }
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

// --- ترقية مستخدم ---
app.post('/api/users/promote', (req, res) => {
  try {
    const user = getUserFromReq(req);
    const { targetId, newRole } = req.body;
    const db = getDB();
    if (user.role === 'owner') {
      db.users[targetId] = { role: newRole, name: db.users[targetId]?.name || 'مستخدم' };
    } else if (user.role === 'admin' && newRole === 'moderator') {
      db.users[targetId] = { role: 'moderator', name: db.users[targetId]?.name || 'مستخدم' };
    } else {
      throw new Error('ليس لديك صلاحية');
    }
    saveDB(db);
    res.json({ ok: true });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

// =========================================================
// مسارات إدارة المشرفين
// =========================================================

// --- جلب قائمة المشرفين (للمالك والمسؤول فقط) ---
app.post('/api/users/list', (req, res) => {
  try {
    const user = getUserFromReq(req);
    if (user.role !== 'owner' && user.role !== 'admin') {
      throw new Error('ليس لديك صلاحية');
    }
    
    const db = getDB();
    const staffList = Object.entries(db.users)
      .filter(([id, u]) => u.role === 'admin' || u.role === 'moderator')
      .map(([id, u]) => ({ id, ...u }));

    res.json({ ok: true, staff: staffList });
  } catch (err) {
    res.status(403).json({ ok: false, error: err.message });
  }
});

// --- تعديل رتبة أو إزالة مشرف ---
app.post('/api/users/update-role', (req, res) => {
  try {
    const requester = getUserFromReq(req);
    const { targetId, newRole } = req.body;
    
    if (requester.role !== 'owner' && requester.role !== 'admin') {
      throw new Error('ليس لديك صلاحية');
    }

    const db = getDB();
    const targetUser = db.users[targetId];
    if (!targetUser) throw new Error('المستخدم غير موجود');
    
    // منع المسؤول من تعديل المالك أو المسؤولين الآخرين
    if (requester.role === 'admin' && (targetUser.role === 'owner' || targetUser.role === 'admin')) {
      throw new Error('ليس لديك صلاحية لتعديل هذا الشخص');
    }

    if (newRole === 'user') {
      delete db.users[targetId];
    } else {
      db.users[targetId].role = newRole;
    }

    saveDB(db);
    res.json({ ok: true });
  } catch (err) {
    res.status(403).json({ ok: false, error: err.message });
  }
});

// =========================================================
// مسارات إعدادات المتجر (الهيدر)
// =========================================================

// جلب إعدادات المتجر
app.post('/api/store', (req, res) => {
  try {
    getUserFromReq(req);
    const db = getDB();
    // إذا لم تكن موجودة، نرسل قيم افتراضية
    res.json({ 
      ok: true, 
      store: db.store || { 
        name: 'DAYO STORE', 
        cover: '', 
        logo: '', 
        usersCount: 12846,
        onlineCount: 1245 
      } 
    });
  } catch (err) { res.status(401).json({ ok: false }); }
});

// حفظ إعدادات المتجر (للمالك فقط)
app.post('/api/store/update', (req, res) => {
  try {
    const user = getUserFromReq(req);
    if (user.role !== 'owner') throw new Error('للمالك فقط');
    
    const db = getDB();
    const { name, cover, logo } = req.body;
    
    // دمج البيانات القديمة مع الجديدة
    db.store = {
      name: name || db.store?.name || 'DAYO STORE',
      cover: cover !== undefined ? cover : (db.store?.cover || ''),
      logo: logo !== undefined ? logo : (db.store?.logo || ''),
      usersCount: db.store?.usersCount || 12846,
      onlineCount: db.store?.onlineCount || 1245
    };
    
    saveDB(db);
    res.json({ ok: true, store: db.store });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

// =========================================================
// مسار فحص الحالة (Health Check) لـ UptimeRobot
// =========================================================
app.get('/health', (req, res) => res.status(200).send('OK'));
app.head('/health', (req, res) => res.status(200).end());

// =========================================================
// تشغيل الخادم
// =========================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ الخادم يعمل على المنفذ ${PORT}`));
