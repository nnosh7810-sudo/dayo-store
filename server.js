const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

const BOT_TOKEN = '8944449366:AAF-2I10o__647D8eAxlatu_pipO1n8KCW4';
const MONGODB_URI = process.env.MONGODB_URI;

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
    if (!await usersCollection.findOne({ _id: '51442749' })) {
      await usersCollection.insertOne({ _id: '51442749', role: 'owner', name: 'المالك' });
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
    console.error('❌ فشل الاتصال بقاعدة البيانات:', err.message);
  }
}
connectDB();

/* =========================================================
   دوال مساعدة
   ========================================================= */
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

async function getUserFromReq(req) {
  const { initData } = req.body;
  if (!initData) throw new Error('مفقود');
  const parsed = verifyTelegramData(initData, BOT_TOKEN);
  const userId = parsed.user.id.toString();

  // ✅ تحديث lastSeen + اسم المستخدم
  const now = new Date();
  const existing = await db.collection('users').findOne({ _id: userId });
  if (existing) {
    await db.collection('users').updateOne(
      { _id: userId },
      { $set: { lastSeen: now, name: parsed.user.first_name || existing.name || 'مستخدم' } }
    );
  } else {
    await db.collection('users').insertOne({
      _id: userId,
      role: 'user',
      name: parsed.user.first_name || 'مستخدم',
      joinedAt: now,
      lastSeen: now
    });
  }

  const dbUser = await db.collection('users').findOne({ _id: userId });
  return { id: userId, role: dbUser?.role || 'user', name: dbUser?.name || parsed.user.first_name };
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
    const id = Date.now().toString();
    const slug = 'product-' + id;

    const newProduct = {
      id, slug, link: '#' + slug,
      name,
      description: description || 'لا يوجد وصف',
      image: image || '',
      prices: prices || { usd: 0, ton: 0, stars: 0, sar: 0 },
      category: category || 'all',
      badge: badge || '',
      discount: parseFloat(discount) || 0,
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
      if (name) updateData.name = name;
      if (description) updateData.description = description;
      if (image !== undefined) updateData.image = image;
      if (prices) updateData.prices = prices;
      if (category !== undefined) updateData.category = category;
      if (badge !== undefined) updateData.badge = badge;
      if (discount !== undefined) updateData.discount = parseFloat(discount) || 0;

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
    await getUserFromReq(req);
    const { productId } = req.body;
    if (!productId) throw new Error('معرف المنتج مطلوب');
    await db.collection('products').updateOne({ id: productId }, { $inc: { soldCount: 1 } });
    res.json({ ok: true });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

app.post('/api/users/promote', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    const { targetId, newRole } = req.body;

    if (user.role === 'owner') {
      await db.collection('users').updateOne({ _id: targetId }, { $set: { role: newRole } }, { upsert: true });
    } else if (user.role === 'admin' && newRole === 'moderator') {
      await db.collection('users').updateOne({ _id: targetId }, { $set: { role: 'moderator' } }, { upsert: true });
    } else {
      throw new Error('ليس لديك صلاحية');
    }
    res.json({ ok: true });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
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
    const { targetId, newRole } = req.body;

    if (requester.role !== 'owner' && requester.role !== 'admin') throw new Error('ليس لديك صلاحية');

    const targetUser = await db.collection('users').findOne({ _id: targetId });
    if (!targetUser) throw new Error('المستخدم غير موجود');

    if (requester.role === 'admin' && (targetUser.role === 'owner' || targetUser.role === 'admin')) {
      throw new Error('ليس لديك صلاحية لتعديل هذا الشخص');
    }

    if (newRole === 'user') {
      await db.collection('users').deleteOne({ _id: targetId });
    } else {
      await db.collection('users').updateOne({ _id: targetId }, { $set: { role: newRole } });
    }
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
    if (title !== undefined) list[idx].title = title;
    if (type !== undefined) list[idx].type = type;
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
    res.json({ ok: true, categories: doc?.list || [] });
  } catch (err) { res.status(401).json({ ok: false, error: err.message }); }
});

app.post('/api/categories/save', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (user.role !== 'owner' && user.role !== 'admin') throw new Error('ليس لديك صلاحية');
    const { categories } = req.body;
    if (!Array.isArray(categories)) throw new Error('بيانات غير صحيحة');
    await db.collection('categories').updateOne({ _id: 'main' }, { $set: { list: categories } }, { upsert: true });
    res.json({ ok: true });
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
app.listen(PORT, () => console.log(`✅ الخادم يعمل على المنفذ ${PORT}`));
