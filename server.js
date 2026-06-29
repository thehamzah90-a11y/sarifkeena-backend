const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || 'SarifKeennaSecret786';

// --- SECURITY CONFIG ---
const MASTER_PASS = process.env.ADMIN_PASSWORD || 'Habo3290';
const SUPPORT_PASS = process.env.SUPPORT_ADMIN_PASS || 'Support@786';
const SUPPORT_PASS_2 = process.env.SUPPORT_ADMIN_PASS_2 || 'Support@VIP';
const LISTENER_PASS = process.env.LISTENER_PASS || 'Sensor@786';

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
        console.log("✅ v1.9.6 SUPREME BRAIN ONLINE.");
    } else {
        console.log("⚠️ DB Credentials Missing.");
    }
} catch (error) { console.error("❌ DB Error:", error.message); }

app.use(cors());
app.use(bodyParser.json());

// HEALTH CHECK (For Render)
app.get('/', (req, res) => res.send("SUPREME v1.9.6 EMPIRE IS ONLINE"));

// --- UTILS ---
const normalizePhone = (p) => {
    if (!p) return "";
    const clean = p.toString().replace(/\D/g, '');
    return clean.length >= 9 ? clean.slice(-9) : clean;
};

const logBalanceChange = async (phoneNumber, amount, type, oldBal, newBal, reason, actor, details = {}) => {
    try {
        const event = { ts: new Date().toISOString(), amount, type, oldBal, newBal, reason, actor, details };
        await db.ref(`ledger/balance_logs/${phoneNumber}`).push().set(event);
        await db.ref('global_forensics').push().set({ ...event, phoneNumber, action: `BAL_${type}` });
    } catch (e) {}
};

const logForensic = async (req, action, target, details = {}) => {
    try {
        const entry = {
            ts: new Date().toISOString(),
            actor: req.user ? req.user.phoneNumber : "SYSTEM",
            role: req.user ? req.user.role : "N/A",
            action, target,
            dna: req.user ? req.user.deviceId : "UNK",
            asig: (req.body && req.body.p_asig) || "SYSTEM_STAMPED",
            details
        };
        await db.ref('activity_logs').push().set(entry);
        await db.ref('global_forensics').push().set(entry);
    } catch (e) {}
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
    else res.status(403).json({ message: "Master Denied" });
};

const isSupport = (req, res, next) => {
    if (req.user && (req.user.role === 'MASTER' || req.user.role === 'SUPPORT')) next();
    else res.status(403).json({ message: "Access Denied" });
};

// --- ROUTES ---
app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        const { phoneNumber, password, mode, deviceId, pkg } = req.body;
        const normalized = normalizePhone(phoneNumber);
        if (!db) return res.status(503).send("DB Offline");

        const lockSnap = await db.ref('config/hardware_locks').once('value');
        const locks = lockSnap.val() || {};

        // MASTER/SUPPORT/SENSOR Hardware Lock
        if (phoneNumber === 'geesi' || phoneNumber === 'maamulka' || phoneNumber === 'maamulka_2' || phoneNumber === 'sensor_primary') {
             if (locks.pkg && locks.pkg !== pkg) return res.status(403).json({ message: "Blocked Source" });
        }

        if (phoneNumber === 'geesi') {
            if (password === MASTER_PASS) {
                const token = jwt.sign({ phoneNumber: 'geesi', role: 'MASTER', deviceId }, SECRET_KEY, { expiresIn: '30d' });
                return res.json({ token, role: 'MASTER' });
            }
        }

        if (phoneNumber === 'maamulka' || phoneNumber === 'maamulka_2') {
            const requiredPass = (phoneNumber === 'maamulka') ? SUPPORT_PASS : SUPPORT_PASS_2;
            if (password === requiredPass) {
                const token = jwt.sign({ phoneNumber, role: 'SUPPORT', deviceId }, SECRET_KEY, { expiresIn: '12h' });
                return res.json({ token, role: 'SUPPORT' });
            }
        }

        if (phoneNumber === 'sensor_primary') {
            if (password === LISTENER_PASS) {
                const token = jwt.sign({ phoneNumber: 'sensor_primary', role: 'LISTENER', deviceId }, SECRET_KEY, { expiresIn: '30d' });
                return res.json({ token, role: 'LISTENER' });
            }
        }

        // USER
        const userRef = db.ref('users/' + normalized);
        const snap = await userRef.once('value');
        const user = snap.val();

        if (mode === 'register') {
            if (user) return res.status(400).json({ message: "Exists" });
            const uid = "SK-" + Math.random().toString(36).substr(2, 6).toUpperCase();
            await userRef.set({ uid, phoneNumber: normalized, password, balance: 0.0, status: 'PENDING', createdAt: new Date().toISOString() });
            return res.json({ message: "PENDING", uid });
        } else {
            if (!user) return res.status(404).json({ message: "None" });
            if (user.password !== password) return res.status(401).json({ message: "Fail" });
            const token = jwt.sign({ phoneNumber: normalized, uid: user.uid, role: 'USER' }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token, uid: user.uid, role: 'USER' });
        }
    } catch (e) { res.status(500).send("Err"); }
});

app.get('/api/admin/all-users', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('users').once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/transactions', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('transactions').limitToLast(1000).once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/global-forensics', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('global_forensics').limitToLast(2000).once('value');
    res.json(Object.values(snap.val() || {}).reverse());
});

app.get('/api/balance', authenticate, async (req, res) => {
    const snap = await db.ref('users/' + req.user.phoneNumber + '/balance').once('value');
    res.json({ balance: parseFloat(snap.val() || 0) });
});

app.get('/api/transactions', authenticate, async (req, res) => {
    const snap = await db.ref('transactions').orderByChild('userId').equalTo(req.user.phoneNumber).limitToLast(30).once('value');
    res.json(Object.values(snap.val() || {}).reverse());
});

app.get('/api/config', async (req, res) => {
    const snap = await db.ref('config').once('value');
    res.json(snap.val() || {});
});

app.post('/api/v1/user/action-post', authenticate, async (req, res) => {
    const ref = db.ref('transactions').push();
    await ref.set({ userId: req.user.phoneNumber, type: req.body.type, amount: parseFloat(req.body.amount), status: 'PENDING', date: new Date().toISOString() });
    res.json({ message: "SUCCESS" });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 SUPREME Active.`));
