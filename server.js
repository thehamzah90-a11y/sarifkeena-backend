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
        console.log("✅ v1.9.6 SUPREME EMPIRE ONLINE.");
    }
} catch (error) { console.error("❌ DB Error:", error.message); }

app.use(cors());
app.use(bodyParser.json());

// --- SUPREME FORENSIC UTILS ---
const normalizePhone = (p) => {
    if (!p) return "";
    const clean = p.toString().replace(/\D/g, '');
    return clean.length >= 9 ? clean.slice(-9) : clean;
};

const verifySignature = (data, signature, publicKey) => {
    try {
        const verifier = crypto.createVerify('sha256');
        verifier.update(data);
        verifier.end();
        return verifier.verify(publicKey, signature, 'hex');
    } catch (e) { return false; }
};

const getVerifiedBalance = async () => {
    const snap = await db.ref('ledger/verified_balance').once('value');
    return parseFloat(snap.val() || 0);
};

const updateVerifiedBalance = async (amount, type = 'ADD') => {
    await db.ref('ledger/verified_balance').transaction((current) => {
        const val = parseFloat(current || 0);
        return type === 'ADD' ? val + amount : val - amount;
    });
};

const logBalanceChange = async (phoneNumber, amount, type, oldBal, newBal, reason, actor, details = {}) => {
    const event = { ts: new Date().toISOString(), amount, type, oldBal, newBal, reason, actor, details };
    await db.ref(`ledger/balance_logs/${phoneNumber}`).push().set(event);
    await db.ref('global_forensics').push().set({ ...event, phoneNumber, action: `BAL_${type}` });
};

const triggerFraudAlert = async (type, actor, deviceId, details) => {
    const ref = db.ref('fraud_alerts').push();
    await ref.set({ ts: new Date().toISOString(), type, actor, deviceId, details, status: 'ACTIVE' });
};

const logForensic = async (req, action, target, details = {}) => {
    try {
        const entry = {
            ts: new Date().toISOString(),
            actor: req.user ? req.user.phoneNumber : "SYSTEM",
            role: req.user ? req.user.role : "N/A",
            action, target,
            dna: req.user ? req.user.deviceId : "UNK",
            asig: req.body.p_asig || "SYSTEM_STAMPED",
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

// --- v1.9.6 SUPREME AUTH ---
app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        const { phoneNumber, password, mode, deviceId, publicKey, pkg, sig } = req.body;
        const normalized = normalizePhone(phoneNumber);

        const lockSnap = await db.ref('config/hardware_locks').once('value');
        const locks = lockSnap.val() || {};
        if (locks.pkg && locks.pkg !== pkg) return res.status(403).json({ message: "Integrity Compromised" });

        const configSnap = await db.ref('config').once('value');
        const config = configSnap.val() || {};

        if (phoneNumber === 'geesi') {
            if (password === MASTER_PASS) {
                if (publicKey) await db.ref(`config/hardware_keys/${deviceId}`).set(publicKey);
                const token = jwt.sign({ phoneNumber: 'geesi', role: 'MASTER', deviceId }, SECRET_KEY, { expiresIn: '30d' });
                return res.json({ token, role: 'MASTER' });
            }
        }

        if (phoneNumber === 'maamulka' || phoneNumber === 'maamulka_2') {
            const requiredPass = (phoneNumber === 'maamulka') ? SUPPORT_PASS : SUPPORT_PASS_2;
            if (password === requiredPass) {
                const currentDna = locks.support_dna ? locks.support_dna[phoneNumber] : null;
                if (currentDna && currentDna !== deviceId) {
                    await triggerFraudAlert("SUPPORT_COLLISION", phoneNumber, deviceId, { msg: "Device collision" });
                    return res.status(403).json({ message: "Device Locked" });
                }
                if (publicKey) await db.ref(`config/hardware_keys/${deviceId}`).set(publicKey);
                await db.ref(`config/hardware_locks/support_dna/${phoneNumber}`).set(deviceId);
                const token = jwt.sign({ phoneNumber, role: 'SUPPORT', deviceId }, SECRET_KEY, { expiresIn: `${config.staffSessionHours || 12}h` });
                return res.json({ token, role: 'SUPPORT' });
            }
        }

        if (phoneNumber === 'sensor_primary') {
            if (password === LISTENER_PASS) {
                const activeDna = locks.listener;
                if (activeDna && activeDna !== deviceId) {
                    await db.ref('config/gateway_secret').remove();
                    await db.ref('config/hardware_locks/listener_frozen').set(true);
                    await triggerFraudAlert("LISTENER_HIJACK", "CRITICAL", deviceId, { msg: "Frozen" });
                    return res.status(403).json({ message: "FROZEN" });
                }
                if (locks.listener_frozen) return res.status(403).json({ message: "CONTACT MASTER" });
                if (publicKey) await db.ref(`config/hardware_keys/${deviceId}`).set(publicKey);
                await db.ref(`config/hardware_locks/listener`).set(deviceId);
                const token = jwt.sign({ phoneNumber: 'sensor_primary', role: 'LISTENER', deviceId }, SECRET_KEY, { expiresIn: '30d' });
                return res.json({ token, role: 'LISTENER' });
            }
        }

        const userRef = db.ref('users/' + normalized);
        const snap = await userRef.once('value');
        const user = snap.val();

        if (mode === 'register') {
            if (user) return res.status(400).json({ message: "Duplicate" });
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

// --- DOSSIER & FORENSIC FEED ---
app.get('/api/admin/user-dossier/:phone', authenticate, isSupport, async (req, res) => {
    try {
        const phone = normalizePhone(req.params.phone);
        const userSnap = await db.ref('users/' + phone).once('value');
        const txSnap = await db.ref('transactions').orderByChild('userId').equalTo(phone).limitToLast(100).once('value');
        const logSnap = await db.ref('ledger/balance_logs/' + phone).limitToLast(50).once('value');
        res.json({
            profile: userSnap.val(),
            transactions: Object.values(txSnap.val() || {}).reverse(),
            balanceHistory: Object.values(logSnap.val() || {}).reverse()
        });
    } catch (e) { res.status(500).send("Err"); }
});

app.get('/api/admin/global-forensics', authenticate, isMaster, async (req, res) => {
    try {
        const snap = await db.ref('global_forensics').limitToLast(2000).once('value');
        res.json(Object.values(snap.val() || {}).reverse());
    } catch (e) { res.status(500).send("Err"); }
});

// --- PAYOUT (WITHDRAWAL) SYSTEM ---
app.post('/api/admin/request-payout', authenticate, isSupport, async (req, res) => {
    try {
        const { targetPhone, amount, description } = req.body;
        const ref = db.ref('payout_requests').push();
        await ref.set({
            ts: new Date().toISOString(),
            phoneNumber: normalizePhone(targetPhone),
            amount: parseFloat(amount),
            description,
            requestedBy: req.user.phoneNumber,
            status: 'PENDING'
        });
        await logForensic(req, "PAYOUT_REQ", targetPhone, { amount, description });
        res.json({ message: "OK" });
    } catch (e) { res.status(500).send("Err"); }
});

// --- CUSTOMER CORE ---
app.get('/api/balance', authenticate, async (req, res) => {
    const snap = await db.ref('users/' + req.user.phoneNumber + '/balance').once('value');
    res.json({ balance: parseFloat(snap.val() || 0) });
});

app.post('/api/v1/user/action-post', authenticate, async (req, res) => {
    try {
        const { type, amount, uid, details } = req.body;
        const ref = db.ref('transactions').push();
        await ref.set({
            userId: req.user.phoneNumber,
            uid: uid || req.user.uid,
            type, amount: parseFloat(amount), status: 'PENDING',
            date: new Date().toISOString(), details: details || {}
        });
        // Log all user activities (1xbet, wallet transfer requests, etc.) to forensics
        await logForensic(req, "USER_ACTION", type, { amount, uid });
        res.json({ message: "SUCCESS" });
    } catch (e) { res.status(500).send("Err"); }
});

// --- STAFF ACTIONS ---
app.post('/api/v1/queue/update-state', authenticate, isSupport, async (req, res) => {
    const { transactionId, status, finalAmount } = req.body;
    try {
        const txRef = db.ref('transactions/' + transactionId);
        const txSnap = await txRef.once('value');
        const txData = txSnap.val();

        if (status === 'APPROVED' && txData.status === 'PENDING') {
            const amt = parseFloat(finalAmount || txData.amount);
            const userRef = db.ref('users/' + txData.userId);
            const uSnap = await userRef.once('value');
            const oldBal = uSnap.val().balance || 0;

            // Intake: Zaad/Sahal deposits. Outflow: Withdrawals/1xBet.
            const isIntake = (txData.type.toLowerCase().includes("zaad") || txData.type.toLowerCase().includes("sahal") || txData.type.toLowerCase().includes("edahab"));
            const newBal = isIntake ? oldBal + amt : oldBal - amt;

            await userRef.update({ balance: newBal });
            await txRef.update({ status: 'APPROVED', amount: amt, approvedBy: req.user.phoneNumber, beforeBalance: oldBal, afterBalance: newBal });

            await logBalanceChange(txData.userId, amt, isIntake ? 'CREDIT' : 'DEBIT', oldBal, newBal, `${txData.type} Approved`, req.user.phoneNumber, { txId: transactionId });
            await logForensic(req, "APPROVE_TX", txData.userId, { type: txData.type, amount: amt });
        } else {
            await txRef.update({ status });
            await logForensic(req, "REJECT_TX", txData.userId, { txId: transactionId });
        }
        res.json({ message: "OK" });
    } catch (e) { res.status(500).send("Err"); }
});

// --- CONFIG & ADMIN ---
app.get('/api/config', async (req, res) => {
    const snap = await db.ref('config').once('value');
    const c = snap.val() || {};
    res.json({
        whatsapp: c.whatsapp || "+252...",
        minVersion: c.minVersion || "1.0",
        globalReviewerMode: c.globalReviewerMode || false,
        simulatorEnabled: c.simulatorEnabled || false,
        instructions: c.instructions || "",
        headingText: c.headingText || "SARIFKEENNA",
        media: c.media || {},
        gateways: c.gateways || { zaad: { name: "ZAAD", ussd: "*220*", auto: true, amountPattern: "([0-9.]+)\\$", senderPattern: "from\\s(6[0-9]{8})", refPattern: "Ref:([A-Z0-9]+)", balancePattern: "Balance\\sis\\s\\$([0-9.]+)", outgoingPattern: "sent\\s\\$([0-9.]+)\\sto\\s(6[0-9]{8})" } }
    });
});

app.post('/api/admin/config-update', authenticate, isMaster, async (req, res) => {
    await db.ref('config').update(req.body);
    res.json({ message: "OK" });
});

app.get('/api/admin/all-users', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('users').once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/activity-logs', authenticate, isMaster, async (req, res) => {
    const snap = await db.ref('activity_logs').limitToLast(1000).once('value');
    res.json(snap.val() || {});
});

app.post('/api/v1/ops/track-view', authenticate, isSupport, async (req, res) => {
    await logForensic(req, "VIEW_PASSWORD", req.body.targetPhone, { reason: req.body.reason });
    res.json({ message: "OK" });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 v1.9.6 SUPREME EMPIRE Active.`));
