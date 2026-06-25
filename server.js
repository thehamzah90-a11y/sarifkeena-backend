const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = process.env.SECRET_KEY || 'YOUR_SECRET_KEY';

// Firebase Setup
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("Firebase Admin initialized successfully.");
    } catch (e) {
        console.error("Error parsing FIREBASE_SERVICE_ACCOUNT:", e);
    }
} else {
    console.warn("FIREBASE_SERVICE_ACCOUNT not found. Firestore will not work.");
}

const db = admin.firestore();

app.use(cors());
app.use(bodyParser.json());

// Middleware for JWT Verification
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
    if (req.user.phoneNumber === 'admin') next();
    else res.sendStatus(403);
};

// --- API ENDPOINTS ---

// Login & User Initialization
app.post('/api/login', async (req, res) => {
    const { phoneNumber, otp } = req.body;
    if (phoneNumber && (otp === '1234' || (phoneNumber === 'admin' && otp === 'admin'))) {
        try {
            const userRef = db.collection('users').doc(phoneNumber);
            const doc = await userRef.get();

            if (!doc.exists) {
                await userRef.set({ balance: 0.0, phoneNumber: phoneNumber });
            }

            const token = jwt.sign({ phoneNumber }, SECRET_KEY, { expiresIn: '24h' });
            res.json({ token });
        } catch (e) {
            res.status(500).json({ message: 'Database error', error: e.message });
        }
    } else {
        res.status(400).json({ message: 'Invalid phone or OTP' });
    }
});

// Get Balance
app.get('/api/balance', authenticateToken, async (req, res) => {
    try {
        const userDoc = await db.collection('users').doc(req.user.phoneNumber).get();
        res.json({ balance: userDoc.data()?.balance || 0.0 });
    } catch (e) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Get Transactions (User specific)
app.get('/api/transactions', authenticateToken, async (req, res) => {
    try {
        const snapshot = await db.collection('transactions')
            .where('userId', '==', req.user.phoneNumber)
            .orderBy('date', 'desc')
            .get();
        const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(transactions);
    } catch (e) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Transaction Requests (Unified for all 4 buttons)
app.post('/api/transaction/request', authenticateToken, async (req, res) => {
    const { type, amount, details } = req.body;
    const numAmount = parseFloat(amount);

    if (numAmount <= 0) return res.status(400).json({ message: 'Invalid amount' });

    try {
        const newTx = {
            userId: req.user.phoneNumber,
            type: type,
            amount: numAmount,
            details: details || {},
            date: new Date().toISOString(),
            status: 'PENDING'
        };

        const docRef = await db.collection('transactions').add(newTx);
        res.json({ message: 'Request submitted', id: docRef.id });
    } catch (e) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Admin: Get All Transactions
app.get('/api/admin/transactions', authenticateToken, isAdmin, async (req, res) => {
    try {
        const snapshot = await db.collection('transactions').orderBy('date', 'desc').get();
        const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(transactions);
    } catch (e) {
        res.status(500).json({ message: 'Database error' });
    }
});

// Admin: Update Transaction Status (Approve/Reject)
app.post('/api/admin/transaction/status', authenticateToken, isAdmin, async (req, res) => {
    const { transactionId, status } = req.body;
    try {
        const txRef = db.collection('transactions').doc(transactionId);
        const txDoc = await txRef.get();

        if (!txDoc.exists) return res.status(404).json({ message: 'Transaction not found' });
        if (txDoc.data().status !== 'PENDING') return res.status(400).json({ message: 'Transaction already processed' });

        const txData = txDoc.data();
        const userRef = db.collection('users').doc(txData.userId);

        await db.runTransaction(async (t) => {
            if (status === 'APPROVED') {
                const userDoc = await t.get(userRef);
                let currentBalance = userDoc.data().balance || 0;

                // Logic:
                // Deposits (Intake): "Kasoo Dir Zaad", "Kala Soo Bax 1xBet" -> ADD to balance
                // Withdrawals (Outtake): "Ku Shubo 1xBet", "Ku Dirso Zaadkaaga" -> SUBTRACT from balance
                if (txData.type === "Kasoo Dir Zaad" || txData.type === "Kala Soo Bax 1xBet") {
                    t.update(userRef, { balance: currentBalance + txData.amount });
                } else if (txData.type === "Ku Shubo 1xBet" || txData.type === "Ku Dirso Zaadkaaga") {
                    if (currentBalance < txData.amount) throw new Error("Insufficient balance");
                    t.update(userRef, { balance: currentBalance - txData.amount });
                }
            }
            t.update(txRef, { status: status });
        });

        res.json({ message: `Transaction ${status.toLowerCase()}` });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// App Configuration
app.get('/api/config', async (req, res) => {
    try {
        const configDoc = await db.collection('config').doc('app').get();
        res.json(configDoc.data() || { whatsapp: "+252...", instructions: "Default instructions" });
    } catch (e) {
        res.status(500).json({ message: 'Error fetching config' });
    }
});

app.post('/api/admin/config', authenticateToken, isAdmin, async (req, res) => {
    try {
        await db.collection('config').doc('app').set(req.body, { merge: true });
        res.json({ message: 'Config updated' });
    } catch (e) {
        res.status(500).json({ message: 'Error updating config' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
