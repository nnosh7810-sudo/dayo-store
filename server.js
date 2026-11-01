const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// حد بسيط للطلبات لمنع الإغراق. في بيئة متعددة الخوادم استخدم Redis أو rate-limit package.
const requestBuckets = new Map();
app.use('/api', (req, res, next) => {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = requestBuckets.get(key) || { count: 0, resetAt: now + 60_000 };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + 60_000;
  }
  bucket.count += 1;
  requestBuckets.set(key, bucket);
  if (bucket.count > 180) return res.status(429).json({ ok: false, error: 'طلبات كثيرة، حاول بعد دقيقة' });
  next();
});

// لا تضع أسرار البوت أو قاعدة البيانات داخل الكود.
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const OWNER_TELEGRAM_ID = process.env.OWNER_TELEGRAM_ID || '51442749';

if (!BOT_TOKEN) throw new Error('يرجى ضبط BOT_TOKEN في متغيرات البيئة');
if (!MONGODB_URI) throw new Error('يرجى ضبط MONGODB_URI في متغيرات البيئة');

const client = new MongoClient(MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db('dayoStore');
    console.log('✅ متصل بقاعدة بيانات MongoDB');

    const usersCollection = db.collection('users');
    if (!await usersCollection.findOne({ _id: OWNER_TELEGRAM_ID })) {
      await usersCollection.insertOne({ _id: OWNER_TELEGRAM_ID, role: 'owner', name: 'المالك' });
    }

    const storeCollection = db.collection('store');
    if (!await storeCollection.findOne({ _id: 'main' })) {
      await storeCollection.insertOne({
        _id: 'main',
        name: 'DAYO STORE',
        cover: '',
        logo: '',
        usersCount: 0,
        onlineCount: 0,
        menuLinks: {},
        heroButton: { text: 'تسوق الآن', link: '#shop', color: '#4A90E2' }
      });
    }

    if (!await db.collection('slider').findOne({ _id: 'main' })) {
      await db.collection('slider').insertOne({ _id: 'main', slides: [] });
    }

    if (!await db.collection('sections').findOne({ _id: 'main' })) {
      await db.collection('sections').insertOne({ _id: 'main', list: [] });
    }

    if (!await db.collection('categories').findOne({ _id: 'main' })) {
      await db.collection('categories').insertOne({
        _id: 'main',
        list: [
          { id: 'all', name: 'الكل', icon: '🛍️' },
          { id: 'electronics', name: 'إلكترونيات', icon: '📱' },
          { id: 'games', name: 'ألعاب', icon: '🎮' },
          { id: 'offers', name: 'عروض', icon: '🔥' }
        ]
      });
    }

    if (!await db.collection('badges').findOne({ _id: 'main' })) {
      await db.collection('badges').insertOne({
        _id: 'main',
        list: [
          { id: 'new', name: 'جديد', icon: '⚡', color: '#4AE2A0', textColor: '#07131F' },
          { id: 'featured', name: 'مميز', icon: '⭐', color: '#F39C12', textColor: '#FFFFFF' }
        ]
      });
    }

    // ✅ الأيقونات المربعة
    if (!await db.collection('quickIcons').findOne({ _id: 'main' })) {
      await db.collection('quickIcons').insertOne({
        _id: 'main',
        list: [
          { id: 'qi1', title: 'تيليجرام', icon: '✈️', image: '', link: '#shop', color: '#4A90E2' },
          { id: 'qi2', title: 'NFT', icon: '💎', image: '', link: '#shop', color: '#8A2BE2' },
          { id: 'qi3', title: 'التواصل', icon: '📱', image: '', link: '#shop', color: '#E24A90' },
          { id: 'qi4', title: 'الألعاب', icon: '🎮', image: '', link: '#shop', color: '#4AE2A0' }
        ]
      });
    }

  } catch (err) {
    console.error('❌ فشل تهيئة قاعدة البيانات:', err);
    throw err;
  }
}

/* =========================================================
   دوال مساعدة
   ========================================================= */
function verifyTelegramData(initData, botToken) {
  if (typeof initData !== 'string' || !initData.trim()) {
    throw new Error('بيانات تيليجرام مفقودة');
  }

  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  const authDate = Number(urlParams.get('auth_date'));
  const userJson = urlParams.get('user');

  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
    throw new Error('توقيع تيليجرام مفقود أو غير صالح');
  }
  if (!Number.isFinite(authDate) || !userJson) {
    throw new Error('بيانات جلسة تيليجرام غير مكتملة');
  }

  // رفض بيانات تسجيل الدخول الأقدم من 24 ساعة أو المؤرخة في المستقبل.
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (authDate > nowSeconds + 30 || nowSeconds - authDate > 86400) {
    throw new Error('انتهت صلاحية جلسة تيليجرام، أعد فتح المتجر');
  }

  urlParams.delete('hash');
  const dataCheckString = Array.from(urlParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest();
  const receivedHash = Buffer.from(hash, 'hex');

  if (receivedHash.length !== calculatedHash.length ||
      !crypto.timingSafeEqual(calculatedHash, receivedHash)) {
    throw new Error('توقيع تيليجرام غير صالح');
  }

  let user;
  try {
    user = JSON.parse(userJson);
  } catch {
    throw new Error('بيانات مستخدم تيليجرام غير صالحة');
  }
  if (!user || !user.id) throw new Error('معرف مستخدم تيليجرام مفقود');

  return { user };
}

async function getUserFromReq(req) {
  const initData = req.body?.initData;
  if (!initData) throw new Error('بيانات تسجيل الدخول مفقودة');

  const parsed = verifyTelegramData(initData, BOT_TOKEN);
  const userId = String(parsed.user.id);
  const now = new Date();
  const displayName = String(parsed.user.first_name || 'مستخدم').slice(0, 100);

  // upsert ذري لتفادي تعارض أول تسجيل دخول متزامن.
  await db.collection('users').updateOne(
    { _id: userId },
    {
      $set: { lastSeen: now, name: displayName },
      $setOnInsert: { role: 'user', joinedAt: now }
    },
    { upsert: true }
  );

  const dbUser = await db.collection('users').findOne({ _id: userId });
  return {
    id: userId,
    role: dbUser?.role || 'user',
    name: dbUser?.name || displayName
  };
}

function isValidRole(role) {
  return ['user', 'moderator', 'admin'].includes(role);
}

function validatePrices(prices) {
  if (!prices || typeof prices !== 'object' || Array.isArray(prices)) {
    throw new Error('بيانات الأسعار غير صحيحة');
  }
  const allowed = ['usd', 'ton', 'stars', 'sar'];
  const clean = {};
  for (const key of allowed) {
    const value = prices[key] === undefined ? 0 : Number(prices[key]);
    if (!Number.isFinite(value) || value < 0 || value > 100000000) {
      throw new Error(`قيمة السعر ${key} غير صحيحة`);
    }
    clean[key] = value;
  }
  return clean;
}

async function getSectionsList() {
  const doc = await db.collection('sections').findOne({ _id: 'main' });
  return doc?.list || [];
}
async function saveSectionsList(list) {
  await db.collection('sections').updateOne({ _id: 'main' }, { $set: { list } }, { upsert: true });
}
async function getQuickIconsList() {
  const doc = await db.collection('quickIcons').findOne({ _id: 'main' });
  return doc?.list || [];
}
async function saveQuickIconsList(list) {
  await db.collection('quickIcons').updateOne({ _id: 'main' }, { $set: { list } }, { upsert: true });
}

/* =========================================================
   المسارات (API)
   ========================================================= */

app.post('/api/me', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    res.json({ ok: true, user });
  } catch (err) { res.status(401).json({ ok: false }); }
});

// ✅ إحصائيات حقيقية
app.post('/api/stats', async (req, res) => {
  try {
    await getUserFromReq(req);
    const totalUsers = await db.collection('users').countDocuments();
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const onlineUsers = await db.collection('users').countDocuments({ lastSeen: { $gte: fiveMinAgo } });
    const totalProducts = await db.collection('products').countDocuments();
    const products = await db.collection('products').find().toArray();
    const totalSold = products.reduce((sum, p) => sum + (p.soldCount || 0), 0);
    res.json({ ok: true, stats: { totalUsers, onlineUsers, totalProducts, totalSold } });
  } catch (err) { res.status(401).json({ ok: false, error: err.message }); }
});

app.post('/api/products', async (req, res) => {
  try {
    await getUserFromReq(req);
    const products = await db.collection('products').find().toArray();
    res.json({ ok: true, products });
  } catch (err) { res.status(401).json({ ok: false }); }
});

app.post('/api/products/get', async (req, res) => {
  try {
    await getUserFromReq(req);
    const { productId } = req.body;
    if (!productId) throw new Error('معرف المنتج مطلوب');
    const product = await db.collection('products').findOne({ id: productId });
    if (!product) throw new Error('المنتج غير موجود');
    res.json({ ok: true, product });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

app.post('/api/products/add', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (user.role === 'user') throw new Error('ليس لديك صلاحية');

    const { name, description, image, prices, category, badge, discount } = req.body;
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 150) {
      throw new Error('اسم المنتج مطلوب وبحد أقصى 150 حرفًا');
    }
    const cleanPrices = validatePrices(prices || {});
    const cleanDiscount = Number(discount || 0);
    if (!Number.isFinite(cleanDiscount) || cleanDiscount < 0 || cleanDiscount > 100) {
      throw new Error('نسبة الخصم يجب أن تكون بين 0 و100');
    }
    const id = Date.now().toString();
    const slug = 'product-' + id;

    const newProduct = {
      id, slug, link: '#' + slug,
      name: name.trim(),
      description: typeof description === 'string' ? description.slice(0, 5000) : 'لا يوجد وصف',
      image: typeof image === 'string' ? image : '',
      prices: cleanPrices,
      category: category || 'all',
      badge: badge || '',
      discount: cleanDiscount,
      soldCount: 0,
      creatorId: user.id,
      creatorName: user.name,
      createdAt: new Date().toISOString()
    };

    await db.collection('products').insertOne(newProduct);
    res.json({ ok: true, product: newProduct, link: newProduct.link });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

app.post('/api/products/edit', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    const { productId, name, description, image, prices, category, badge, discount } = req.body;

    const product = await db.collection('products').findOne({ id: productId });
    if (!product) throw new Error('المنتج غير موجود');

    if (user.role === 'owner' || user.role === 'admin' || (user.role === 'moderator' && product.creatorId === user.id)) {
      const updateData = {};
      if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 150) throw new Error('اسم المنتج غير صحيح');
        updateData.name = name.trim();
      }
      if (description !== undefined) {
        if (typeof description !== 'string') throw new Error('الوصف غير صحيح');
        updateData.description = description.slice(0, 5000);
      }
      if (image !== undefined) {
        if (typeof image !== 'string') throw new Error('رابط الصورة غير صحيح');
        updateData.image = image;
      }
      if (prices !== undefined) updateData.prices = validatePrices(prices);
      if (category !== undefined) updateData.category = category;
      if (badge !== undefined) updateData.badge = badge;
      if (discount !== undefined) {
        const cleanDiscount = Number(discount);
        if (!Number.isFinite(cleanDiscount) || cleanDiscount < 0 || cleanDiscount > 100) throw new Error('نسبة الخصم يجب أن تكون بين 0 و100');
        updateData.discount = cleanDiscount;
      }

      await db.collection('products').updateOne({ id: productId }, { $set: updateData });
      res.json({ ok: true });
    } else {
      throw new Error('ليس لديك صلاحية لتعديل هذا المنتج');
    }
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

app.post('/api/products/delete', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    const { productId } = req.body;

    const product = await db.collection('products').findOne({ id: productId });
    if (!product) throw new Error('المنتج غير موجود');

    if (user.role === 'owner' || user.role === 'admin' || (user.role === 'moderator' && product.creatorId === user.id)) {
      await db.collection('products').deleteOne({ id: productId });
      res.json({ ok: true });
    } else {
      throw new Error('ليس لديك صلاحية لحذف هذا المنتج');
    }
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

app.post('/api/products/increment-sold', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!['owner', 'admin'].includes(user.role)) throw new Error('ليس لديك صلاحية لتعديل عدد المبيعات');
    const { productId } = req.body;
    if (!productId) throw new Error('معرف المنتج مطلوب');
    const result = await db.collection('products').updateOne(
      { id: String(productId) },
      { $inc: { soldCount: 1 } }
    );
    if (!result.matchedCount) throw new Error('المنتج غير موجود');
    res.json({ ok: true });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

app.post('/api/users/promote', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    const targetId = String(req.body?.targetId || '');
    const newRole = req.body?.newRole;

    if (!targetId || !isValidRole(newRole)) throw new Error('بيانات الصلاحية غير صحيحة');
    if (targetId === user.id) throw new Error('لا يمكنك تغيير صلاحية حسابك من هنا');

    if (user.role === 'owner') {
      const target = await db.collection('users').findOne({ _id: targetId });
      if (!target) throw new Error('المستخدم غير موجود');
      if (target.role === 'owner') throw new Error('لا يمكن تغيير صلاحية المالك');
      await db.collection('users').updateOne({ _id: targetId }, { $set: { role: newRole } });
    } else if (user.role === 'admin' && newRole === 'moderator') {
      const target = await db.collection('users').findOne({ _id: targetId });
      if (!target || !['user', 'moderator'].includes(target.role)) throw new Error('لا يمكن تعديل صلاحية هذا المستخدم');
      await db.collection('users').updateOne({ _id: targetId }, { $set: { role: 'moderator' } });
    } else {
      throw new Error('ليس لديك صلاحية');
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(403).json({ ok: false, error: err.message });
  }
});

app.post('/api/users/list', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (user.role !== 'owner' && user.role !== 'admin') throw new Error('ليس لديك صلاحية');

    const staffList = await db.collection('users').find({ role: { $in: ['admin', 'moderator'] } }).toArray();
    const formattedStaff = staffList.map(u => ({ id: u._id, role: u.role, name: u.name || 'مستخدم' }));
    res.json({ ok: true, staff: formattedStaff });
  } catch (err) {
    res.status(403).json({ ok: false, error: err.message });
  }
});

app.post('/api/users/update-role', async (req, res) => {
  try {
    const requester = await getUserFromReq(req);
    const targetId = String(req.body?.targetId || '');
    const newRole = req.body?.newRole;

    if (!['owner', 'admin'].includes(requester.role)) throw new Error('ليس لديك صلاحية');
    if (!targetId || !['user', 'moderator', 'admin'].includes(newRole)) {
      throw new Error('الصلاحية المطلوبة غير صحيحة');
    }
    if (targetId === requester.id) throw new Error('لا يمكنك تغيير صلاحية حسابك');

    const targetUser = await db.collection('users').findOne({ _id: targetId });
    if (!targetUser) throw new Error('المستخدم غير موجود');

    if (targetUser.role === 'owner') throw new Error('لا يمكن تغيير صلاحية المالك');
    if (requester.role === 'admin') {
      if (targetUser.role === 'admin' || newRole === 'admin') {
        throw new Error('ليس لديك صلاحية لتعديل صلاحية مدير');
      }
      if (!['user', 'moderator'].includes(newRole)) throw new Error('ليس لديك صلاحية لهذه الرتبة');
    }

    await db.collection('users').updateOne({ _id: targetId }, { $set: { role: newRole } });
    res.json({ ok: true });
  } catch (err) {
    res.status(403).json({ ok: false, error: err.message });
  }
});

app.post('/api/store', async (req, res) => {
  try {
    await getUserFromReq(req);
    const store = await db.collection('store').findOne({ _id: 'main' });
    res.json({ ok: true, store });
  } catch (err) { res.status(401).json({ ok: false }); }
});

app.post('/api/store/update', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (user.role !== 'owner') throw new Error('للمالك فقط');

    const { name, cover, logo } = req.body;
    const updateData = {};
    if (name) updateData.name = name;
    if (cover !== undefined) updateData.cover = cover;
    if (logo !== undefined) updateData.logo = logo;

    await db.collection('store').updateOne({ _id: 'main' }, { $set: updateData });
    const store = await db.collection('store').findOne({ _id: 'main' });
    res.json({ ok: true, store });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

app.post('/api/store/update-links', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (user.role !== 'owner') throw new Error('للمالك فقط');
    const { links } = req.body;

    await db.collection('store').updateOne({ _id: 'main' }, { $set: { menuLinks: links } });
    res.json({ ok: true });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

// ✅ زر CTA الرئيسي
app.post('/api/store/update-hero-button', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (user.role !== 'owner') throw new Error('للمالك فقط');
    const { text, link, color } = req.body;
    const heroButton = {
      text: text || 'تسوق الآن',
      link: link || '#shop',
      color: color || '#4A90E2'
    };
    await db.collection('store').updateOne({ _id: 'main' }, { $set: { heroButton } });
    res.json({ ok: true, heroButton });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

/* =========================================================
   السلايدر
   ========================================================= */
app.post('/api/slider', async (req, res) => {
  try {
    await getUserFromReq(req);
    const slider = await db.collection('slider').findOne({ _id: 'main' });
    res.json({ ok: true, slides: slider?.slides || [] });
  } catch (err) { res.status(401).json({ ok: false }); }
});

app.post('/api/slider/add', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (user.role !== 'owner') throw new Error('للمالك فقط');
    const { image, title, btnText, btnLink } = req.body;
    if (!image) throw new Error('يجب إضافة صورة');
    const newSlide = { id: Date.now().toString(), image, title: title || '', btnText: btnText || '', btnLink: btnLink || '' };
    await db.collection('slider').updateOne({ _id: 'main' }, { $push: { slides: newSlide } });
    res.json({ ok: true, slide: newSlide });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

app.post('/api/slider/delete', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (user.role !== 'owner') throw new Error('للمالك فقط');
    const { slideId } = req.body;
    await db.collection('slider').updateOne({ _id: 'main' }, { $pull: { slides: { id: slideId } } });
    res.json({ ok: true });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

/* =========================================================
   الأقسام الديناميكية
   ========================================================= */
app.post('/api/sections', async (req, res) => {
  try {
    await getUserFromReq(req);
    const sections = await getSectionsList();
    res.json({ ok: true, sections });
  } catch (err) { res.status(401).json({ ok: false, error: err.message }); }
});

app.post('/api/sections/add', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (user.role !== 'owner' && user.role !== 'admin') throw new Error('ليس لديك صلاحية');
    const { title, type, image, content, buttonText, buttonLink, items } = req.body;
    if (!title) throw new Error('العنوان مطلوب');
    const allowedTypes = ['grid', 'text', 'image', 'products', 'banner'];
    if (!allowedTypes.includes(type)) throw new Error('نوع القسم غير مدعوم');

    const list = await getSectionsList();
    const newSection = {
      id: Date.now().toString(),
      title: title || '',
      type,
      image: image || '',
      content: content || '',
      buttonText: buttonText || '',
      buttonLink: buttonLink || '',
      items: Array.isArray(items) ? items : [],
      order: list.length,
      visible: true,
      creatorId: user.id,
      createdAt: new Date().toISOString()
    };
    list.push(newSection);
    await saveSectionsList(list);
    res.json({ ok: true, sectionId: newSection.id, section: newSection });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

app.post('/api/sections/edit', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (user.role !== 'owner' && user.role !== 'admin') throw new Error('ليس لديك صلاحية');
    const { sectionId, title, type, image, content, buttonText, buttonLink, items } = req.body;
    if (!sectionId) throw new Error('معرف القسم مطلوب');
    const list = await getSectionsList();
    const idx = list.findIndex(s => s.id === sectionId);
    if (idx === -1) throw new Error('القسم غير موجود');
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim() || title.length > 150) throw new Error('عنوان القسم غير صحيح');
      list[idx].title = title.trim();
    }
    if (type !== undefined) {
      if (!['grid', 'text', 'image', 'products', 'banner'].includes(type)) throw new Error('نوع القسم غير مدعوم');
      list[idx].type = type;
    }
    if (image !== undefined) list[idx].image = image;
    if (content !== undefined) list[idx].content = content;
    if (buttonText !== undefined) list[idx].buttonText = buttonText;
    if (buttonLink !== undefined) list[idx].buttonLink = buttonLink;
    if (items !== undefined) list[idx].items = Array.isArray(items) ? items : [];
    await saveSectionsList(list);
    res.json({ ok: true });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

app.post('/api/sections/delete', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (user.role !== 'owner' && user.role !== 'admin') throw new Error('ليس لديك صلاحية');
    const { sectionId } = req.body;
    if (!sectionId) throw new Error('معرف القسم مطلوب');
    let list = await getSectionsList();
    const before = list.length;
    list = list.filter(s => s.id !== sectionId);
    if (list.length === before) throw new Error('القسم غير موجود');
    list = list.sort((a, b) => (a.order || 0) - (b.order || 0)).map((s, i) => ({ ...s, order: i }));
    await saveSectionsList(list);
    res.json({ ok: true });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

app.post('/api/sections/toggle', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (user.role !== 'owner' && user.role !== 'admin') throw new Error('ليس لديك صلاحية');
    const { sectionId, visible } = req.body;
    if (!sectionId) throw new Error('معرف القسم مطلوب');
    const list = await getSectionsList();
    const idx = list.findIndex(s => s.id === sectionId);
    if (idx === -1) throw new Error('القسم غير موجود');
    list[idx].visible = !!visible;
    await saveSectionsList(list);
    res.json({ ok: true, visible: list[idx].visible });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

app.post('/api/sections/reorder', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (user.role !== 'owner' && user.role !== 'admin') throw new Error('ليس لديك صلاحية');
    const { orders } = req.body;
    if (!Array.isArray(orders)) throw new Error('بيانات الترتيب مطلوبة');
    let list = await getSectionsList();
    const orderMap = {};
    orders.forEach(o => { orderMap[o.id] = Number(o.order) || 0; });
    list = list.map(s => ({ ...s, order: (orderMap[s.id] !== undefined) ? orderMap[s.id] : (s.order || 0) }));
    list = list.sort((a, b) => (a.order || 0) - (b.order || 0)).map((s, i) => ({ ...s, order: i }));
    await saveSectionsList(list);
    res.json({ ok: true });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

/* =========================================================
   التصنيفات
   ========================================================= */
app.post('/api/categories', async (req, res) => {
  try {
    await getUserFromReq(req);
    const doc = await db.collection('categories').findOne({ _id: 'main' });
    const categories = (doc?.list || []).map(cat => ({
      ...cat,
      link: cat.id === 'all' ? '#shop' : `#category-${cat.id}`
    }));
    res.json({ ok: true, categories });
  } catch (err) { res.status(401).json({ ok: false, error: err.message }); }
});

app.post('/api/categories/save', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (user.role !== 'owner' && user.role !== 'admin') throw new Error('ليس لديك صلاحية');
    const { categories } = req.body;
    if (!Array.isArray(categories) || categories.length > 100) throw new Error('قائمة التصنيفات غير صحيحة');
    const ids = new Set();
    const cleanCategories = categories.map((cat) => {
      if (!cat || typeof cat !== 'object') throw new Error('بيانات تصنيف غير صحيحة');
      const id = String(cat.id || '').trim();
      const name = String(cat.name || '').trim();
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !name || name.length > 80 || ids.has(id)) throw new Error('اسم أو معرف التصنيف غير صالح');
      ids.add(id);
      return { id, name, icon: String(cat.icon || '📦').slice(0, 12), link: id === 'all' ? '#shop' : `#category-${id}` };
    });
    if (!cleanCategories.some(c => c.id === 'all')) cleanCategories.unshift({ id: 'all', name: 'الكل', icon: '🛍️', link: '#shop' });
    await db.collection('categories').updateOne({ _id: 'main' }, { $set: { list: cleanCategories } }, { upsert: true });
    res.json({ ok: true, categories: cleanCategories });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

/* =========================================================
   شارات المنتجات القابلة للإدارة
   ========================================================= */
app.post('/api/badges', async (req, res) => {
  try {
    await getUserFromReq(req);
    const doc = await db.collection('badges').findOne({ _id: 'main' });
    res.json({ ok: true, badges: doc?.list || [] });
  } catch (err) { res.status(401).json({ ok: false, error: err.message }); }
});

app.post('/api/badges/save', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!['owner', 'admin'].includes(user.role)) throw new Error('ليس لديك صلاحية');
    const { badges } = req.body;
    if (!Array.isArray(badges) || badges.length > 40) throw new Error('قائمة الشارات غير صحيحة');
    const ids = new Set();
    const cleanBadges = badges.map((badge) => {
      if (!badge || typeof badge !== 'object') throw new Error('بيانات شارة غير صحيحة');
      const id = String(badge.id || '').trim();
      const name = String(badge.name || '').trim();
      if (!/^[a-zA-Z0-9_-]{1,60}$/.test(id) || !name || name.length > 30 || ids.has(id)) throw new Error('اسم أو معرف الشارة غير صالح');
      ids.add(id);
      const color = /^#[0-9a-fA-F]{6}$/.test(String(badge.color || '')) ? badge.color : '#4A90E2';
      const textColor = /^#[0-9a-fA-F]{6}$/.test(String(badge.textColor || '')) ? badge.textColor : '#FFFFFF';
      return { id, name, icon: String(badge.icon || '🏷️').slice(0, 12), color, textColor };
    });
    if (!cleanBadges.some(b => b.id === 'new')) cleanBadges.unshift({ id: 'new', name: 'جديد', icon: '⚡', color: '#4AE2A0', textColor: '#07131F' });
    if (!cleanBadges.some(b => b.id === 'featured')) cleanBadges.push({ id: 'featured', name: 'مميز', icon: '⭐', color: '#F39C12', textColor: '#FFFFFF' });
    await db.collection('badges').updateOne({ _id: 'main' }, { $set: { list: cleanBadges } }, { upsert: true });
    res.json({ ok: true, badges: cleanBadges });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

/* =========================================================
   ✅ الأيقونات المربعة
   ========================================================= */
app.post('/api/quick-icons', async (req, res) => {
  try {
    await getUserFromReq(req);
    const icons = await getQuickIconsList();
    res.json({ ok: true, icons });
  } catch (err) { res.status(401).json({ ok: false, error: err.message }); }
});

app.post('/api/quick-icons/save', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (user.role !== 'owner' && user.role !== 'admin') throw new Error('ليس لديك صلاحية');
    const { icons } = req.body;
    if (!Array.isArray(icons)) throw new Error('بيانات غير صحيحة');
    await saveQuickIconsList(icons);
    res.json({ ok: true });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

/* =========================================================
   Health + تشغيل
   ========================================================= */
app.get('/health', (req, res) => res.status(200).send('OK'));
app.head('/health', (req, res) => res.status(200).end());

const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await connectDB();
    app.listen(PORT, () => console.log(`✅ الخادم يعمل على المنفذ ${PORT}`));
  } catch (err) {
    console.error('❌ تعذر تشغيل الخادم:', err.message);
    process.exit(1);
  }
}

startServer();
