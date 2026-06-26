const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');

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

// Helper: Extract last 9 digits (e.g., 633044004)
const getLocalNumber = (phone) => {
    const clean = phone.replace(/\s/g, '');
    return clean.length >= 9 ? clean.slice(-9) : clean;
};

// --- AUTH MIDDLEWARE ---
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
    if (req.user && req.user.uid === 'ADMIN') next();
    else res.status(403).json({ message: "Admin access denied" });
};

// --- API ENDPOINTS ---

app.get('/', (req, res) => res.send("🚀 Sarifkeenna Backend Ultimate is Live!"));

app.post('/api/login', async (req, res) => {
    const { phoneNumber, password, mode } = req.body;

    // SECURE ADMIN LOGIN
    const secureAdminPassword = process.env.ADMIN_PASSWORD || 'Habo3290';
    if ((phoneNumber === 'geesi' || localPhone === '6eesi') && password === secureAdminPassword) {
        const token = jwt.sign({ phoneNumber: 'geesi', uid: 'ADMIN' }, SECRET_KEY, { expiresIn: '30d' });
        return res.json({ token, uid: 'ADMIN' });
    }

    if (localPhone.length !== 9) {
        return res.status(400).json({ message: "Fadlan dhameystir nambarka (9 digits required)." });
    }

    try {
        const userRef = db.ref('users/' + localPhone);
        const snapshot = await userRef.once('value');
        const user = snapshot.val();

        if (mode === 'register') {
            if (user) return res.status(400).json({ message: "Lambarkan hore ayaa loo diwaangeliyey." });
            const uid = "SK-" + Math.random().toString(36).substr(2, 6).toUpperCase();
            const newUser = {
                uid,
                phoneNumber: localPhone,
                password: password,
                balance: 0.0,
                status: 'PENDING',
                createdAt: new Date().toISOString()
            };
            await userRef.set(newUser);
            return res.json({ message: "PENDING_ACTIVATION", uid });
        } else {
            if (!user) return res.status(404).json({ message: "Account ma jiro. Fadlan is diwaangeli." });
            if (user.status === 'PENDING') return res.status(403).json({ message: "PENDING_ACTIVATION", uid: user.uid });
            if (user.password !== password) return res.status(401).json({ message: "Password-ka waa khalad." });

            const token = jwt.sign({ phoneNumber: localPhone, uid: user.uid }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token, uid: user.uid });
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
    const localPhone = req.user.phoneNumber;

    try {
        if (type === "Kala Soo Bax 1xBet") {
            const { code } = details;
            const codeSnapshot = await db.ref('used_codes/' + code).once('value');
            if (codeSnapshot.exists()) {
                return res.status(400).json({ message: "Koodhkan mar hore ayaa la isticmaalay." });
            }
            await db.ref('used_codes/' + code).set({ date: new Date().toISOString(), userId: localPhone });
        }

        const newTxRef = db.ref('transactions').push();
        await newTxRef.set({
            userId: localPhone, uid: req.user.uid,
            type, amount: parseFloat(amount), details: details || {},
            date: new Date().toISOString(), status: 'PENDING'
        });
        res.json({ message: 'Submitted', id: newTxRef.key });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// --- ADMIN FEATURES ---

app.get('/api/admin/pending-users', authenticateToken, isAdmin, async (req, res) => {
    const snap = await db.ref('users').orderByChild('status').equalTo('PENDING').once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/all-users', authenticateToken, isAdmin, async (req, res) => {
    const snap = await db.ref('users').once('value');
    res.json(snap.val() || {});
});

app.post('/api/admin/user/activate', authenticateToken, isAdmin, async (req, res) => {
    const { targetPhone } = req.body;
    await db.ref('users/' + targetPhone).update({ status: 'ACTIVE' });
    res.json({ message: 'Activated' });
});

app.post('/api/admin/user/delete', authenticateToken, isAdmin, async (req, res) => {
    const { targetPhone } = req.body;
    await db.ref('users/' + targetPhone).remove();
    res.json({ message: 'User deleted' });
});

app.post('/api/admin/user/recharge', authenticateToken, isAdmin, async (req, res) => {
    const { targetPhone, newBalance } = req.body;
    await db.ref('users/' + targetPhone).update({ balance: parseFloat(newBalance) });
    res.json({ message: 'Success' });
});

app.get('/api/admin/transactions', authenticateToken, isAdmin, async (req, res) => {
    const snap = await db.ref('transactions').once('value');
    const data = snap.val() || {};
    res.json(Object.keys(data).map(k => ({id: k, ...data[k]})).sort((a,b) => new Date(b.date)-new Date(a.date)));
});

app.post('/api/admin/transaction/status', authenticateToken, isAdmin, async (req, res) => {
    const { transactionId, status, finalAmount } = req.body;
    const txRef = db.ref('transactions/' + transactionId);
    const txSnap = await txRef.once('value');
    const txData = txSnap.val();

    if (!txData) return res.status(404).json({ message: "Transaction not found" });

    if (status === 'APPROVED' && txData.status === 'PENDING') {
        const userRef = db.ref('users/' + txData.userId + '/balance');
        const userSnapshot = await userRef.once('value');
        const current = userSnapshot.val() || 0;
        let amt = (finalAmount !== undefined) ? finalAmount : txData.amount;
        let newBalance = (txData.type.includes("Dir") || txData.type.includes("Bax")) ? current + amt : current - amt;
        await userRef.set(newBalance);
        if(finalAmount !== undefined) await txRef.update({ amount: finalAmount });
    }
    await txRef.update({ status });
    res.json({ message: status });
});

app.get('/api/admin/analytics', authenticateToken, isAdmin, async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const txSnap = await db.ref('transactions').once('value');
    const usersSnap = await db.ref('users').once('value');
    const txs = txSnap.val() || {};
    const users = usersSnap.val() || {};
    let dep = 0, withdr = 0, news = 0;
    Object.values(txs).forEach(t => {
        if(t.date.startsWith(today) && t.status === 'APPROVED') {
            if(t.type.includes("Dir") || t.type.includes("Bax")) dep += t.amount;
            else withdr += t.amount;
        }
    });
    Object.values(users).forEach(u => { if(u.createdAt && u.createdAt.startsWith(today)) news++; });
    res.json({ totalDeposits: dep, totalWithdrawals: withdr, newUsersToday: news });
});

app.get('/api/config', async (req, res) => {
    const snap = await db.ref('config').once('value');
    res.json(snap.val() || { whatsapp: "+252...", instructions: "Follow steps" });
});

app.post('/api/admin/config', authenticateToken, isAdmin, async (req, res) => {
    await db.ref('config').update(req.body);
    res.json({ message: 'Updated' });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Sarifkeenna Backend live on port ${PORT}`));
