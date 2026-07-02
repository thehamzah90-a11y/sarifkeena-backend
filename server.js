const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 10000;
const SECRET_KEY = process.env.SECRET_KEY || 'SarifkeenaSecret786';

const MASTER_PASS = process.env.ADMIN_PASSWORD || 'Habo3290';
const SUPPORT_PASS = process.env.SUPPORT_ADMIN_PASS || 'Support@786';
const SUPPORT_PASS_2 = process.env.SUPPORT_ADMIN_PASS_2 || 'Support@VIP';
const LISTENER_PASS = process.env.LISTENER_PASS || 'Sensor@786';

let db = null;
let dbStatus = "🔴 OFFLINE";

try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_DATABASE_URL) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: process.env.FIREBASE_DATABASE_URL
        });
        db = admin.database();
        dbStatus = "🟢 ONLINE";
        console.log("✅ v2.5.1 SUPREME BRAIN ONLINE.");
    }
} catch (error) {
    console.error("❌ DB Error:", error.message);
    dbStatus = "❌ ERR: " + error.message;
}

app.use(cors());
app.use(bodyParser.json());

// --- 132-KEY PATH CONSTANTS (SUPREME EDITION) ---
const PATH = {
    BRANDING: 'config/system_branding',
    LOGIC: 'config/system_logic',
    VERIFY: 'config/verification_engine',
    GATEWAY: 'config/gateways',
    DNA: 'config/hardware_dna',
    USERS: 'users',
    TX: 'transactions',
    LEDGER: 'ledger',
    FORENSICS: 'forensics',
    SYNC: 'sync_room',
    AUDITS: 'audits',
    PERMS: 'api_permissions',
    REFS: 'used_receipt_ids'
};

const normalizePhone = (p) => {
    if (!p) return "";
    const clean = p.toString().replace(/\D/g, '');
    return clean.length >= 9 ? clean.slice(-9) : clean;
};

const getNextImperialRef = async () => {
    if (!db) return "#000000";
    const ref = db.ref(PATH.LEDGER + '/097_receipt_counter');
    const res = await ref.transaction((c) => (c || 0) + 1);
    return "#" + res.snapshot.val().toString().padStart(6, '0');
};

const updateVerifiedLedger = async (amountUSD, type = 'ADD') => {
    if (!db) return;
    await db.ref(PATH.LEDGER + '/096_empire_verified_wealth_usd').transaction((current) => {
        const val = parseFloat(current || 0);
        return type === 'ADD' ? val + parseFloat(amountUSD) : val - parseFloat(amountUSD);
    });
};

const stampDNA = async (phoneNumber, deviceId) => {
    if (!db || !deviceId) return;
    const ts = new Date().toISOString();
    await db.ref(PATH.USERS + '/' + phoneNumber + '/071_identity_dna_stamps/' + deviceId).set({ ts, seen: true });
    await db.ref(PATH.USERS + '/' + phoneNumber).update({ '072_current_dna': deviceId });
};

// Global Forensic Logger for Admin/Support Actions
const logEmpireAction = async (req, action, target, details = {}) => {
    if (!db) return;
    try {
        const ts = new Date().toISOString();
        const actor = req.user ? req.user.phoneNumber : "SYSTEM";
        const entry = { ts, actor, action, target, dna: req.user?.deviceId || "WEB", details };
        await db.ref(PATH.FORENSICS + '/103_global_execution_feed').push().set(entry);
        if (req.user && (req.user.role === 'SUPPORT' || req.user.role === 'MASTER')) {
            await db.ref(PATH.FORENSICS + '/104_staff_dossiers/' + actor + '/actions').push().set(entry);
        }
    } catch (e) {}
};

// --- AUTH MIDDLEWARE (SUPREME JSON HARDENED) ---
const authenticate = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (!token) return res.status(401).json({ message: "No Token" });

        jwt.verify(token, SECRET_KEY, async (err, user) => {
            if (err) return res.status(403).json({ message: "Invalid Session" });
            req.user = user; next();
        });
    } catch (e) { res.status(500).json({ message: "Auth Failure" }); }
};

const isSupport = (req, res, next) => {
    if (req.user && (req.user.role === 'MASTER' || req.user.role === 'SUPPORT')) next();
    else res.status(403).json({ message: "Staff Only" });
};

const isMaster = (req, res, next) => {
    if (req.user && req.user.role === 'MASTER') next();
    else res.status(403).json({ message: "Master Only" });
};

// --- CORE APIs ---

app.post('/api/v1/user/auth-access', async (req, res) => {
    try {
        const { phoneNumber, password, mode, deviceId } = req.body;
        const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        // Staff Device Registry (Build 004.3)
        if (db && deviceId && ['eesi','maamulka','maamulka_2'].includes(phoneNumber)) {
             await db.ref(PATH.DNA + '/059_pending_approval_devices/' + deviceId).set({ role: phoneNumber, ip: clientIp, ts: new Date().toISOString() });
        }

        if (phoneNumber === 'eesi' && password === MASTER_PASS) {
            return res.json({ token: jwt.sign({ phoneNumber: 'eesi', role: 'MASTER', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '24h' }), role: 'MASTER' });
        }

        if (phoneNumber === 'maamulka' && password === SUPPORT_PASS) {
            return res.json({ token: jwt.sign({ phoneNumber: 'maamulka', role: 'SUPPORT', ip: clientIp, deviceId }, SECRET_KEY, { expiresIn: '24h' }), role: 'SUPPORT' });
        }

        const clean = normalizePhone(phoneNumber);
        if (!db) return res.status(503).json({ message: "Offline" });

        const userRef = db.ref(PATH.USERS + '/' + clean);
        const user = (await userRef.once('value')).val();

        if (mode === 'register') {
            if (user) return res.status(400).json({ message: "Exists" });
            await userRef.set({ '062_phoneNumber': clean, '063_password': password, '064_balanceUSD': 0.0, '065_status': 'PENDING', '067_createdAt': new Date().toISOString(), '132_isReviewer': false });
            return res.json({ message: "PENDING" });
        } else {
            if (!user || user['063_password'] !== password) return res.status(401).json({ message: "Fail" });
            if (user['065_status'] === 'BLOCKED') return res.status(403).json({ message: "Blocked" });
            await stampDNA(clean, deviceId);
            return res.json({
                token: jwt.sign({ phoneNumber: clean, role: 'USER', deviceId }, SECRET_KEY, { expiresIn: '30d' }),
                role: 'USER',
                '132_isReviewer': user['132_isReviewer'] || false
            });
        }
    } catch (e) { res.status(500).json({ message: "Auth Error" }); }
});

app.post('/api/v1/user/action-post', authenticate, async (req, res) => {
    try {
        if (!db) return res.status(503).json({ message: "Offline" });

        // BUILD 004: Universal Key Support
        const type = req.body['077_type'] || req.body.type;
        const amountSLSH = parseInt(req.body['079_amountSLSH'] || req.body.amountSLSH) || 0;
        const amountUSD = parseFloat(req.body['078_amountUSD'] || req.body.amountUSD) || 0;
        const externalId = req.body['086_externalId'] || req.body.externalId || "";
        const ph = req.user.phoneNumber;

        if (type.includes('ZAAD_WITHDRAW')) {
            const uRef = db.ref(PATH.USERS + '/' + ph);
            const uData = (await uRef.once('value')).val();
            const bal = parseFloat(uData['064_balanceUSD'] || 0);
            if (bal < amountUSD) return res.status(400).json({ message: "Insufficient Balance" });
            await uRef.update({ '064_balanceUSD': bal - amountUSD });
            await db.ref(PATH.TX).push().set({
                '076_userId': ph, '077_type': type, '079_amountSLSH': amountUSD * 10000, '078_amountUSD': amountUSD,
                '080_status': 'PENDING', '095_creation_ts': new Date().toISOString(), '082_prevBalance': bal, '083_newBalance': bal - amountUSD,
                '088_dnaStamp': req.user.deviceId
            });
            return res.json({ message: "SUCCESS" });
        }

        const finalUSD = amountUSD || (amountSLSH / 11000);
        await db.ref(PATH.TX).push().set({
            '076_userId': ph, '077_type': type, '079_amountSLSH': amountSLSH, '078_amountUSD': finalUSD,
            '080_status': 'PENDING', '095_creation_ts': new Date().toISOString(), '088_dnaStamp': req.user.deviceId
        });
        res.json({ message: "SUCCESS" });
    } catch (e) { res.status(500).json({ message: "Server Error" }); }
});

// --- SUPREME ADMIN APIs (BUILD 005 - 132 NODE EXPANSION) ---

app.get('/api/admin/transactions', authenticate, isSupport, async (req, res) => { const snap = await db.ref(PATH.TX).limitToLast(100).once('value'); res.json(snap.val() || {}); });
app.get('/api/admin/all-users', authenticate, isSupport, async (req, res) => { const snap = await db.ref(PATH.USERS).once('value'); res.json(snap.val() || {}); });

app.post('/api/admin/user/activate', authenticate, isSupport, async (req, res) => {
    try {
        const ph = normalizePhone(req.body.targetPhone);
        await db.ref(PATH.USERS + '/' + ph).update({ '065_status': 'ACTIVE' });
        await logEmpireAction(req, "USER_ACTIVATED", ph);
        res.json({ message: "OK" });
    } catch (e) { res.status(500).send("Error"); }
});

app.post('/api/v1/sup/security-lockdown', authenticate, isSupport, async (req, res) => {
    try {
        const ph = normalizePhone(req.body.targetPhone);
        const updates = {};
        if (req.body.block !== undefined) updates['065_status'] = req.body.block ? 'BLOCKED' : 'ACTIVE';
        if (req.body.reviewer !== undefined) updates['132_isReviewer'] = req.body.reviewer;
        await db.ref(PATH.USERS + '/' + ph).update(updates);
        await logEmpireAction(req, "SECURITY_LOCKDOWN", ph, updates);
        res.json({ message: "OK" });
    } catch (e) { res.status(500).send("Lockdown Error"); }
});

app.post('/api/admin/user/delta-balance', authenticate, isMaster, async (req, res) => {
    try {
        const { targetPhone, deltaUSD, reason } = req.body;
        const ph = normalizePhone(targetPhone);
        const uRef = db.ref(PATH.USERS + '/' + ph);
        const current = (await uRef.once('value')).val();
        if (!current) return res.status(404).send("User not found");
        const oldBal = parseFloat(current['064_balanceUSD']) || 0;
        const newBal = oldBal + parseFloat(deltaUSD);
        await uRef.update({ '064_balanceUSD': newBal });
        await logEmpireAction(req, "BALANCE_CORRECTION", ph, { oldBal, newBal, deltaUSD, reason });
        res.json({ message: "OK", newBalance: newBal });
    } catch (e) { res.status(500).send("Error"); }
});

app.post('/api/v1/queue/update-state', authenticate, isSupport, async (req, res) => {
    const { transactionId, status } = req.body;
    const txRef = db.ref(PATH.TX + '/' + transactionId);
    const txData = (await txRef.once('value')).val();
    if (status === 'APPROVED' && txData['080_status'] === 'PENDING') {
        const uRef = db.ref(PATH.USERS + '/' + txData['076_userId']);
        const oldBal = (await uRef.once('value')).val()['064_balanceUSD'] || 0;
        const isOut = txData['077_type'].toLowerCase().includes("withdraw");
        const nBal = isOut ? oldBal - txData['078_amountUSD'] : oldBal + txData['078_amountUSD'];
        const iRef = await getNextImperialRef();
        await uRef.update({ '064_balanceUSD': nBal });
        await txRef.update({ '080_status': 'APPROVED', '087_approvedBy': req.user.phoneNumber, '082_prevBalance': oldBal, '083_newBalance': nBal, '081_imperialRef': iRef, '095_approval_ts': new Date().toISOString() });
        await updateVerifiedLedger(txData['078_amountUSD'], isOut ? 'SUB' : 'ADD');
        await logEmpireAction(req, "TX_APPROVED", txData['076_userId'], { txId: transactionId, amount: txData['078_amountUSD'] });
    }
    res.json({ message: "OK" });
});

app.get('/api/v1/sup/meta-gate', async (req, res) => {
    try {
        const gateways = (await db.ref(PATH.GATEWAY).once('value')).val() || {};
        const bankList = Object.entries(gateways).map(([id, g]) => ({
            id, name: g['032_name'] || id.toUpperCase(), icon: g['038_iconUrl'] || "", ussd: g['033_ussd'] || "*220*", targetNumber: g['034_targetNumber'] || "", color: g['039_brandColor'] || "#222", mathLabel: g['035_mathLabel'] || "$1 = 11,000 SLSH", status: "ON"
        }));
        res.json({ category: { title: "DHIG / KALA BAX", banks: bankList } });
    } catch (e) { res.status(500).json({ message: "Gate Error" }); }
});

app.get('/api/balance', authenticate, async (req, res) => { const u = db ? (await db.ref(PATH.USERS + '/' + req.user.phoneNumber).once('value')).val() : null; res.json({ '064_balanceUSD': u ? u['064_balanceUSD'] : 0 }); });
app.get('/api/transactions', authenticate, async (req, res) => { const txs = Object.values((await db.ref(PATH.TX).orderByChild('076_userId').equalTo(req.user.phoneNumber).limitToLast(20).once('value')).val() || {}); res.json(txs.reverse()); });
app.get('/api/config', async (req, res) => res.json(db ? (await db.ref('config').once('value')).val() : {}));
app.post('/api/v1/sup/update-config', authenticate, isMaster, async (req, res) => { if (db) await db.ref('config').update(req.body); res.json({ message: "OK" }); });
app.post('/api/v1/sup/trust-device', authenticate, isMaster, async (req, res) => { if (!db) return res.status(503).json({ message: "Offline" }); const snap = await db.ref(PATH.DNA + '/059_pending_approval_devices/' + req.body.deviceId).once('value'); if (snap.val()) { await db.ref(PATH.DNA + '/058_trusted_devices/' + req.body.deviceId).set(snap.val()); await db.ref(PATH.DNA + '/059_pending_approval_devices/' + req.body.deviceId).remove(); res.json({ message: "OK" }); } else res.status(404).json({ message: "Device not found" }); });
app.get('/api/v1/sup/user-dna/:phone', authenticate, isSupport, async (req, res) => { if (!db) return res.json({}); const ph = normalizePhone(req.params.phone); const profile = (await db.ref(PATH.USERS + '/' + ph).once('value')).val(); const txs = Object.values((await db.ref(PATH.TX).orderByChild('076_userId').equalTo(ph).limitToLast(10).once('value')).val() || {}); res.json({ profile, transactions: txs.reverse() }); });
app.get('/api/admin/system/forensics', authenticate, isSupport, async (req, res) => { try { const snap = await db.ref(PATH.FORENSICS + '/103_global_execution_feed').limitToLast(100).once('value'); res.json(Object.values(snap.val() || {}).reverse()); } catch (e) { res.status(500).send("Error"); } });

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 v2.5.1 SUPREME Active.`));
