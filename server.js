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

// --- DATABASE ---
let db = null;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_DATABASE_URL) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DATABASE_URL
        });
        db = admin.database();
        console.log("✅ v1.9.6 SUPREME READY.");
    }
} catch (error) { console.error("❌ DB Error:", error.message); }

app.use(cors());
app.use(bodyParser.json());

// HEALTH CHECK
app.get('/', (req, res) => res.status(200).send("SUPREME v1.9.6 EMPIRE IS ONLINE"));

// --- UTILS ---
const normalizePhone = (p) => {
    if (!p) return "";
    const clean = p.toString().replace(/\D/g, '');
    return clean.length >= 9 ? clean.slice(-9) : clean;
};

// --- AUTH ENDPOINT (FIXED 400 ERRORS) ---
app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        const { phoneNumber, password, mode, deviceId, pkg } = req.body;
        console.log(`Login Attempt: ${phoneNumber}, Mode: ${mode}`);

        if (!phoneNumber) return res.status(400).json({ message: "Missing Phone Number" });
        if (!mode) return res.status(400).json({ message: "Missing Mode" });

        const normalized = normalizePhone(phoneNumber);
        const lockSnap = await db.ref('config/hardware_locks').once('value');
        const locks = lockSnap.val() || {};

        // 1. MASTER/SUPPORT/SENSOR Hardware Lock (Strict)
        if (phoneNumber === 'geesi' || phoneNumber === 'maamulka' || phoneNumber === 'maamulka_2' || phoneNumber === 'sensor_primary') {
             if (locks.pkg && locks.pkg !== pkg) return res.status(403).json({ message: "Unauthorized Source App" });
        }

        if (phoneNumber === 'geesi' && password === MASTER_PASS) {
            const token = jwt.sign({ phoneNumber: 'geesi', role: 'MASTER', deviceId }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token, role: 'MASTER' });
        }

        if (phoneNumber === 'maamulka' || phoneNumber === 'maamulka_2') {
            const reqPass = phoneNumber === 'maamulka' ? SUPPORT_PASS : SUPPORT_PASS_2;
            if (password === reqPass) {
                const token = jwt.sign({ phoneNumber, role: 'SUPPORT', deviceId }, SECRET_KEY, { expiresIn: '12h' });
                return res.json({ token, role: 'SUPPORT' });
            }
        }

        if (phoneNumber === 'sensor_primary' && password === LISTENER_PASS) {
            const token = jwt.sign({ phoneNumber: 'sensor_primary', role: 'LISTENER', deviceId }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token, role: 'LISTENER' });
        }

        // 2. REGULAR USER (Simple Auth)
        const userRef = db.ref('users/' + normalized);
        const snap = await userRef.once('value');
        const user = snap.val();

        if (mode === 'register') {
            if (user) return res.status(400).json({ message: "Account Already Exists" });
            const uid = "SK-" + Math.random().toString(36).substr(2, 6).toUpperCase();
            await userRef.set({ uid, phoneNumber: normalized, password, balance: 0.0, status: 'PENDING', createdAt: new Date().toISOString() });
            return res.json({ message: "PENDING", uid });
        } else {
            if (!user) return res.status(404).json({ message: "User Not Found" });
            if (user.password !== password) return res.status(401).json({ message: "Wrong Password" });
            const token = jwt.sign({ phoneNumber: normalized, uid: user.uid, role: 'USER' }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token, uid: user.uid, role: 'USER' });
        }
    } catch (e) {
        console.error("Auth Exception:", e.message);
        res.status(500).send("Auth Internal Error");
    }
});

// --- ADMIN DATA ROUTES (FIXED EMPTY TABS) ---
app.get('/api/admin/transactions', async (req, res) => {
    const snap = await db.ref('transactions').limitToLast(1000).once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/all-users', async (req, res) => {
    const snap = await db.ref('users').once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/global-forensics', async (req, res) => {
    const snap = await db.ref('global_forensics').limitToLast(1000).once('value');
    res.json(Object.values(snap.val() || {}).reverse());
});

app.get('/api/config', async (req, res) => {
    const snap = await db.ref('config').once('value');
    res.json(snap.val() || {});
});

// --- USER ROUTES ---
app.get('/api/balance', async (req, res) => {
    // Note: real app uses JWT token, simplified here for verification
    res.json({ balance: 0.0 });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 SUPREME Active.`));
