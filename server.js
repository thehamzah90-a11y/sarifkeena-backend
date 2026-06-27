const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || 'SarifKeennaSecret786';

const GATEWAY_SECRET = process.env.GATEWAY_SECRET || 'SK-GATEWAY-ULTIMATE-SECRET-786';
const TRUSTED_DEVICE_ID = process.env.TRUSTED_DEVICE_ID || 'PENDING';
const SLSH_RATE = 11000;

let db = null;
try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_DATABASE_URL) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DATABASE_URL
        });
        db = admin.database();
        console.log("✅ Database Active.");
    }
} catch (error) { console.error("❌ DB Error:", error.message); }

app.use(cors());
app.use(bodyParser.json());

const getLocalNumber = (phone) => {
    if (!phone) return "";
    const lower = phone.toString().toLowerCase().trim();
    if (['geesi', 'eesi', 'maamulka'].includes(lower)) return lower;
    const clean = lower.replace(/\D/g, '');
    return clean.length >= 9 ? clean.slice(-9) : clean;
};

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
    if (req.user && ['MASTER', 'SUPPORT'].includes(req.user.role)) next();
    else res.status(403).json({ message: "Access Denied" });
};

const isMaster = (req, res, next) => {
    if (req.user && req.user.role === 'MASTER') next();
    else res.status(403).json({ message: "Master Access Only" });
};

app.get('/', (req, res) => res.send("🚀 Sarifkeenna PRO v1.5.0 Live!"));

app.post('/api/login', async (req, res) => {
    try {
        const { phoneNumber, password, mode } = req.body;
        const input = getLocalNumber(phoneNumber);

        const masterPass = process.env.ADMIN_PASSWORD || 'Habo3290';
        if (input === 'geesi' || input === 'eesi') {
            if (password === masterPass) {
                const token = jwt.sign({ phoneNumber: 'geesi', uid: 'ADMIN', role: 'MASTER' }, SECRET_KEY, { expiresIn: '30d' });
                return res.json({ token, uid: 'ADMIN', role: 'MASTER' });
            } else return res.status(401).json({ message: "Wrong Password." });
        }

        const supportPass = process.env.SUPPORT_ADMIN_PASS || 'Support@786';
        if (input === 'maamulka') {
            if (password === supportPass) {
                const token = jwt.sign({ phoneNumber: 'maamulka', uid: 'SUPPORT', role: 'SUPPORT' }, SECRET_KEY, { expiresIn: '30d' });
                return res.json({ token, uid: 'SUPPORT', role: 'SUPPORT' });
            } else return res.status(401).json({ message: "Wrong Password." });
        }

        if (input.length < 9) return res.status(400).json({ message: "Incomplete Number." });
        const userRef = db.ref('users/' + input);
        const snap = await userRef.once('value');
        const user = snap.val();

        if (mode === 'register') {
            if (user) return res.status(400).json({ message: "Already registered." });
            const uid = "SK-" + Math.random().toString(36).substr(2, 6).toUpperCase();
            await userRef.set({ uid, phoneNumber: input, password, balance: 0.0, status: 'PENDING', isReviewer: false, createdAt: new Date().toISOString() });
            return res.json({ message: "PENDING_ACTIVATION", uid });
        } else {
            if (!user) return res.status(404).json({ message: "Not found." });
            if (user.status === 'PENDING') return res.status(403).json({ message: "PENDING_ACTIVATION", uid: user.uid });
            if (user.password !== password) return res.status(401).json({ message: "Wrong password." });
            const token = jwt.sign({ phoneNumber: input, uid: user.uid, role: 'USER', isReviewer: user.isReviewer || false }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token, uid: user.uid, role: 'USER', isReviewer: user.isReviewer || false });
        }
    } catch (e) { res.status(500).json({ message: "Login Error" }); }
});

app.post('/api/hooks/zaad-sms', async (req, res) => {
    const { amount, senderPhone, refId, timestamp, deviceId, signature, currency } = req.body;
    try {
        const dataToSign = `${amount}|${senderPhone}|${refId}|${timestamp}|${deviceId}|${currency}`;
        const expectedSig = crypto.createHmac('sha256', GATEWAY_SECRET).update(dataToSign).digest('hex');
        if (signature !== expectedSig) return res.status(403).json({ message: "Unauthorized" });
        if (TRUSTED_DEVICE_ID !== "PENDING" && deviceId !== TRUSTED_DEVICE_ID) return res.status(403).json({ message: "Unauthorized Device" });
        if (Math.abs(Date.now() - timestamp) > 120000) return res.status(403).json({ message: "Expired" });
        const dup = await db.ref('used_external_ids/' + refId).once('value');
        if (dup.exists()) return res.json({ message: "Duplicate" });

        const phone = getLocalNumber(senderPhone);
        let finalUsd = parseFloat(amount);
        if (currency === "SLSH") finalUsd = Math.floor((finalUsd / SLSH_RATE) * 100) / 100;

        const txSnap = await db.ref('transactions').orderByChild('userId').equalTo(phone).once('value');
        const transactions = txSnap.val() || {};
        let matchedId = null;
        Object.keys(transactions).forEach(id => {
            const tx = transactions[id];
            if (tx.status === 'PENDING' && tx.type.includes('ZAAD') && Math.abs(tx.amount - finalUsd) < 0.10) matchedId = id;
        });

        if (!matchedId) {
            await db.ref('unclaimed_deposits/' + refId).set({ amount: finalUsd, raw: amount, currency, phone, date: new Date().toISOString() });
            return res.json({ message: "Unclaimed" });
        }
        if (finalUsd >= 100.0) {
            await db.ref('transactions/' + matchedId).update({ status: 'PENDING_MASTER_CHECK', externalId: refId });
            return res.json({ message: "Flagged" });
        }
        const userRef = db.ref('users/' + phone);
        const userSnap = await userRef.once('value');
        const currentBal = userSnap.val().balance || 0;
        const newBal = currentBal + finalUsd;
        await userRef.update({ balance: newBal });
        await db.ref('transactions/' + matchedId).update({ status: 'APPROVED', approvedBy: `🤖 System`, beforeBalance: currentBal, afterBalance: newBal, externalId: refId });
        await db.ref('used_external_ids/' + refId).set({ txId: matchedId, date: new Date().toISOString() });
        res.json({ message: "Processed" });
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/admin/user/toggle-reviewer', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { targetPhone, isReviewer } = req.body;
        await db.ref('users/' + targetPhone).update({ isReviewer });
        res.json({ message: "Status Updated" });
    } catch (e) { res.status(500).send(e.message); }
});

app.post('/api/admin/transaction/status', authenticateToken, isAdmin, async (req, res) => {
    const { transactionId, status, finalAmount, externalId } = req.body;
    try {
        const txRef = db.ref('transactions/' + transactionId);
        const txSnap = await txRef.once('value');
        const txData = txSnap.val();
        if (!txData) return res.status(404).send("Not found");
        if (status === 'APPROVED' && txData.status.includes('PENDING')) {
            const userRef = db.ref('users/' + txData.userId);
            const userSnap = await userRef.once('value');
            const userData = userSnap.val();
            const current = userData.balance || 0;
            const amt = parseFloat(finalAmount || txData.amount);
            const isIntake = txData.type.toLowerCase().includes("dir") || txData.type.toLowerCase().includes("saar");
            const newBal = isIntake ? current + amt : current - amt;
            await userRef.update({ balance: newBal });
            await txRef.update({ status, amount: amt, approvedBy: req.user.phoneNumber, beforeBalance: current, afterBalance: newBal, externalId: externalId || txData.externalId });
            if(externalId) await db.ref('used_external_ids/' + externalId).set({ txId: transactionId });
        } else await txRef.update({ status });
        res.json({ message: "Updated" });
    } catch (e) { res.status(500).send(e.message); }
});

app.get('/api/config', async (req, res) => {
    const snap = await db.ref('config').once('value');
    res.json(snap.val() || { whatsapp: "+252...", instructions: "Follow steps", minVersion: "1.3" });
});

app.post('/api/admin/config', authenticateToken, isMaster, async (req, res) => {
    await db.ref('config').update(req.body);
    res.json({ message: 'Settings Updated' });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 v1.5.0 MASTER Server on ${PORT}`));
