const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || 'SarifKeennaSecret786';

// --- ULTIMATE STEALTH SECURITY CONFIG ---
const MASTER_PASS = process.env.ADMIN_PASSWORD || 'Habo3290';
const SUPPORT_PASS = process.env.SUPPORT_ADMIN_PASS || 'Support@786';
const GATEWAY_SECRET = 'SK-GATEWAY-ULTIMATE-SECRET-786';
const INTERNAL_SALT = 'INTERNAL_SALT_99';
const SLSH_RATE = 11000;

// --- DATABASE CONNECTION ---
let db = null;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_DATABASE_URL) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DATABASE_URL
        });
        db = admin.database();
        console.log("✅ v1.7.5 MASTER STEALTH CLOUD ONLINE.");
    }
} catch (error) { console.error("❌ DB Error:", error.message); }

app.use(cors());
app.use(bodyParser.json());

// THE CRITICAL 9-DIGIT RULE (Strict normalization)
const normalizePhone = (phone) => {
    if (!phone) return "";
    const clean = phone.toString().replace(/\D/g, '');
    return clean.length >= 9 ? clean.slice(-9) : clean;
};

// --- AUTH MIDDLEWARE ---
const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const isMaster = (req, res, next) => {
    if (req.user && req.user.role === 'MASTER') next();
    else res.status(403).json({ message: "Master Access Denied" });
};

const isSupport = (req, res, next) => {
    if (req.user && (req.user.role === 'MASTER' || req.user.role === 'SUPPORT')) next();
    else res.status(403).json({ message: "Access Denied" });
};

// --- STEALTH ENDPOINTS ---

app.get('/', (req, res) => res.send("🚀 Gateway Active"));

// User Auth: /api/v1/user/auth-access
app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        const { phoneNumber, password, mode } = req.body;
        const normalized = normalizePhone(phoneNumber);

        if (phoneNumber === 'geesi' || phoneNumber === 'eesi') {
            if (password === MASTER_PASS) {
                const token = jwt.sign({ phoneNumber: 'geesi', uid: 'ADMIN', role: 'MASTER' }, SECRET_KEY, { expiresIn: '30d' });
                return res.json({ token, uid: 'ADMIN', role: 'MASTER' });
            } else return res.status(401).json({ message: "Fail" });
        }

        if (phoneNumber === 'maamulka') {
            if (password === SUPPORT_PASS) {
                const token = jwt.sign({ phoneNumber: 'maamulka', uid: 'SUPPORT', role: 'SUPPORT' }, SECRET_KEY, { expiresIn: '30d' });
                return res.json({ token, uid: 'SUPPORT', role: 'SUPPORT' });
            } else return res.status(401).json({ message: "Fail" });
        }

        const userRef = db.ref('users/' + normalized);
        const snap = await userRef.once('value');
        const user = snap.val();

        if (mode === 'register') {
            if (user) return res.status(400).json({ message: "Duplicate" });
            const uid = "SK-" + Math.random().toString(36).substr(2, 6).toUpperCase();
            await userRef.set({ uid, phoneNumber: normalized, password, balance: 0.0, status: 'PENDING', isReviewer: false, createdAt: new Date().toISOString() });
            return res.json({ message: "PENDING_ACTIVATION", uid });
        } else {
            if (!user) return res.status(404).json({ message: "None" });
            if (user.password !== password) return res.status(401).json({ message: "Fail" });
            const token = jwt.sign({ phoneNumber: normalized, uid: user.uid, role: 'USER', isReviewer: user.isReviewer || false }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token, uid: user.uid, role: 'USER', isReviewer: user.isReviewer || false });
        }
    } catch (e) { res.status(500).json({ message: "Error" }); }
});

// User Actions: /api/v1/user/action-post
app.post('/api/v1/user/action-post', authenticate, async (req, res) => {
    const { type, amount, details } = req.body;
    const phone = req.user.phoneNumber;
    try {
        const newTxRef = db.ref('transactions').push();
        await newTxRef.set({
            userId: phone, uid: req.user.uid, type, amount: parseFloat(amount),
            details: details || {}, status: 'PENDING', date: new Date().toISOString()
        });
        res.json({ message: 'Submitted', id: newTxRef.key });
    } catch (e) { res.status(500).send("Error"); }
});

// STEALTH GATEWAY: /api/v1/gateway/pulse
app.post('/api/v1/gateway/pulse', async (req, res) => {
    const { p_v1, p_v2, p_gst, p_sid, refId, timestamp, deviceId, currency } = req.body;
    try {
        const dataToSign = `${p_v1}|${p_v2}|${refId}|${timestamp}|${deviceId}|${currency}`;
        const expectedSid = crypto.createHmac('sha256', GATEWAY_SECRET).update(dataToSign).digest('hex');
        if (p_sid !== expectedSid) return res.status(403).json({ message: "Denied" });

        const expectedGst = crypto.createHmac('sha256', INTERNAL_SALT).update(p_sid).digest('hex');
        if (p_gst !== expectedGst) return res.status(403).json({ message: "Ghost Denied" });

        const phone = normalizePhone(p_v2);
        const amount = parseFloat(p_v1);

        const dup = await db.ref('used_external_ids/' + refId).once('value');
        if (dup.exists()) return res.json({ message: "Duplicate" });

        let finalUsd = amount;
        if (currency === "SLSH") finalUsd = Math.floor((amount / SLSH_RATE) * 100) / 100;

        const txSnap = await db.ref('transactions').orderByChild('userId').equalTo(phone).once('value');
        const transactions = txSnap.val() || {};
        let matchedId = null;
        Object.keys(transactions).forEach(id => {
            const tx = transactions[id];
            if (tx.status === 'PENDING' && tx.type.toLowerCase().includes('zaad') && Math.abs(tx.amount - finalUsd) < 0.10) matchedId = id;
        });

        if (!matchedId) {
            await db.ref('unclaimed_deposits/' + refId).set({ amount: finalUsd, phone, date: new Date().toISOString() });
            return res.json({ message: "Logged" });
        }

        const userRef = db.ref('users/' + phone);
        const userSnap = await userRef.once('value');
        const currentBal = userSnap.val().balance || 0;
        const newBal = currentBal + finalUsd;
        await userRef.update({ balance: newBal });
        await db.ref('transactions/' + matchedId).update({
            status: 'APPROVED', approvedBy: `🤖 System`, beforeBalance: currentBal, afterBalance: newBal, externalId: refId
        });
        await db.ref('used_external_ids/' + refId).set({ txId: matchedId, date: new Date().toISOString() });
        res.json({ message: "OK" });
    } catch (e) { res.status(500).send("Err"); }
});

// Staff Ops: /api/v1/queue/update-state
app.post('/api/v1/queue/update-state', authenticate, isSupport, async (req, res) => {
    const { transactionId, status, finalAmount, externalId } = req.body;
    try {
        const txRef = db.ref('transactions/' + transactionId);
        const txSnap = await txRef.once('value');
        const txData = txSnap.val();
        if (status === 'APPROVED' && txData.status.includes('PENDING')) {
            const userRef = db.ref('users/' + txData.userId);
            const userSnap = await userRef.once('value');
            const current = userSnap.val().balance || 0;
            const amt = parseFloat(finalAmount || txData.amount);
            const isIntake = (txData.type.toLowerCase().includes("dir") || txData.type.toLowerCase().includes("saar"));
            const newBal = isIntake ? current + amt : current - amt;
            await userRef.update({ balance: newBal });
            await txRef.update({ status, amount: amt, approvedBy: req.user.phoneNumber, beforeBalance: current, afterBalance: newBal, externalId: externalId || txData.externalId });
        } else await txRef.update({ status });
        res.json({ message: "OK" });
    } catch (e) { res.status(500).send("Err"); }
});

// Master Delta: /api/v1/ops/profile-delta
app.post('/api/v1/ops/profile-delta', authenticate, isMaster, async (req, res) => {
    const phone = normalizePhone(req.body.targetPhone);
    await db.ref('users/' + phone).update({ balance: parseFloat(req.body.newBalance) });
    res.json({ message: "OK" });
});

// Master Params: /api/v1/sys/global-params
app.post('/api/v1/sys/global-params', authenticate, isMaster, async (req, res) => {
    await db.ref('config').update(req.body);
    res.json({ message: "OK" });
});

// Master Reset: /api/v1/sys/control
app.post('/api/v1/sys/control', authenticate, isMaster, async (req, res) => {
    if (req.body.cmd === "SYS_RES") {
        await db.ref('fraud_alerts').remove();
        res.json({ message: "SYSTEM_UNFROZEN" });
    }
});

// Data Fetchers
app.get('/api/balance', authenticate, async (req, res) => {
    const snap = await db.ref('users/' + req.user.phoneNumber + '/balance').once('value');
    res.json({ balance: snap.val() || 0.0 });
});

app.get('/api/transactions', authenticate, async (req, res) => {
    const snap = await db.ref('transactions').orderByChild('userId').equalTo(req.user.phoneNumber).limitToLast(30).once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/pending-users', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('users').orderByChild('status').equalTo('PENDING').once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/all-users', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('users').once('value');
    res.json(snap.val() || {});
});

app.post('/api/admin/user/activate', authenticate, isSupport, async (req, res) => {
    await db.ref('users/' + normalizePhone(req.body.targetPhone)).update({ status: 'ACTIVE' });
    res.json({ message: 'OK' });
});

app.get('/api/admin/transactions', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('transactions').limitToLast(400).once('value');
    res.json(snap.val() || {});
});

app.get('/api/config', async (req, res) => {
    const snap = await db.ref('config').once('value');
    res.json(snap.val() || { whatsapp: "+252...", minVersion: "1.5" });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 v1.7.5 MASTER STEALTH Active.`));
