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
const LISTENER_PASS = process.env.LISTENER_PASS || 'Sensor@786';
const INTERNAL_SALT = 'INTERNAL_SALT_99';

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
        console.log("✅ v1.9.3 ADVANCED FORENSIC Active.");
    }
} catch (error) { console.error("❌ DB Error:", error.message); }

app.use(cors());
app.use(bodyParser.json());

// --- UTILS ---
const normalizePhone = (p) => {
    if (!p) return "";
    const clean = p.toString().replace(/\D/g, '');
    return clean.length >= 9 ? clean.slice(-9) : clean;
};

// ASYMMETRIC VERIFICATION
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

const triggerFraudAlert = async (type, actor, deviceId, details) => {
    const ref = db.ref('fraud_alerts').push();
    await ref.set({
        ts: new Date().toISOString(),
        type, actor, deviceId, details,
        status: 'ACTIVE'
    });
};

const logForensic = async (req, action, target, details = {}) => {
    try {
        const ref = db.ref('activity_logs').push();
        await ref.set({
            ts: new Date().toISOString(),
            actor: req.user ? req.user.phoneNumber : "SYSTEM",
            role: req.user ? req.user.role : "N/A",
            action, target,
            dna: req.user ? req.user.deviceId : "UNK",
            details
        });
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

// --- v1.9.3 STEALTH AUTH ---
app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        const { phoneNumber, password, mode, deviceId, publicKey, pkg, sig } = req.body;
        const normalized = normalizePhone(phoneNumber);

        const lockRef = db.ref('config/hardware_locks');
        const lockSnap = await lockRef.once('value');
        const locks = lockSnap.val() || {};

        // Security check for Pkg/Sig
        if (locks.pkg && locks.pkg !== pkg) return res.status(403).json({ message: "Integrity Compromised" });

        const configSnap = await db.ref('config').once('value');
        const config = configSnap.val() || {};

        // MASTER LOGIN
        if (phoneNumber === 'geesi') {
            if (password === MASTER_PASS) {
                if (publicKey) await db.ref(`config/hardware_keys/${deviceId}`).set(publicKey);
                const token = jwt.sign({ phoneNumber: 'geesi', role: 'MASTER', deviceId }, SECRET_KEY, { expiresIn: '30d' });
                return res.json({ token, role: 'MASTER' });
            }
        }

        // SUPPORT LOGIN
        if (phoneNumber === 'maamulka') {
            if (password === SUPPORT_PASS) {
                if (locks.support && !locks.support.includes(deviceId)) return res.status(403).json({ message: "Unauthorized Device" });
                if (publicKey) await db.ref(`config/hardware_keys/${deviceId}`).set(publicKey);
                const expiry = `${config.staffSessionHours || 12}h`;
                const token = jwt.sign({ phoneNumber: 'maamulka', role: 'SUPPORT', deviceId }, SECRET_KEY, { expiresIn: expiry });
                return res.json({ token, role: 'SUPPORT' });
            }
        }

        // LISTENER LOGIN
        if (phoneNumber === 'sensor_primary') {
            if (password === LISTENER_PASS) {
                if (locks.listener && locks.listener !== deviceId) return res.status(403).json({ message: "Ghost Denied" });
                if (publicKey) await db.ref(`config/hardware_keys/${deviceId}`).set(publicKey);
                const token = jwt.sign({ phoneNumber: 'sensor_primary', role: 'LISTENER', deviceId }, SECRET_KEY, { expiresIn: '30d' });
                return res.json({ token, role: 'LISTENER' });
            }
        }

        // USER AUTH
        const userRef = db.ref('users/' + normalized);
        const snap = await userRef.once('value');
        const user = snap.val();

        if (mode === 'register') {
            if (user) return res.status(400).json({ message: "Duplicate" });
            const uid = "SK-" + Math.random().toString(36).substr(2, 6).toUpperCase();
            await userRef.set({ uid, phoneNumber: normalized, password, balance: 0.0, status: 'PENDING', isReviewer: false, createdAt: new Date().toISOString(), dailyLimit: 250 });
            return res.json({ message: "PENDING_ACTIVATION", uid });
        } else {
            if (!user) return res.status(404).json({ message: "None" });
            if (user.password !== password) return res.status(401).json({ message: "Fail" });
            if (user.status === 'FROZEN') return res.status(403).json({ message: "Account Locked" });

            const token = jwt.sign({ phoneNumber: normalized, uid: user.uid, role: 'USER', isReviewer: user.isReviewer || false }, SECRET_KEY, { expiresIn: '30d' });
            return res.json({ token, uid: user.uid, role: 'USER', isReviewer: user.isReviewer || false });
        }
    } catch (e) { res.status(500).json({ message: "Err" }); }
});

// --- v1.9.3 CORE LOGIC: THE FORENSIC PULSE ---
app.post('/api/v1/gateway/pulse', async (req, res) => {
    const { p_v1, p_v2, refId, timestamp, deviceId, currency, p_sid, p_gst, reportedBalance, p_asig } = req.body;
    try {
        // 1. ASYMMETRIC SECURITY HANDSHAKE
        const keySnap = await db.ref(`config/hardware_keys/${deviceId}`).once('value');
        const pubKey = keySnap.val();
        if (pubKey) {
            const dataToVerify = `${p_v1}|${p_v2}|${refId}|${timestamp}|${deviceId}|${currency}`;
            if (!verifySignature(dataToVerify, p_asig, pubKey)) {
                await triggerFraudAlert("CRYPTO_FAIL", "SENSOR", deviceId, { refId });
                return res.status(403).json({ message: "Ghost Denied" });
            }
        }

        const amount = parseFloat(p_v1);
        const phone = normalizePhone(p_v2);
        const bankBal = parseFloat(reportedBalance);

        // 2. VELOCITY & SENSITIVITY CHECK
        const userRef = db.ref('users/' + phone);
        const userSnap = await userRef.once('value');
        const user = userSnap.val() || {};

        if (amount >= 100 || (user.dailyLimitUsage || 0) + amount > (user.dailyLimit || 250)) {
            await db.ref('quarantine/' + refId).set({ ...req.body, reason: "LIMIT_BREACH" });
            await triggerFraudAlert("SENSITIVITY_LIMIT", phone, deviceId, { amount });
            return res.json({ message: "LIMIT_POPUPS_TRIGGERED" });
        }

        // 3. ATOMIC MATH RECONCILIATION
        const currentVerified = await getVerifiedBalance();
        const expected = currentVerified + amount;

        if (Math.abs(expected - bankBal) < 0.01) {
            await finalizeTransaction(phone, amount, refId, req.body, currentVerified, bankBal);
            await db.ref('ledger/fail_streak').set(0);
            return res.json({ message: "OK" });
        } else {
            const stateRef = db.ref('ledger/security_state');
            const stateSnap = await stateRef.once('value');
            const state = stateSnap.val() || { lastMismatch: 0, failStreak: 0 };

            if (Date.now() - state.lastMismatch < 1800000 && state.failStreak >= 1) {
                await db.ref('config/gateway_secret').remove(); // SILENT KILL
                await triggerFraudAlert("COOLING_RULE_VIOLATION", "SYSTEM", deviceId, { gap: bankBal - expected });
                return res.json({ message: "GHOST_MODE_ACTIVE" });
            }

            await stateRef.update({ lastMismatch: Date.now(), failStreak: (state.failStreak || 0) + 1 });

            const now = Date.now();
            const reqSnap = await db.ref('transactions').orderByChild('status').equalTo('PENDING').once('value');
            const pendingReqs = Object.values(reqSnap.val() || {}).filter(r => {
                const rTs = new Date(r.date).getTime();
                return rTs >= (now - 420000) && rTs <= (now - 240000);
            });

            const solved = pendingReqs.find(r => Math.abs((currentVerified + amount + r.amount) - bankBal) < 0.01);
            if (solved) {
                await finalizeTransaction(phone, amount, refId, req.body, currentVerified, bankBal, "CLUSTER_HEAL");
                return res.json({ message: "OK" });
            } else {
                await db.ref('quarantine/' + refId).set({ ...req.body, reason: "MATH_FAILURE" });
                return res.json({ message: "QUARANTINED" });
            }
        }
    } catch (e) { res.status(500).send("Err"); }
});

async function finalizeTransaction(phone, amount, refId, raw, before, after, method = "AUTO") {
    await updateVerifiedBalance(amount, 'ADD');
    const txSnap = await db.ref('transactions').orderByChild('userId').equalTo(phone).once('value');
    const txs = txSnap.val() || {};
    let tid = Object.keys(txs).find(k => txs[k].status === 'PENDING' && Math.abs(txs[k].amount - amount) < 0.1);

    if (tid) {
        await db.ref('transactions/' + tid).update({
            status: 'APPROVED', externalId: refId, approvedBy: '🤖 Sensor',
            beforeBalance: before, afterBalance: after, method,
            forensics: { dna: raw.deviceId, sid: raw.p_sid, gst: raw.p_gst, asig: raw.p_asig }
        });
        const userRef = db.ref('users/' + phone);
        await userRef.transaction(u => {
            if (u) {
                u.balance = (u.balance || 0) + amount;
                u.dailyLimitUsage = (u.dailyLimitUsage || 0) + amount;
            }
            return u;
        });
    }
}

// --- STAFF OPS ---
app.post('/api/v1/queue/update-state', authenticate, isSupport, async (req, res) => {
    const { transactionId, status, finalAmount, externalId, p_asig } = req.body;
    const deviceId = req.user.deviceId;
    try {
        const keySnap = await db.ref(`config/hardware_keys/${deviceId}`).once('value');
        const pubKey = keySnap.val();
        if (pubKey) {
            const dataToVerify = `${transactionId}|${status}|${deviceId}`;
            if (!verifySignature(dataToVerify, p_asig, pubKey)) {
                if (req.user.role === 'SUPPORT') {
                    await db.ref(`config/hardware_locks/support`).transaction(ids => (ids || []).filter(id => id !== deviceId));
                    await triggerFraudAlert("STAFF_CRYPTO_FAIL", req.user.phoneNumber, deviceId, { transactionId });
                    return res.status(401).json({ message: "Unauthorized Session" });
                } else {
                    await triggerFraudAlert("MASTER_CRYPTO_FAIL", "MASTER", deviceId, { transactionId });
                }
            }
        }

        const txRef = db.ref('transactions/' + transactionId);
        const txSnap = await txRef.once('value');
        const txData = txSnap.val();
        if (status === 'APPROVED' && txData.status === 'PENDING') {
            const amt = parseFloat(finalAmount || txData.amount);
            const userRef = db.ref('users/' + txData.userId);
            const uSnap = await userRef.once('value');
            const current = uSnap.val().balance || 0;
            const isIntake = (txData.type.toLowerCase().includes("dir") || txData.type.toLowerCase().includes("saar"));
            const newBal = isIntake ? current + amt : current - amt;

            await userRef.update({ balance: newBal });
            await txRef.update({
                status, amount: amt, approvedBy: req.user.phoneNumber,
                beforeBalance: current, afterBalance: newBal, externalId: externalId || txData.externalId,
                isManual: true
            });
            await logForensic(req, "APPROVE_TX", txData.userId, { txId: transactionId, amount: amt });
        } else {
            await txRef.update({ status });
        }
        res.json({ message: "OK" });
    } catch (e) { res.status(500).send("Err"); }
});

// --- MASTER CONTROLS ---
app.post('/api/v1/sys/control', authenticate, isMaster, async (req, res) => {
    const { cmd, type, hardwareId, gatewayId, gatewayData } = req.body;
    if (cmd === "REGISTER_DNA") {
        const ref = db.ref(`config/hardware_locks/${type}`);
        if (type === 'support') {
            const snap = await ref.once('value');
            let ids = snap.val() || [];
            if (!ids.includes(hardwareId)) ids.push(hardwareId);
            await ref.set(ids);
        } else await ref.set(hardwareId);
    }
    if (cmd === "UPSERT_GATEWAY") {
        await db.ref(`config/gateways/${gatewayId}`).set(gatewayData);
    }
    if (cmd === "THEFT_WIPE") {
        await db.ref('config/gateway_secret').remove();
        await db.ref('config/hardware_locks').remove();
        await db.ref('config/hardware_keys').remove();
        await db.ref('config/anti_theft_active').set(true);
    }
    if (cmd === "RESET_THEFT") {
        await db.ref('config/anti_theft_active').set(false);
    }
    res.json({ message: "OK" });
});

app.get('/api/config', async (req, res) => {
    const snap = await db.ref('config').once('value');
    const c = snap.val() || {};
    res.json({
        whatsapp: c.whatsapp || "+252...",
        minVersion: c.minVersion || "1.0",
        globalReviewerMode: c.globalReviewerMode || false,
        simulatorEnabled: c.simulatorEnabled || false,
        staffSessionHours: c.staffSessionHours || 12,
        media: c.media || {},
        gateways: c.gateways || {
            zaad: { name: "ZAAD", ussd: "*220*", auto: true, amountPattern: "([0-9.]+)\\$", senderPattern: "from\\s(6[0-9]{8})", refPattern: "Ref:([A-Z0-9]+)", balancePattern: "Balance\\sis\\s\\$([0-9.]+)" },
            sahal: { name: "SAHAL", ussd: "*888*", auto: false, amountPattern: "\\$([0-9.]+)", senderPattern: "(6[0-9]{8})", refPattern: "Ref:([0-9]+)", balancePattern: "New\\sbalance\\sis\\s\\$([0-9.]+)" }
        }
    });
});

app.post('/api/v1/sys/simulate', authenticate, isMaster, async (req, res) => {
    const snap = await db.ref('config/simulatorEnabled').once('value');
    if (!snap.val()) return res.status(403).json({ message: "Simulator Disabled" });

    const { smsAmount, smsBalance, pendingGaps } = req.body;
    const currentVerified = await getVerifiedBalance();
    let report = `Current DB: $${currentVerified}\nSMS Amount: $${smsAmount}\nReported Bal: $${smsBalance}\n`;
    const gap = smsBalance - (currentVerified + smsAmount);
    if (Math.abs(gap) < 0.01) {
        report += "RESULT: PERFECT MATCH - Instant Approval.";
    } else {
        report += `RESULT: MISMATCH ($${gap.toFixed(2)} gap).\nChecking Time-Fence Cluster...\n`;
        const match = pendingGaps.find(g => Math.abs(g - gap) < 0.01);
        if (match) report += `FOUND MATCH in cluster: $${match}. System would Auto-Heal.`;
        else report += "NO MATCH. System would trigger QUARANTINE.";
    }
    res.json({ report });
});

app.get('/api/admin/fraud-alerts', authenticate, isMaster, async (req, res) => {
    const snap = await db.ref('fraud_alerts').limitToLast(50).once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/all-users', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('users').once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/transactions', authenticate, isSupport, async (req, res) => {
    const snap = await db.ref('transactions').limitToLast(600).once('value');
    res.json(snap.val() || {});
});

app.get('/api/admin/activity-logs', authenticate, isMaster, async (req, res) => {
    const snap = await db.ref('activity_logs').limitToLast(200).once('value');
    res.json(snap.val() || {});
});

app.post('/api/v1/sys/sim-migrate', authenticate, isMaster, async (req, res) => {
    const { newNumber, newBalance } = req.body;
    await db.ref('config/migration').set({ newNumber, newBalance, startTs: Date.now(), active: true });
    setTimeout(async () => {
        await db.ref('config/target_number').set(newNumber);
        await db.ref('ledger/verified_balance').set(parseFloat(newBalance));
        await db.ref('config/migration/active').set(false);
    }, 300000);
    res.json({ message: "MIGRATION_STARTED" });
});

app.post('/api/v1/ops/track-view', authenticate, isSupport, async (req, res) => {
    await logForensic(req, "VIEW_PASSWORD", req.body.targetPhone, { reason: req.body.reason });
    res.json({ message: "OK" });
});

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 v1.9.3 EMPIRE Active.`));
