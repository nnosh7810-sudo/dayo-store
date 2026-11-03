const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { Address, beginCell } = require('@ton/core');
const { TonClient } = require('@ton/ton');

const app = express();
app.use(express.json({ limit: '10mb', verify: (req, res, buffer) => { req.rawBody = buffer.toString('utf8'); } }));
app.use(express.static('public'));

// حد بسيط للطلبات لمنع الإغراق
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

// لا تضع أسرار البوت أو قاعدة البيانات داخل الكود
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI;
const OWNER_TELEGRAM_ID = process.env.OWNER_TELEGRAM_ID || '51442749';
const ENV_TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const ENV_PUBLIC_BASE_URL = String(process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
const TONCENTER_API_KEY = String(process.env.TONCENTER_API_KEY || '').trim();
const TON_USDT_MASTER_ADDRESS = String(process.env.TON_USDT_MASTER_ADDRESS || 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs').trim();
const TON_NETWORK = '-239';

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

// دوال تشفير أسرار الدفع (مستخدمة الآن فقط لـ Telegram Stars)
function paymentEncryptionKey() {
  return crypto.createHash('sha256').update(`${BOT_TOKEN}:DAYO_PAYMENT_SETTINGS_V1`).digest();
}
function encryptPaymentSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', paymentEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('hex')}`;
}
function decryptPaymentSecret(value) {
  if (!value || typeof value !== 'string') return '';
  try {
    const [ivHex, tagHex, dataHex] = value.split('.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', paymentEncryptionKey(), Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  } catch (_) { return ''; }
}

async function getPaymentConfigRaw() {
  const store = await db.collection('store').findOne({ _id: 'main' });
  return store?.paymentSettings || {};
}
async function getStarsWebhookSecret() {
  const saved = await getPaymentConfigRaw();
  return decryptPaymentSecret(saved.starsWebhookSecretEnc) || ENV_TELEGRAM_WEBHOOK_SECRET;
}
async function getTonReceiverAddress() {
  const saved = await getPaymentConfigRaw();
  const address = String(saved.tonReceiverAddress || '').trim();
  if (!address) throw new Error('أدخل عنوان محفظة الاستقبال من لوحة تحكم DAYO أولًا');
  try { return Address.parse(address); }
  catch (_) { throw new Error('عنوان محفظة الاستقبال المحفوظ في لوحة التحكم غير صالح'); }
}
async function getPublicBaseUrl() {
  const saved = await getPaymentConfigRaw();
  return String(saved.publicBaseUrl || ENV_PUBLIC_BASE_URL || '').replace(/\/$/, '');
}

function getTonClient() {
  if (!TONCENTER_API_KEY) throw new Error('أضف TONCENTER_API_KEY في إعدادات Render لتفعيل التحقق من معاملات TON');
  return new TonClient({ endpoint: 'https://toncenter.com/api/v2/jsonRPC', apiKey: TONCENTER_API_KEY });
}
function decimalToUnits(value, decimals) {
  const text = String(value);
  if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error('قيمة الدفع غير صالحة');
  const [whole, fraction = ''] = text.split('.');
  if (fraction.length > decimals) throw new Error('عدد المنازل العشرية يتجاوز دقة العملة');
  return (BigInt(whole) * (10n ** BigInt(decimals)) + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0')).toString();
}
function normalizeTonAddress(value) {
  try { return Address.parse(String(value)).toRawString().toLowerCase(); }
  catch (_) { throw new Error('عنوان محفظة TON غير صالح'); }
}
function createOrderComment(orderCode) {
  return beginCell().storeUint(0, 32).storeStringTail(String(orderCode)).endCell();
}
async function getJettonWalletAddress(ownerAddress) {
  const client = getTonClient();
  const owner = Address.parse(ownerAddress);
  const result = await client.runMethod(Address.parse(TON_USDT_MASTER_ADDRESS), 'get_wallet_address', [
    { type: 'slice', cell: beginCell().storeAddress(owner).endCell() }
  ]);
  return result.stack.readAddress();
}
function cellComment(cell) {
  try {
    const slice = cell.beginParse();
    if (slice.remainingBits < 32 || slice.loadUint(32) !== 0) return '';
    return slice.loadStringTail();
  } catch (_) { return ''; }
}
function txHashHex(tx) {
  try { return tx.hash().toString('hex'); } catch (_) { return String(tx.lt || ''); }
}
function transactionIsSuccessful(tx) {
  if (!tx || !tx.inMessage) return false;
  const desc = tx.description || {};
  if (desc.aborted === true || desc.destroyed === true) return false;
  if (desc.computePhase?.success === false || desc.actionPhase?.success === false) return false;
  return true;
}
async function verifyTonConnectOrder(order) {
  const client = getTonClient();
  const receiver = await getTonReceiverAddress();
  const expectedSender = normalizeTonAddress(order.tonSenderAddress || '');
  const since = Math.floor(new Date(order.createdAt).getTime() / 1000) - 120;
  const transactions = await client.getTransactions(receiver, { limit: 100 });

  if (order.currency === 'ton') {
    const expectedAmount = BigInt(decimalToUnits(order.total, 9));
    for (const tx of transactions) {
      if (!transactionIsSuccessful(tx) || !tx.inMessage) continue;
      const info = tx.inMessage.info;
      if (info.type !== 'internal' || info.bounced === true || info.dest.toRawString().toLowerCase() !== receiver.toRawString().toLowerCase()) continue;
      if (normalizeTonAddress(info.src.toRawString()) !== expectedSender) continue;
      if (BigInt(info.value.coins) !== expectedAmount) continue;
      if (Number(tx.now || 0) < since) continue;
      if (cellComment(tx.inMessage.body) !== order.orderCode) continue;
      return { paid: true, reference: txHashHex(tx) };
    }
    return { paid: false };
  }

  if (order.currency === 'usd') {
    const recipientJettonWallet = await getJettonWalletAddress(receiver.toString({ urlSafe: true, bounceable: true }));
    const expectedAmount = BigInt(decimalToUnits(order.total, 6));
    for (const tx of transactions) {
      if (!transactionIsSuccessful(tx) || !tx.inMessage) continue;
      const info = tx.inMessage.info;
      if (info.type !== 'internal' || info.bounced === true || info.dest.toRawString().toLowerCase() !== receiver.toRawString().toLowerCase()) continue;
      if (info.src.toRawString().toLowerCase() !== recipientJettonWallet.toRawString().toLowerCase()) continue;
      if (Number(tx.now || 0) < since) continue;
      const slice = tx.inMessage.body.beginParse();
      if (slice.remainingBits < 32 || slice.loadUint(32) !== 0x7362d09c) continue;
      slice.loadUintBig(64);
      const amount = slice.loadCoins();
      const sender = slice.loadAddress();
      const hasRef = slice.loadBit();
      const forwardPayload = hasRef ? slice.loadRef() : slice.asCell();
      if (sender.toRawString().toLowerCase() !== expectedSender) continue;
      if (BigInt(amount) !== expectedAmount) continue;
      if (cellComment(forwardPayload) !== order.orderCode) continue;
      if (tx.outMessages && tx.outMessages.size > 0) continue;
      return { paid: true, reference: txHashHex(tx) };
    }
    return { paid: false };
  }
  throw new Error('عملة TON Connect غير مدعومة لهذا الطلب');
}

async function connectDB() {
  try {
    await client.connect();
    db = client.db('dayoStore');
    await db.collection('orders').createIndex({ id: 1 }, { unique: true });
    await db.collection('orders').createIndex({ userId: 1, createdAt: -1 });
    await db.collection('orders').createIndex({ status: 1, createdAt: -1 });
    await db.collection('notifications').createIndex({ userId: 1, createdAt: -1 });
    await db.collection('notifications').createIndex({ userId: 1, readAt: 1 });
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
        heroButton: { text: 'تسوق الآن', link: '#shop', color: '#4A90E2' },
        paymentSettings: {
          manualEnabled: true,
          manualInstructions: '',
          manualPaymentUsername: '',
          tonConnectEnabled: true,
          tonReceiverAddress: '',
          cryptoTonEnabled: true,
          cryptoUsdtEnabled: true,
          starsEnabled: true,
          publicBaseUrl: ''
        }
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

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (authDate > nowSeconds + 30 || nowSeconds - authDate > 86400) {
    throw new Error('انتهت صلاحية جلسة تيليجرام، أعد فتح المتجر');
  }

  urlParams.delete('hash');
  const dataCheckString = Array.from(urlParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest();
  const receivedHash = Buffer.from(hash, 'hex');

  if (receivedHash.length !== calculatedHash.length ||
      !crypto.timingSafeEqual(calculatedHash, receivedHash)) {
    throw new Error('توقيع تيليجرام غير صالح');
  }

  let user;
  try { user = JSON.parse(userJson); } catch { throw new Error('بيانات مستخدم تيليجرام غير صالحة'); }
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

  await db.collection('users').updateOne(
    { _id: userId },
    { $set: { lastSeen: now, name: displayName }, $setOnInsert: { role: 'user', joinedAt: now } },
    { upsert: true }
  );

  const dbUser = await db.collection('users').findOne({ _id: userId });
  return { id: userId, role: dbUser?.role || 'user', name: dbUser?.name || displayName };
}

function isValidRole(role) { return ['user', 'moderator', 'admin'].includes(role); }

function validatePrices(prices) {
  if (!prices || typeof prices !== 'object' || Array.isArray(prices)) throw new Error('بيانات الأسعار غير صحيحة');
  const allowed = ['usd', 'ton', 'stars', 'sar'];
  const clean = {};
  for (const key of allowed) {
    const value = prices[key] === undefined ? 0 : Number(prices[key]);
    if (!Number.isFinite(value) || value < 0 || value > 100000000) throw new Error(`قيمة السعر ${key} غير صحيحة`);
    clean[key] = value;
  }
  return clean;
}

async function getSectionsList() { const doc = await db.collection('sections').findOne({ _id: 'main' }); return doc?.list || []; }
async function saveSectionsList(list) { await db.collection('sections').updateOne({ _id: 'main' }, { $set: { list } }, { upsert: true }); }
async function getQuickIconsList() { const doc = await db.collection('quickIcons').findOne({ _id: 'main' }); return doc?.list || []; }
async function saveQuickIconsList(list) { await db.collection('quickIcons').updateOne({ _id: 'main' }, { $set: { list } }, { upsert: true }); }

/* =========================================================
   المسارات (API)
   ========================================================= */

app.post('/api/me', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    res.json({ ok: true, user });
  } catch (err) { res.status(401).json({ ok: false }); }
});

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
    const productType = req.body?.productType === 'physical' ? 'physical' : 'digital';
    const requestedMethods = Array.isArray(req.body?.paymentMethods) ? req.body.paymentMethods : ['stars'];
    const allowedMethodSet = new Set(['stars', 'ton', 'usd', 'sar']);
    const paymentMethods = productType === 'digital' ? ['stars'] : [...new Set(requestedMethods.map(v => String(v).toLowerCase()).filter(v => allowedMethodSet.has(v)))];
    if (!paymentMethods.length) throw new Error('اختر طريقة دفع واحدة على الأقل للمنتج المادي');
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 150) throw new Error('اسم المنتج مطلوب وبحد أقصى 150 حرفًا');
    const cleanPrices = validatePrices(prices || {});
    const cleanDiscount = Number(discount || 0);
    if (!Number.isFinite(cleanDiscount) || cleanDiscount < 0 || cleanDiscount > 100) throw new Error('نسبة الخصم يجب أن تكون بين 0 و100');
    const id = Date.now().toString();
    const slug = 'product-' + id;

    const newProduct = {
      id, slug, link: '#' + slug,
      name: name.trim(),
      description: typeof description === 'string' ? description.slice(0, 5000) : 'لا يوجد وصف',
      image: typeof image === 'string' ? image : '',
      prices: cleanPrices,
      productType, paymentMethods,
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
      if (req.body?.productType !== undefined || req.body?.paymentMethods !== undefined) {
        const productType = req.body?.productType === 'physical' ? 'physical' : 'digital';
        const requestedMethods = Array.isArray(req.body?.paymentMethods) ? req.body.paymentMethods : (product.paymentMethods || ['stars']);
        const allowedMethodSet = new Set(['stars', 'ton', 'usd', 'sar']);
        const paymentMethods = productType === 'digital' ? ['stars'] : [...new Set(requestedMethods.map(v => String(v).toLowerCase()).filter(v => allowedMethodSet.has(v)))];
        if (!paymentMethods.length) throw new Error('اختر طريقة دفع واحدة على الأقل للمنتج المادي');
        updateData.productType = productType;
        updateData.paymentMethods = paymentMethods;
      }
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
    if (!targetId || !['user', 'moderator', 'admin'].includes(newRole)) throw new Error('الصلاحية المطلوبة غير صحيحة');
    if (targetId === requester.id) throw new Error('لا يمكنك تغيير صلاحية حسابك');

    const targetUser = await db.collection('users').findOne({ _id: targetId });
    if (!targetUser) throw new Error('المستخدم غير موجود');

    if (targetUser.role === 'owner') throw new Error('لا يمكن تغيير صلاحية المالك');
    if (requester.role === 'admin') {
      if (targetUser.role === 'admin' || newRole === 'admin') throw new Error('ليس لديك صلاحية لتعديل صلاحية مدير');
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

app.post('/api/store/update-hero-button', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (user.role !== 'owner') throw new Error('للمالك فقط');
    const { text, link, color } = req.body;
    const heroButton = { text: text || 'تسوق الآن', link: link || '#shop', color: color || '#4A90E2' };
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
   شارات المنتجات
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
   الأيقونات المربعة
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
   إشعارات + بوابات الدفع
   ========================================================= */
async function addNotification(userId, title, body, type = 'info', link = 'orders', meta = {}) {
  if (!userId) return;
  await db.collection('notifications').insertOne({
    id: crypto.randomUUID(), userId: String(userId),
    title: String(title || '').slice(0, 120), body: String(body || '').slice(0, 500),
    type: ['success', 'warning', 'offer', 'info'].includes(type) ? type : 'info',
    link: String(link || 'orders').slice(0, 120), meta,
    readAt: null, createdAt: new Date()
  });
}

async function notifyAdmins(title, body, type = 'info', link = 'admin-orders') {
  const admins = await db.collection('users').find({ role: { $in: ['owner', 'admin'] } }, { projection: { _id: 1 } }).toArray();
  await Promise.all(admins.map(admin => addNotification(String(admin._id), title, body, type, link)));
}

async function telegramApi(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.description || `Telegram API ${method} failed`);
  return data.result;
}

async function createStarsInvoice(order) {
  const webhookSecret = await getStarsWebhookSecret();
  const publicBaseUrl = await getPublicBaseUrl();
  if (!webhookSecret || !publicBaseUrl) throw new Error('دفع Stars غير مهيأ. افتح إعدادات الدفع في لوحة التحكم وأكمل إعداد Webhook.');
  const title = `DAYO ${order.orderCode}`.slice(0, 32);
  const description = `دفع طلب DAYO STORE رقم ${order.orderCode}`.slice(0, 255);
  return telegramApi('createInvoiceLink', {
    title, description, payload: order.id, provider_token: '', currency: 'XTR',
    prices: [{ label: `طلب ${order.orderCode}`.slice(0, 32), amount: Math.round(order.total) }]
  });
}

async function markOrderPaid(order, source, chargeReference = '') {
  const orders = db.collection('orders');
  const now = new Date();
  const result = await orders.updateOne(
    { id: order.id, status: 'awaiting_payment', paymentStatus: { $ne: 'paid' } },
    { $set: {
      status: 'paid', statusLabel: ORDER_STATUS_LABELS.paid, paymentStatus: 'paid',
      paidAt: now, updatedAt: now, paymentConfirmedBy: source,
      paymentReference: String(chargeReference || '').slice(0, 300)
    } }
  );
  if (result.modifiedCount) {
    if (!order.salesCountedAt) {
      await orders.updateOne({ id: order.id, $or: [{ salesCountedAt: null }, { salesCountedAt: { $exists: false } }] }, { $set: { salesCountedAt: now } });
      for (const line of order.items || []) {
        await db.collection('products').updateOne({ id: line.productId }, { $inc: { soldCount: Number(line.quantity) || 1 } });
      }
    }
    await Promise.allSettled([
      addNotification(order.userId, 'تم تأكيد الدفع', `تم استلام دفعة طلبك ${order.orderCode} بنجاح. طلبك بانتظار التنفيذ.`, 'success', 'orders', { orderId: order.id }),
      notifyAdmins('تم استلام دفعة', `تم تأكيد دفع الطلب ${order.orderCode}.`, 'success')
    ]);
  }
  return result.modifiedCount > 0;
}

app.post('/api/notifications/mine', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    const rows = await db.collection('notifications').find({ userId: String(user.id) }).sort({ createdAt: -1 }).limit(100).toArray();
    const unread = rows.filter(row => !row.readAt).length;
    res.json({ ok: true, unread, notifications: rows.map(({ _id, ...row }) => row) });
  } catch (err) { res.status(401).json({ ok: false, error: err.message }); }
});

app.post('/api/notifications/read', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 100) : [];
    const filter = { userId: String(user.id), readAt: null };
    if (ids.length) filter.id = { $in: ids };
    const result = await db.collection('notifications').updateMany(filter, { $set: { readAt: new Date() } });
    res.json({ ok: true, modified: result.modifiedCount });
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});

/* Webhook Telegram Stars */
app.post('/api/telegram/webhook', async (req, res) => {
  try {
    const webhookSecret = await getStarsWebhookSecret();
    if (!webhookSecret || req.headers['x-telegram-bot-api-secret-token'] !== webhookSecret) return res.status(401).send('Unauthorized');
    const update = req.body || {};
    if (update.pre_checkout_query) {
      const query = update.pre_checkout_query;
      const order = await db.collection('orders').findOne({ id: String(query.invoice_payload || ''), paymentMethod: 'stars', status: 'awaiting_payment' });
      const valid = !!order && String(order.userId) === String(query.from?.id) && query.currency === 'XTR' && Number(query.total_amount) === Math.round(Number(order.total));
      await telegramApi('answerPreCheckoutQuery', { pre_checkout_query_id: query.id, ok: valid, ...(valid ? {} : { error_message: 'تعذر التحقق من الطلب. أعد إنشاء الطلب من DAYO STORE.' }) });
    }
    const message = update.message;
    const payment = message?.successful_payment;
    if (payment) {
      const order = await db.collection('orders').findOne({ id: String(payment.invoice_payload || ''), paymentMethod: 'stars' });
      if (order && String(order.userId) === String(message.from?.id) && payment.currency === 'XTR' && Number(payment.total_amount) === Math.round(Number(order.total))) {
        await db.collection('orders').updateOne({ id: order.id }, { $set: { telegramPaymentChargeId: payment.telegram_payment_charge_id || '', providerPaymentChargeId: payment.provider_payment_charge_id || '' } });
        await markOrderPaid(order, 'telegram_stars', payment.telegram_payment_charge_id || '');
      }
    }
    res.status(200).send('OK');
  } catch (err) { console.error('Telegram payment webhook error:', err.message); res.status(200).send('OK'); }
});

/* =========================================================
   DAYO ORDERS V1 — الطلبات والدفع
   ========================================================= */
const ORDER_STATUSES = ['awaiting_payment', 'paid', 'processing', 'completed', 'cancelled', 'rejected'];
const ORDER_STATUS_LABELS = {
  awaiting_payment: 'بانتظار الدفع', paid: 'تم تأكيد الدفع', processing: 'قيد التنفيذ',
  completed: 'مكتمل', cancelled: 'ملغي', rejected: 'مرفوض'
};
const ORDER_CURRENCIES = ['sar', 'usd', 'ton', 'stars'];

function cleanOrderCurrency(value) {
  const currency = String(value || '').toLowerCase();
  if (!ORDER_CURRENCIES.includes(currency)) throw new Error('عملة الطلب غير مدعومة');
  return currency;
}
function orderRound(value, currency) {
  return currency === 'stars' ? Math.round(value) : Math.round((value + Number.EPSILON) * 1000000) / 1000000;
}
function moneyForServer(value, currency) { return `${Number(value || 0)} ${{sar:'ر.س',usd:'USDT',ton:'TON',stars:'⭐'}[currency] || currency}`; }

function getDiscountedUnitPrice(product, currency) {
  const raw = Number(product?.prices?.[currency] || 0);
  if (!Number.isFinite(raw) || raw <= 0) throw new Error(`المنتج ${product?.name || ''} لا يملك سعرًا بهذه العملة`);
  const discount = Math.min(100, Math.max(0, Number(product.discount) || 0));
  return orderRound(raw * (1 - discount / 100), currency);
}

async function getPaymentSettings() {
  const saved = await getPaymentConfigRaw();
  const publicBaseUrl = await getPublicBaseUrl();
  const starsSecret = await getStarsWebhookSecret();
  return {
    manualEnabled: saved.manualEnabled !== false,
    manualInstructions: typeof saved.manualInstructions === 'string' ? saved.manualInstructions : '',
    manualPaymentUsername: typeof saved.manualPaymentUsername === 'string' ? saved.manualPaymentUsername : '',
    tonConnectEnabled: saved.tonConnectEnabled !== false,
    tonConnectReady: !!saved.tonReceiverAddress && !!TONCENTER_API_KEY,
    tonReceiverAddress: String(saved.tonReceiverAddress || ''),
    tonUsdtMasterAddress: TON_USDT_MASTER_ADDRESS,
    cryptoTonEnabled: saved.cryptoTonEnabled !== false,
    cryptoUsdtEnabled: saved.cryptoUsdtEnabled !== false,
    starsEnabled: saved.starsEnabled !== false && !!(starsSecret && publicBaseUrl) && (saved.starsWebhookConfigured === true || !!(ENV_TELEGRAM_WEBHOOK_SECRET && ENV_PUBLIC_BASE_URL)),
    starsSecretConfigured: !!starsSecret,
    publicBaseUrl,
    telegramWebhookUrl: publicBaseUrl ? `${publicBaseUrl}/api/telegram/webhook` : '',
    telegramWebhookReady: !!(starsSecret && publicBaseUrl),
    telegramWebhookConfigured: saved.starsWebhookConfigured === true || !!(ENV_TELEGRAM_WEBHOOK_SECRET && ENV_PUBLIC_BASE_URL)
  };
}

app.post('/api/payments/settings', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    const settings = await getPaymentSettings();
    res.json({ ok: true, settings, role: user.role });
  } catch (err) { res.status(401).json({ ok: false, error: err.message }); }
});

app.post('/api/payments/settings/save', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!['owner', 'admin'].includes(user.role)) throw new Error('ليس لديك صلاحية');
    const manualEnabled = req.body?.manualEnabled !== false;
    const manualInstructions = String(req.body?.manualInstructions || '').trim().slice(0, 2000);
    const manualPaymentUsername = String(req.body?.manualPaymentUsername || '').trim().replace(/^@/, '');
    const tonConnectEnabled = req.body?.tonConnectEnabled !== false;
    const tonReceiverAddressInput = String(req.body?.tonReceiverAddress || '').trim();
    const previous = await getPaymentConfigRaw();
    const currentReceiverAddress = String(previous.tonReceiverAddress || '').trim();
    if (tonReceiverAddressInput !== currentReceiverAddress && user.role !== 'owner') throw new Error('تغيير عنوان محفظة الاستقبال متاح للمالك فقط');
    if (tonReceiverAddressInput) normalizeTonAddress(tonReceiverAddressInput);
    if (tonConnectEnabled && !tonReceiverAddressInput && !currentReceiverAddress) throw new Error('أدخل عنوان محفظة الاستقبال من لوحة التحكم أولًا');
    const cryptoTonEnabled = req.body?.cryptoTonEnabled !== false;
    const cryptoUsdtEnabled = req.body?.cryptoUsdtEnabled !== false;
    const starsEnabled = req.body?.starsEnabled === true;
    const publicBaseUrl = String(req.body?.publicBaseUrl || '').trim().replace(/\/$/, '');
    if (manualEnabled && !/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(manualPaymentUsername)) throw new Error('أدخل يوزر تيليجرام صحيحًا لحساب استقبال الدفع');
    if ((tonConnectEnabled || starsEnabled) && !/^https:\/\//i.test(publicBaseUrl)) throw new Error('أدخل رابط المتجر العام ويجب أن يبدأ بـ https://');
    const baseUrlChanged = !!(previous.publicBaseUrl && previous.publicBaseUrl !== publicBaseUrl);
    const paymentSettings = {
      ...previous,
      manualEnabled, manualInstructions, manualPaymentUsername,
      tonConnectEnabled, cryptoTonEnabled, cryptoUsdtEnabled, starsEnabled,
      tonReceiverAddress: tonReceiverAddressInput || currentReceiverAddress,
      publicBaseUrl,
      updatedAt: new Date(), updatedBy: String(user.id)
    };
    if (baseUrlChanged) { paymentSettings.starsWebhookConfigured = false; }
    if (starsEnabled && !previous.starsWebhookSecretEnc && !ENV_TELEGRAM_WEBHOOK_SECRET) {
      paymentSettings.starsWebhookSecretEnc = encryptPaymentSecret(crypto.randomBytes(32).toString('hex'));
    }
    await db.collection('store').updateOne({ _id: 'main' }, { $set: { paymentSettings } }, { upsert: true });
    res.json({ ok: true, settings: await getPaymentSettings() });
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});

app.post('/api/payments/telegram-webhook/setup', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!['owner', 'admin'].includes(user.role)) throw new Error('ليس لديك صلاحية');
    const settings = await getPaymentSettings();
    if (!settings.telegramWebhookReady) throw new Error('احفظ إعدادات Stars ورابط المتجر أولًا');
    const info = await telegramApi('getWebhookInfo', {});
    const target = settings.telegramWebhookUrl;
    if (info?.url && info.url !== target) {
      return res.status(409).json({ ok: false, conflict: true, existingUrl: info.url, error: 'للبوت Webhook آخر. لم نغيّره حفاظًا على وظائف البوت الحالية.' });
    }
    const secret = await getStarsWebhookSecret();
    await telegramApi('setWebhook', { url: target, secret_token: secret, allowed_updates: ['message', 'pre_checkout_query'] });
    await db.collection('store').updateOne({ _id: 'main' }, { $set: { 'paymentSettings.starsWebhookConfigured': true, 'paymentSettings.starsWebhookUpdatedAt': new Date() } });
    res.json({ ok: true, message: 'تم ربط Webhook الخاص بـ Telegram Stars بنجاح.' });
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});

function productAllowsCurrency(product, currency) {
  const type = product?.productType === 'physical' ? 'physical' : 'digital';
  if (type === 'digital') return currency === 'stars';
  const methods = Array.isArray(product?.paymentMethods) ? product.paymentMethods : ['stars'];
  return methods.includes(currency);
}

app.post('/api/orders/create', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    const currency = cleanOrderCurrency(req.body?.currency);
    const paymentMethod = currency === 'sar' ? 'manual' : (currency === 'stars' ? 'stars' : 'tonconnect');
    const settings = await getPaymentSettings();
    const requestedItems = req.body?.items;
    if (!Array.isArray(requestedItems) || requestedItems.length < 1 || requestedItems.length > 30) throw new Error('السلة فارغة أو تحتوي عددًا غير مسموح من المنتجات');
    const merged = new Map();
    for (const item of requestedItems) {
      const productId = String(item?.productId || '').trim();
      const quantity = Number(item?.quantity);
      if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) throw new Error('بيانات أحد المنتجات في السلة غير صحيحة');
      merged.set(productId, (merged.get(productId) || 0) + quantity);
    }
    if ([...merged.values()].some(q => q > 20)) throw new Error('الحد الأعلى للكمية هو 20 للمنتج الواحد');

    const lines = [];
    let total = 0;
    for (const [productId, quantity] of merged.entries()) {
      const product = await db.collection('products').findOne({ id: productId });
      if (!product) throw new Error('أحد المنتجات لم يعد متاحًا');
      if (!productAllowsCurrency(product, currency)) throw new Error(`طريقة الدفع المختارة غير مقبولة للمنتج: ${product.name}`);
      const unitPrice = getDiscountedUnitPrice(product, currency);
      const lineTotal = orderRound(unitPrice * quantity, currency);
      total = orderRound(total + lineTotal, currency);
      lines.push({ productId: String(product.id), name: String(product.name || 'منتج').slice(0, 150), quantity, unitPrice, lineTotal });
    }
    if (currency === 'sar' && (!settings.manualEnabled || !settings.manualPaymentUsername)) throw new Error('الدفع اليدوي بالريال غير مهيأ حاليًا');
    if (['ton', 'usd'].includes(currency) && (!settings.tonConnectEnabled || (currency === 'ton' && !settings.cryptoTonEnabled) || (currency === 'usd' && !settings.cryptoUsdtEnabled))) throw new Error('وسيلة الدفع بهذه العملة غير مفعّلة حاليًا من لوحة التحكم.');
    if (currency === 'stars' && !settings.starsEnabled) throw new Error('الدفع عبر Telegram Stars غير مفعّل حاليًا من لوحة التحكم.');
    if (!(total > 0)) throw new Error('إجمالي الطلب غير صالح');
    if (currency === 'stars' && (!Number.isInteger(total) || total > 100000)) throw new Error('قيمة Stars غير صحيحة أو تتجاوز الحد المسموح');

    const now = new Date();
    const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
    const orderCode = `DY-${Date.now().toString(36).toUpperCase()}-${randomPart}`;
    const order = {
      id: crypto.randomUUID(), orderCode,
      userId: String(user.id), customerName: String(user.name || 'عميل').slice(0, 100),
      items: lines, currency, total, paymentMethod,
      paymentStatus: 'pending', paymentReference: '',
      status: 'awaiting_payment', statusLabel: ORDER_STATUS_LABELS.awaiting_payment,
      paymentInstructions: paymentMethod === 'manual' ? settings.manualInstructions : '',
      manualPaymentUsername: paymentMethod === 'manual' ? settings.manualPaymentUsername : '',
      paymentNotified: false, createdAt: now, updatedAt: now, salesCountedAt: null
    };
    await db.collection('orders').insertOne(order);

    let checkoutUrl = '';
    try {
      if (paymentMethod === 'tonconnect') {
        // TON Connect transaction is prepared only after the customer connects their wallet.
      } else if (paymentMethod === 'stars') {
        checkoutUrl = await createStarsInvoice(order);
        await db.collection('orders').updateOne({ id: order.id }, { $set: { providerPayUrl: checkoutUrl, providerCreatedAt: new Date() } });
      }
    } catch (providerError) {
      await db.collection('orders').deleteOne({ id: order.id });
      throw providerError;
    }

    await Promise.allSettled([
      addNotification(order.userId, 'تم إنشاء طلبك', `تم استلام طلبك ${order.orderCode}. ${paymentMethod === 'manual' ? 'أكمل التحويل اليدوي لتأكيده.' : 'أكمل الدفع لتأكيد الطلب.'}`, 'info', 'orders', { orderId: order.id }),
      notifyAdmins('طلب جديد', `وصل طلب جديد ${order.orderCode} بقيمة ${moneyForServer(total, currency)}.`, 'info')
    ]);
    res.json({
      ok: true,
      order: { id: order.id, orderCode, total, currency, status: order.status, paymentMethod, paymentInstructions: order.paymentInstructions, manualPaymentUsername: order.manualPaymentUsername },
      checkoutUrl
    });
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});

app.post('/api/ton/prepare', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    const orderId = String(req.body?.orderId || '');
    const walletAddress = String(req.body?.walletAddress || '');
    const order = await db.collection('orders').findOne({ id: orderId, userId: user.id, paymentMethod: 'tonconnect', status: 'awaiting_payment' });
    if (!order) throw new Error('الطلب غير موجود أو لم يعد بانتظار الدفع');
    if (!TONCENTER_API_KEY) throw new Error('أضف TONCENTER_API_KEY في إعدادات Render لتفعيل التحقق من معاملات TON');
    const receiverAddress = await getTonReceiverAddress();
    const sender = Address.parse(walletAddress);
    await db.collection('orders').updateOne({ id: order.id, userId: user.id }, { $set: { tonSenderAddress: sender.toRawString().toLowerCase(), tonPaymentPreparedAt: new Date(), updatedAt: new Date() } });
    const comment = createOrderComment(order.orderCode).toBoc().toString('base64');
    let message;
    if (order.currency === 'ton') {
      message = { address: receiverAddress.toString({ urlSafe: true, bounceable: true }), amount: decimalToUnits(order.total, 9), payload: comment };
    } else if (order.currency === 'usd') {
      const senderJettonWallet = await getJettonWalletAddress(sender.toString({ urlSafe: true, bounceable: true }));
      const forwardPayload = createOrderComment(order.orderCode);
      const jettonBody = beginCell()
        .storeUint(0xf8a7ea5, 32)
        .storeUint(BigInt(Date.now()), 64)
        .storeCoins(BigInt(decimalToUnits(order.total, 6)))
        .storeAddress(receiverAddress)
        .storeAddress(sender)
        .storeBit(0)
        .storeCoins(1n)
        .storeBit(1)
        .storeRef(forwardPayload)
        .endCell();
      message = { address: senderJettonWallet.toString({ urlSafe: true, bounceable: true }), amount: '50000000', payload: jettonBody.toBoc().toString('base64') };
    } else throw new Error('عملة الطلب غير مدعومة');
    res.json({ ok: true, transaction: { validUntil: Math.floor(Date.now() / 1000) + 300, network: TON_NETWORK, messages: [message] } });
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});

app.post('/api/ton/submit', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    const orderId = String(req.body?.orderId || '');
    const walletAddress = normalizeTonAddress(req.body?.walletAddress || '');
    const result = await db.collection('orders').updateOne(
      { id: orderId, userId: user.id, paymentMethod: 'tonconnect', status: 'awaiting_payment', tonSenderAddress: walletAddress },
      { $set: { tonWalletSubmittedAt: new Date(), updatedAt: new Date() } }
    );
    if (!result.matchedCount) throw new Error('تعذر ربط محاولة الدفع بالطلب');
    res.json({ ok: true, message: 'تم إرسال طلب التحويل للمحفظة. يجري انتظار تأكيد الشبكة.' });
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});

app.post('/api/ton/verify', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    const orderId = String(req.body?.orderId || '');
    const order = await db.collection('orders').findOne({ id: orderId, userId: user.id, paymentMethod: 'tonconnect' });
    if (!order) throw new Error('الطلب غير موجود');
    if (order.paymentStatus === 'paid') return res.json({ ok: true, paid: true, status: order.status });
    if (!order.tonWalletSubmittedAt || !order.tonSenderAddress) throw new Error('لم يتم إرسال معاملة من المحفظة لهذا الطلب');
    const result = await verifyTonConnectOrder(order);
    if (!result.paid) return res.json({ ok: true, paid: false, message: 'لم يظهر التحويل المؤكد على الشبكة بعد. أعد المحاولة بعد قليل.' });
    await markOrderPaid(order, 'ton_connect', result.reference);
    return res.json({ ok: true, paid: true, reference: result.reference, status: 'paid' });
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});

app.post('/api/orders/notify-manual-payment', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    const orderId = String(req.body?.orderId || '').trim();
    if (!orderId) throw new Error('رقم الطلب غير صالح');
    const result = await db.collection('orders').updateOne(
      { id: orderId, userId: user.id, paymentMethod: 'manual', status: 'awaiting_payment', paymentStatus: { $ne: 'paid' } },
      { $set: { paymentNotified: true, paymentStatus: 'submitted', paymentNotifiedAt: new Date(), updatedAt: new Date() } }
    );
    if (!result.matchedCount) throw new Error('الطلب غير موجود أو لا يقبل إشعار الدفع');
    const order = await db.collection('orders').findOne({ id: orderId });
    await Promise.allSettled([
      order ? notifyAdmins('إشعار دفع يدوي', `أرسل العميل إشعارًا بتحويل الطلب ${order.orderCode}. تحقق من وصول المبلغ.`, 'warning') : Promise.resolve(),
      addNotification(user.id, 'تم استلام إشعار الدفع', 'وصل إشعارك إلى المتجر، والطلب بانتظار تأكيد حساب الاستقبال.', 'info', 'orders', { orderId })
    ]);
    res.json({ ok: true, message: 'تم إشعار المتجر بانتظار تأكيد استلام المبلغ' });
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});

app.post('/api/orders/submit-reference', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    const orderId = String(req.body?.orderId || '').trim();
    const reference = String(req.body?.reference || '').trim().slice(0, 300);
    if (!orderId || reference.length < 3) throw new Error('أدخل رقم العملية أو مرجع التحويل بشكل صحيح');
    const result = await db.collection('orders').updateOne(
      { id: orderId, userId: user.id, status: 'awaiting_payment' },
      { $set: { paymentReference: reference, paymentReferenceAt: new Date(), updatedAt: new Date() } }
    );
    if (!result.matchedCount) throw new Error('الطلب غير موجود أو لم يعد بانتظار الدفع');
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
});

app.post('/api/orders/mine', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    const orders = await db.collection('orders').find({ userId: user.id }).sort({ createdAt: -1 }).limit(50).toArray();
    res.json({ ok: true, orders: orders.map(({ _id, ...order }) => order) });
  } catch (err) { res.status(401).json({ ok: false, error: err.message }); }
});

app.post('/api/orders/list', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!['owner', 'admin'].includes(user.role)) throw new Error('إدارة الطلبات متاحة للمالك والمسؤول فقط');
    const filter = {};
    const requestedStatus = String(req.body?.status || 'all');
    if (requestedStatus !== 'all') {
      if (!ORDER_STATUSES.includes(requestedStatus)) throw new Error('حالة الطلب غير صحيحة');
      filter.status = requestedStatus;
    }
    const orders = await db.collection('orders').find(filter).sort({ createdAt: -1 }).limit(200).toArray();
    res.json({ ok: true, orders: orders.map(({ _id, ...order }) => order) });
  } catch (err) { res.status(403).json({ ok: false, error: err.message }); }
});

app.post('/api/orders/update-status', async (req, res) => {
  try {
    const user = await getUserFromReq(req);
    if (!['owner', 'admin'].includes(user.role)) throw new Error('ليس لديك صلاحية لإدارة الطلبات');
    const orderId = String(req.body?.orderId || '');
    const status = String(req.body?.status || '');
    if (!orderId || !ORDER_STATUSES.includes(status)) throw new Error('بيانات تحديث الطلب غير صحيحة');
    const orders = db.collection('orders');
    const order = await orders.findOne({ id: orderId });
    if (!order) throw new Error('الطلب غير موجود');
    if (['paid', 'processing', 'completed'].includes(order.status) && status === 'cancelled') throw new Error('لا يمكن إلغاء طلب تم تأكيد دفعه من هذه الشاشة؛ يلزم إجراء استرداد منفصل');
    if (['processing', 'completed'].includes(status) && order.paymentStatus !== 'paid') throw new Error('يجب تأكيد الدفع أولًا قبل بدء التنفيذ أو إكمال الطلب');
    if (status === 'paid' && order.paymentMethod === 'manual' && !order.paymentNotified) throw new Error('لا يمكن تأكيد الدفع قبل أن يرسل العميل إشعار إتمام التحويل');
    if (status === 'paid' && ['stars', 'tonconnect'].includes(order.paymentMethod) && order.paymentStatus !== 'paid') throw new Error('هذا الطلب يستخدم دفعًا تلقائيًا؛ سيتم تأكيده بعد وصول إشعار الدفع الموثوق.');
    if (status === 'rejected' && order.paymentStatus === 'paid') throw new Error('لا يمكن رفض طلب تم تأكيد دفعه؛ استخدم إجراء استرداد منفصل');
    const update = { status, statusLabel: ORDER_STATUS_LABELS[status], updatedAt: new Date(), updatedBy: user.id };
    if (status === 'paid' && !order.salesCountedAt) {
      const countedAt = new Date();
      const claim = await orders.updateOne(
        { id: orderId, $or: [{ salesCountedAt: null }, { salesCountedAt: { $exists: false } }] },
        { $set: { ...update, salesCountedAt: countedAt, paymentStatus: 'paid' } }
      );
      if (claim.modifiedCount) {
        for (const line of order.items || []) {
          await db.collection('products').updateOne({ id: line.productId }, { $inc: { soldCount: Number(line.quantity) || 1 } });
        }
      } else {
        await orders.updateOne({ id: orderId }, { $set: { ...update, paymentStatus: 'paid' } });
      }
    } else {
      if (status === 'rejected') update.paymentStatus = 'rejected';
      await orders.updateOne({ id: orderId }, { $set: update });
    }
    const notificationText = {
      paid: 'تم تأكيد دفع طلبك، وسيتم تجهيزه قريبًا.',
      processing: 'بدأ فريق DAYO تنفيذ طلبك.',
      completed: 'اكتمل طلبك بنجاح. شكرًا لثقتك بـ DAYO.',
      cancelled: 'تم إلغاء طلبك.',
      rejected: 'تعذر قبول طلبك. يرجى التواصل مع الدعم.'
    }[status] || 'تم تحديث حالة طلبك.';
    await Promise.allSettled([addNotification(order.userId, ORDER_STATUS_LABELS[status], `${notificationText} رقم الطلب ${order.orderCode}.`, status === 'completed' || status === 'paid' ? 'success' : 'info', 'orders', { orderId })]);
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ ok: false, error: err.message }); }
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
