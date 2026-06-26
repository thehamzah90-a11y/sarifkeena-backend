const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || 'SarifKeennaSecret786';

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
        console.log("✅ Realtime Database Connected.");
    }
} catch (error) {
    console.error("❌ DB Error:", error.message);
}

app.use(cors());
app.use(bodyParser.json());

// --- AUTH ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.phoneNumber === 'geesi') next();
    else res.status(403).json({ message: "Admin access denied" });
};

// Rate limiting (30s)
const requestLogs = new Map();

// --- API ENDPOINTS ---

app.post('/api/login', async (req, res) => {
    const { phoneNumber, otp, password, mode } = req.body;

    if (phoneNumber === 'geesi' && (otp === 'Habo3290' || password === 'Habo3290')) {
        const token = jwt.sign({ phoneNumber, uid: 'ADMIN' }, SECRET_KEY, { expiresIn: '30d' });
        return res.json({ token });
    }

    try {
        if (!db) return res.status(500).json({ message: "DB Offline" });
        const userRef = db.ref('users/' + phoneNumber);
        const snapshot = await userRef.once('value');
        let user = snapshot.val();

        if (mode === 'otp') {
            if (otp !== '1234') return res.status(400).json({ message: "Invalid OTP" });
            if (!user) {
                const uid = "SK-" + Date.now().toString(36).toUpperCase();
                const hashedPassword = password ? await bcrypt.hash(password, 10) : null;
                user = { uid, phoneNumber, balance: 0.0, password: hashedPassword, createdAt: new Date().toISOString() };
                await userRef.set(user);
            }
            const token = jwt.sign({ phoneNumber, uid: user.uid }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token });
        } else {
            if (!user || !user.password) return res.status(400).json({ message: "Account has no password. Use OTP." });
            const valid = await bcrypt.compare(password, user.password);
            if (!valid) return res.status(400).json({ message: "Incorrect password" });
            const token = jwt.sign({ phoneNumber, uid: user.uid }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token });
        }
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/balance', authenticateToken, async (req, res) => {
    const snapshot = await db.ref('users/' + req.user.phoneNumber + '/balance').once('value');
    res.json({ balance: snapshot.val() || 0.0 });
});

app.get('/api/transactions', authenticateToken, async (req, res) => {
    const snapshot = await db.ref('transactions').orderByChild('userId').equalTo(req.user.phoneNumber).once('value');
    const data = snapshot.val() || {};
    const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
    res.json(list.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.post('/api/transaction/request', authenticateToken, async (req, res) => {
    const { type, amount, details } = req.body;
    const now = Date.now();
    const logKey = `${req.user.phoneNumber}-${type}-${amount}`;
    if (requestLogs.has(logKey) && now - requestLogs.get(logKey) < 30000) {
        return res.status(429).json({ message: "Waad ku celcelisey degdeg , sug 30 seconds saaxiib" });
    }
    requestLogs.set(logKey, now);
    try {
        const newTxRef = db.ref('transactions').push();
        await newTxRef.set({
            userId: req.user.phoneNumber,
            uid: req.user.uid,
            type, amount: parseFloat(amount), details,
            date: new Date().toISOString(), status: 'PENDING'
        });
        res.json({ message: 'Submitted', id: newTxRef.key });
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/api/admin/transactions', authenticateToken, isAdmin, async (req, res) => {
    const snap = await db.ref('transactions').once('value');
    const data = snap.val() || {};
    res.json(Object.keys(data).map(k => ({id: k, ...data[k]})).sort((a,b) => new Date(b.date)-new Date(a.date)));
});

app.post('/api/admin/user/recharge', authenticateToken, isAdmin, async (req, res) => {
    const { targetPhone, newBalance, reason } = req.body;
    await db.ref('users/' + targetPhone).update({ balance: parseFloat(newBalance) });
    await db.ref('transactions').push().set({
        userId: targetPhone, type: "Admin Correction", amount: parseFloat(newBalance),
        details: { reason, admin: req.user.phoneNumber }, date: new Date().toISOString(), status: 'APPROVED'
    });
    res.json({ message: 'Success' });
});

app.post('/api/admin/transaction/status', authenticateToken, isAdmin, async (req, res) => {
    const { transactionId, status } = req.body;
    const txRef = db.ref('transactions/' + transactionId);
    const txSnap = await txRef.once('value');
    const txData = txSnap.val();
    if (status === 'APPROVED' && txData.status === 'PENDING') {
        const userRef = db.ref('users/' + txData.userId + '/balance');
        const userSnap = await userRef.once('value');
        const current = userSnap.val() || 0;
        const change = (txData.type.includes("Dir") || txData.type.includes("Bax")) ? txData.amount : -txData.amount;
        await userRef.set(current + (txData.type.includes("Dir") || txData.type.includes("Bax") ? txData.amount : -txData.amount));
    }
    await txRef.update({ status });
    res.json({ message: status });
});

app.get('/api/config', async (req, res) => {
    const snap = await db.ref('config').once('value');
    res.json(snap.val() || { whatsapp: "+252...", instructions: "Follow steps", backgroundUrl: "" });
});

app.post('/api/admin/config', authenticateToken, isAdmin, async (req, res) => {
    await db.ref('config').update(req.body);
    res.json({ message: 'Updated' });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server running on ${PORT}`));
