// /api/bank-account.js
// Vercel serverless function — merged from list-banks.js, resolve-account.js,
// and save-bank-details.js into one endpoint to stay under Vercel's Hobby
// plan limit of 12 serverless functions per deployment. Behavior of each
// action is unchanged from the original files; only the routing is new.
//
// Call with POST and an `action` field of 'list', 'resolve', or 'save':
//   { action: 'list' }
//   { action: 'resolve', accountNumber, bankCode }
//   { action: 'save', accountNumber, bankCode, bankName, accountName }  (needs auth header)

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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

// -- action: list --
// Proxies Paystack's bank list so the frontend never needs the secret key.
// Used to populate the bank dropdown in the ambassador bank-details form.
async function handleList(req, res) {
  try {
    const psRes = await fetch('https://api.paystack.co/bank?country=nigeria&currency=NGN', {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    });
    const psData = await psRes.json();

    if (!psData.status) {
      throw new Error(psData.message || 'Paystack bank list request failed');
    }

    // Only send what the dropdown needs — name + code.
    const banks = psData.data.map(b => ({ name: b.name, code: b.code }));
    return res.status(200).json({ banks });
  } catch (err) {
    console.error('bank-account (list) failed:', err);
    return res.status(500).json({ error: 'Could not load bank list' });
  }
}

// -- action: resolve --
// Verifies a bank account number + bank code actually belongs to a real
// account, and returns the account holder's name so the ambassador can
// confirm it's theirs before it's saved. Never trust an account number
// without this check — a typo'd digit sends someone else's commission to
// a stranger.
async function handleResolve(req, res) {
  const { accountNumber, bankCode } = req.body || {};
  if (!accountNumber || !bankCode) {
    return res.status(400).json({ error: 'accountNumber and bankCode are required' });
  }

  try {
    const psRes = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
      { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` } }
    );
    const psData = await psRes.json();

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
// Saves a KLAVE user's bank details for referral payouts. This is
// server-side (Admin SDK, bypasses rules) because 'bankDetails' isn't on
// validUser()'s allow-listed fields — same pattern as everything else
// money-related in this app.
async function handleSave(req, res) {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  let uid;
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch (e) {
    return res.status(401).json({ error: 'Invalid auth token' });
  }

  const { accountNumber, bankCode, bankName, accountName } = req.body || {};
  if (!accountNumber || !bankCode || !accountName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    await db.collection('users').doc(uid).update({
      bankDetails: { accountNumber, bankCode, bankName, accountName },
    });
    return res.status(200).json({ success: true });
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
