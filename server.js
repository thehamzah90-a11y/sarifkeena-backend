const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || 'SarifKeennaSecret786';

// --- DATABASE CONNECTION (FIREBASE REALTIME DB) ---
let db = null;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_DATABASE_URL) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DATABASE_URL
        });
        db = admin.database();
        console.log("✅ Realtime Database Connected: Sarifkeenna is ready!");
    } else {
        console.log("⚠️ Database not connected. Missing FIREBASE_SERVICE_ACCOUNT or FIREBASE_DATABASE_URL.");
    }
} catch (error) {
    console.error("❌ Database Connection Error:", error.message);
}

app.use(cors());
app.use(bodyParser.json());

// --- API ENDPOINTS ---

app.get('/', (req, res) => {
    res.send("<h1>Sarifkeenna Realtime Backend is LIVE! 🚀</h1>");
});

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
    if (req.user && req.user.phoneNumber === 'admin') next();
    else res.status(403).json({ message: "Admin access denied" });
};

// Login
app.post('/api/login', async (req, res) => {
    const { phoneNumber, otp } = req.body;
    const isUser = phoneNumber && otp === '1234';
    const isRootAdmin = phoneNumber === 'admin' && otp === 'admin';

    if (isUser || isRootAdmin) {
        try {
            if (db) {
                const userRef = db.ref('users/' + phoneNumber);
                const snapshot = await userRef.once('value');
                if (!snapshot.exists()) {
                    await userRef.set({ balance: 0.0, phoneNumber: phoneNumber, createdAt: new Date().toISOString() });
                }
            }
            const token = jwt.sign({ phoneNumber }, SECRET_KEY, { expiresIn: '24h' });
            res.json({ token });
        } catch (e) {
            res.status(500).json({ message: 'Login error', error: e.message });
        }
    } else {
        res.status(400).json({ message: 'Invalid phone or OTP' });
    }
});

// Balance
app.get('/api/balance', authenticateToken, async (req, res) => {
    try {
        if (!db) return res.json({ balance: 0.0 });
        const snapshot = await db.ref('users/' + req.user.phoneNumber + '/balance').once('value');
        res.json({ balance: snapshot.val() || 0.0 });
    } catch (e) { res.status(500).send("Error"); }
});

// User Transactions
app.get('/api/transactions', authenticateToken, async (req, res) => {
    try {
        if (!db) return res.json([]);
        const snapshot = await db.ref('transactions').orderByChild('userId').equalTo(req.user.phoneNumber).once('value');
        const data = snapshot.val() || {};
        const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        res.json(list.sort((a, b) => new Date(b.date) - new Date(a.date)));
    } catch (e) { res.json([]); }
});

// Request Transaction
app.post('/api/transaction/request', authenticateToken, async (req, res) => {
    const { type, amount, details } = req.body;
    try {
        if (!db) return res.status(500).json({ message: "DB not ready" });
        const newTxRef = db.ref('transactions').push();
        await newTxRef.set({
            userId: req.user.phoneNumber,
            type, amount: parseFloat(amount), details: details || {},
            date: new Date().toISOString(), status: 'PENDING'
        });
        res.json({ message: 'Submitted', id: newTxRef.key });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// Admin: Get All
app.get('/api/admin/transactions', authenticateToken, isAdmin, async (req, res) => {
    try {
        if (!db) return res.json([]);
        const snapshot = await db.ref('transactions').once('value');
        const data = snapshot.val() || {};
        const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        res.json(list.sort((a, b) => new Date(b.date) - new Date(a.date)));
    } catch (e) { res.json([]); }
});

// Admin: Approve/Reject
app.post('/api/admin/transaction/status', authenticateToken, isAdmin, async (req, res) => {
    const { transactionId, status } = req.body;
    try {
        if (!db) return res.status(500).send("DB offline");
        const txRef = db.ref('transactions/' + transactionId);
        const txSnapshot = await txRef.once('value');
        const txData = txSnapshot.val();

        if (status === 'APPROVED' && txData.status === 'PENDING') {
            const userRef = db.ref('users/' + txData.userId + '/balance');
            const userSnapshot = await userRef.once('value');
            const currentBalance = userSnapshot.val() || 0;

            let newBalance;
            if (txData.type === "Kasoo Dir Zaad" || txData.type === "Kala Soo Bax 1xBet") {
                newBalance = currentBalance + txData.amount;
            } else {
                newBalance = currentBalance - txData.amount;
            }
            await userRef.set(newBalance);
        }
        await txRef.update({ status: status });
        res.json({ message: status });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// App Config
app.get('/api/config', async (req, res) => {
    try {
        if (!db) return res.json({ whatsapp: "+252...", instructions: "Instructions here." });
        const snapshot = await db.ref('config').once('value');
        res.json(snapshot.val() || { whatsapp: "+252...", instructions: "Instructions here." });
    } catch (e) { res.json({ whatsapp: "+252...", instructions: "Error" }); }
});

app.post('/api/admin/config', authenticateToken, isAdmin, async (req, res) => {
    try {
        if (!db) return res.status(500).send("DB offline");
        await db.ref('config').update(req.body);
        res.json({ message: 'Updated' });
    } catch (e) { res.status(500).send("Error"); }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Sarifkeenna Backend live on port ${PORT}`);
});
