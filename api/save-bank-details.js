// /api/save-bank-details.js
// Vercel serverless function — saves a KLAVE user's bank details for
// referral payouts. Like save-waitlist-bank.js, but for real users
// (identified by their own Firebase ID token instead of a waitlist code).
// This USED TO be a direct client-side Firestore write, but 'bankDetails'
// isn't on validUser()'s allow-listed fields — the rules correctly reject
// it. Moving it server-side (Admin SDK, bypasses rules) is the same pattern
// as everything else money-related in this app.

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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
    console.error('save-bank-details failed:', err);
    return res.status(500).json({ error: 'Could not save bank details' });
  }
}
