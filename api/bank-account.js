// /api/bank-account.js
// One endpoint (to stay under Vercel Hobby's 12-function limit):
//   { action: 'list' }
//   { action: 'resolve', accountNumber, bankCode }
//   { action: 'save', accountNumber, bankCode, bankName }   (needs auth header)
//
// Changes in this version:
//  - 'save' now writes bank details to users/{uid}/private/finance, which only
//    the owner and admin can read. Before, they sat on the users doc, which
//    every signed-in user can read.
//  - 'save' re-verifies the account with Paystack itself and stores the name
//    Paystack returns, instead of trusting an accountName sent by the browser.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
}

const db = getFirestore();
async function resolveWithPaystack(accountNumber, bankCode) {
  const psRes = await fetch(
    `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
    { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
  );
  return psRes.json();
}

async function getCaller(req) {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) return null;
  try {
    return await getAuth().verifyIdToken(idToken);
  } catch (e) {
    return null;
  }
}

// -- action: list --
async function handleList(req, res) {
  try {
    const psRes = await fetch('https://api.paystack.co/bank?country=nigeria&currency=NGN', {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });
    const psData = await psRes.json();
    if (!psData.status) throw new Error(psData.message || 'Paystack bank list request failed');
    const banks = psData.data.map((b) => ({ name: b.name, code: b.code }));
    return res.status(200).json({ banks });
  } catch (err) {
    console.error('bank-account (list) failed:', err);
    return res.status(500).json({ error: 'Could not load bank list' });
  }
}

// -- action: resolve --
async function handleResolve(req, res) {
  const { accountNumber, bankCode } = req.body || {};
  if (!accountNumber || !bankCode) {
    return res.status(400).json({ error: 'accountNumber and bankCode are required' });
  }
  try {
    const psData = await resolveWithPaystack(accountNumber, bankCode);
    if (!psData.status) {
      return res.status(400).json({ error: psData.message || 'Could not verify that account' });
    }
    return res.status(200).json({
      accountName: psData.data.account_name,
      accountNumber: psData.data.account_number,
    });
  } catch (err) {
    console.error('bank-account (resolve) failed:', err);
    return res.status(500).json({ error: 'Account verification failed' });
  }
}

// -- action: save --
async function handleSave(req, res) {
  const caller = await getCaller(req);
  if (!caller) return res.status(401).json({ error: 'Missing or invalid auth token' });
  const uid = caller.uid;

  const { accountNumber, bankCode, bankName } = req.body || {};
  if (typeof accountNumber !== 'string' || !/^\d{10}$/.test(accountNumber) || !bankCode) {
    return res.status(400).json({ error: 'A valid 10-digit account number and bank are required' });
  }

  try {
    // Never trust a name sent by the browser: use what Paystack says it is.
    const psData = await resolveWithPaystack(accountNumber, String(bankCode));
    if (!psData.status) {
      return res.status(400).json({ error: psData.message || 'Could not verify that account' });
    }

    // mergeFields replaces the whole bankDetails value, so an old
    // recipientCode from a previous account can't survive a change.
    await db.doc(`users/${uid}/private/finance`).set(
      {
        bankDetails: {
          accountNumber,
          bankCode: String(bankCode),
          bankName: String(bankName || '').slice(0, 80),
          accountName: psData.data.account_name,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { mergeFields: ['bankDetails', 'updatedAt'] }
    );

    // Remove any legacy copy from the publicly readable user doc.
    try {
      await db.collection('users').doc(uid).update({ bankDetails: FieldValue.delete() });
    } catch (e) {
      /* no legacy field / doc: fine */
    }

    return res.status(200).json({ success: true, accountName: psData.data.account_name });
  } catch (err) {
    console.error('bank-account (save) failed:', err);
    return res.status(500).json({ error: 'Could not save bank details' });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { action } = req.body || {};
  if (action === 'list') return handleList(req, res);
  if (action === 'resolve') return handleResolve(req, res);
  if (action === 'save') return handleSave(req, res);
  return res.status(400).json({ error: 'Unknown or missing action' });
}
