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
        console.log("✅ Realtime Database Connected Successfully.");
    }
} catch (error) {
    console.error("❌ DB Initialization Error:", error.message);
}

app.use(cors());
app.use(bodyParser.json());

// Helper: Extract last 9 digits starting with 6
const getLocalNumber = (phone) => {
    if (!phone) return "";
    const clean = phone.toString().replace(/\D/g, '');
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

const isAnyAdmin = (req, res, next) => {
    if (req.user && (req.user.role === 'MASTER' || req.user.role === 'SUPPORT')) next();
    else res.status(403).json({ message: "Admin access denied" });
};

const isMasterAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'MASTER') next();
    else res.status(403).json({ message: "Master Admin access only" });
};

// --- API ENDPOINTS ---

app.get('/', (req, res) => res.send("🚀 Sarifkeenna PRO Backend v1.4 is Live!"));

// Multi-Role Login Logic
app.post('/api/login', async (req, res) => {
    try {
        const { phoneNumber, password, mode } = req.body;
        const rawPhone = phoneNumber ? phoneNumber.toString().toLowerCase() : "";

        // 1. MASTER ADMIN (Geesi Backdoor)
        const masterPass = process.env.ADMIN_PASSWORD || 'Habo3290';
        if (rawPhone === 'geesi' || rawPhone === 'eesi' || rawPhone.endsWith('6eesi')) {
            if (password === masterPass) {
                const token = jwt.sign({ phoneNumber: 'geesi', uid: 'ADMIN', role: 'MASTER' }, SECRET_KEY, { expiresIn: '30d' });
                return res.json({ token, uid: 'ADMIN', role: 'MASTER' });
            } else return res.status(401).json({ message: "Incorrect password." });
        }

        // 2. SUPPORT ADMIN (Employee)
        const supportUser = process.env.SUPPORT_ADMIN_USER || 'support1';
        const supportPass = process.env.SUPPORT_ADMIN_PASS || 'Support@786';
        if (rawPhone === supportUser) {
            if (password === supportPass) {
                const token = jwt.sign({ phoneNumber: supportUser, uid: 'SUPPORT', role: 'SUPPORT' }, SECRET_KEY, { expiresIn: '30d' });
                return res.json({ token, uid: 'SUPPORT', role: 'SUPPORT' });
            } else return res.status(401).json({ message: "Incorrect password." });
        }

        // 3. NORMAL USER LOGIC
        const localPhone = getLocalNumber(phoneNumber);
        if (localPhone.length < 9) return res.status(400).json({ message: "Please complete the number." });

        if (!db) return res.status(500).json({ message: "Database not connected." });
        const userRef = db.ref('users/' + localPhone);
        const snapshot = await userRef.once('value');
        const user = snapshot.val();

        if (mode === 'register') {
            if (user) return res.status(400).json({ message: "This number is already registered." });
            const uid = "SK-" + Math.random().toString(36).substr(2, 6).toUpperCase();
            await userRef.set({ uid, phoneNumber: localPhone, password, balance: 0.0, status: 'PENDING', createdAt: new Date().toISOString() });
            return res.json({ message: "PENDING_ACTIVATION", uid });
        } else {
            if (!user) return res.status(404).json({ message: "Account not found. Please register." });
            if (user.status === 'PENDING') return res.status(403).json({ message: "PENDING_ACTIVATION", uid: user.uid });
            if (user.password !== password) return res.status(401).json({ message: "Incorrect password." });
            const token = jwt.sign({ phoneNumber: localPhone, uid: user.uid, role: 'USER' }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token, uid: user.uid, role: 'USER' });
        }
    } catch (e) { res.status(500).json({ message: "Login logic error." }); }
});

// Admin: Process Approvals with Audit & Anti-Duplicate
app.post('/api/admin/transaction/status', authenticateToken, isAnyAdmin, async (req, res) => {
    const { transactionId, status, finalAmount, externalId } = req.body;
    try {
        const txRef = db.ref('transactions/' + transactionId);
        const txSnap = await txRef.once('value');
        const txData = txSnap.val();
        if (!txData) return res.status(404).json({ message: "Not found." });

        // 1. Anti-Duplicate Check
        if (externalId) {
            const dupSnap = await db.ref('used_external_ids/' + externalId).once('value');
            if (dupSnap.exists()) return res.status(400).json({ message: "ID/Code already used." });
        }

        if (status === 'APPROVED' && txData.status === 'PENDING') {
            const userRef = db.ref('users/' + txData.userId);
            const userSnap = await userRef.once('value');
            const userData = userSnap.val();
            const currentBalance = userData.balance || 0;
            const amt = parseFloat(finalAmount || txData.amount);

            const isIntake = txData.type.toLowerCase().includes("dir") || txData.type.toLowerCase().includes("saar");
            const newBalance = isIntake ? currentBalance + amt : currentBalance - amt;

            await userRef.update({ balance: newBalance });
            await txRef.update({
                status,
                amount: amt,
                approvedBy: req.user.phoneNumber,
                beforeBalance: currentBalance,
                afterBalance: newBalance,
                externalId: externalId || txData.details.code || txData.details.slsh
            });
            if (externalId) await db.ref('used_external_ids/' + externalId).set({ txId: transactionId, date: new Date().toISOString() });
        } else {
            await txRef.update({ status });
        }
        res.json({ message: "Status Updated" });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// Admin: Manual Create & Approve
app.post('/api/admin/transaction/create-approved', authenticateToken, isAnyAdmin, async (req, res) => {
    const { targetPhone, type, amount, externalId } = req.body;
    try {
        if (externalId) {
            const dupSnap = await db.ref('used_external_ids/' + externalId).once('value');
            if (dupSnap.exists()) return res.status(400).json({ message: "Duplicate ID." });
        }
        const userRef = db.ref('users/' + targetPhone);
        const userSnap = await userRef.once('value');
        if (!userSnap.exists()) return res.status(404).json({ message: "User not found." });
        const userData = userSnap.val();

        const currentBalance = userData.balance || 0;
        const amt = parseFloat(amount);
        const isIntake = type.toLowerCase().includes("dir") || type.toLowerCase().includes("saar");
        const newBalance = isIntake ? currentBalance + amt : currentBalance - amt;

        const newTxRef = db.ref('transactions').push();
        await newTxRef.set({
            userId: targetPhone, uid: userData.uid, type, amount: amt, status: 'APPROVED',
            date: new Date().toISOString(), approvedBy: req.user.phoneNumber + " (Manual)",
            beforeBalance: currentBalance, afterBalance: newBalance, externalId
        });
        await userRef.update({ balance: newBalance });
        if (externalId) await db.ref('used_external_ids/' + externalId).set({ txId: newTxRef.key });
        res.json({ message: "Created and Approved" });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// Admin Fetch Endpoints
app.get('/api/admin/pending-users', authenticateToken, isAnyAdmin, async (req, res) => {
    const snap = await db.ref('users').orderByChild('status').equalTo('PENDING').once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/all-users', authenticateToken, isAnyAdmin, async (req, res) => {
    const snap = await db.ref('users').once('value');
    res.json(snap.val() || {});
});

app.post('/api/admin/user/activate', authenticateToken, isAnyAdmin, async (req, res) => {
    const { targetPhone } = req.body;
    await db.ref('users/' + targetPhone).update({ status: 'ACTIVE' });
    res.json({ message: 'Activated' });
});

app.post('/api/admin/user/delete', authenticateToken, isMasterAdmin, async (req, res) => {
    const { targetPhone } = req.body;
    await db.ref('users/' + targetPhone).remove();
    res.json({ message: 'Deleted' });
});

app.post('/api/admin/user/recharge', authenticateToken, isMasterAdmin, async (req, res) => {
    const { targetPhone, newBalance } = req.body;
    await db.ref('users/' + targetPhone).update({ balance: parseFloat(newBalance) });
    res.json({ message: 'Success' });
});

app.get('/api/admin/transactions', authenticateToken, isAnyAdmin, async (req, res) => {
    const snap = await db.ref('transactions').once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/analytics', authenticateToken, isAnyAdmin, async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const txSnap = await db.ref('transactions').once('value');
        const txs = txSnap.val() || {};
        let dep = 0, withdr = 0;
        Object.values(txs).forEach(t => {
            if(t.date.startsWith(today) && t.status === 'APPROVED') {
                if(t.type.toLowerCase().includes("dir") || t.type.toLowerCase().includes("saar")) dep += t.amount;
                else withdr += t.amount;
            }
        });
        res.json({ totalDeposits: dep, totalWithdrawals: withdr, newUsersToday: 0 });
    } catch (e) { res.status(500).send("Error"); }
});

app.get('/api/config', async (req, res) => {
    const snap = await db.ref('config').once('value');
    res.json(snap.val() || { whatsapp: "+252...", instructions: "Follow steps", minVersion: "1.0" });
});

app.post('/api/admin/config', authenticateToken, isMasterAdmin, async (req, res) => {
    await db.ref('config').update(req.body);
    res.json({ message: 'Updated' });
});

// Start Server
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Master Backend live on ${PORT}`));
