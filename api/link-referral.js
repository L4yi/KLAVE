// /api/link-referral.js
// Vercel serverless function — links a brand-new signup to whoever referred
// them, and bumps the referrer's count. This USED TO happen as raw client-side
// Firestore writes, but the security rules correctly reject that: a new user
// can't write 'referredBy' on their own doc (not verified yet, field isn't
// allow-listed), and definitely can't increment a DIFFERENT user's
// referralCount. Moving this server-side (Admin SDK, bypasses rules) is the
// same pattern already used for orders/verify-payment.js — the client
// proposes an action, trusted server code decides if it's valid and performs
// the cross-document write.
//
// Auth: requires the NEW user's own Firebase ID token, so this can only ever
// affect the account that's actually calling it — never an arbitrary uid
// passed in the body.

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!idToken) {
    return res.status(401).json({ error: 'Missing auth token' });
  }

  let newUserUid;
  try {
    const decoded = await getAuth().verifyIdToken(idToken);
    newUserUid = decoded.uid;
  } catch (e) {
    return res.status(401).json({ error: 'Invalid auth token' });
  }

  const { pendingRef } = req.body || {};
  if (!pendingRef) {
    return res.status(200).json({ linked: false, reason: 'no pending code' });
  }

  try {
    const newUserSnap = await db.collection('users').doc(newUserUid).get();
    if (!newUserSnap.exists) {
      return res.status(404).json({ error: 'User not found' });
    }
    const newUsername = newUserSnap.data().username;
    const code = pendingRef.trim().toLowerCase();

    // Can't refer yourself.
    if (code === newUsername) {
      return res.status(200).json({ linked: false, reason: 'self-referral' });
    }

    // Already linked? Don't double-count if this ever gets called twice.
    if (newUserSnap.data().referredBy) {
      return res.status(200).json({ linked: false, reason: 'already linked' });
    }

    // Check real KLAVE users first
    const userQuery = await db.collection('users').where('username', '==', code).limit(1).get();
    if (!userQuery.empty) {
      const referrerDoc = userQuery.docs[0];
      await db.collection('users').doc(newUserUid).update({ referredBy: code });
      await referrerDoc.ref.update({ referralCount: FieldValue.increment(1) });
      return res.status(200).json({ linked: true, referrerType: 'users' });
    }

    // Fall back to the waitlist (non-user ambassadors)
    const waitlistQuery = await db.collection('waitlist').where('code', '==', code).limit(1).get();
    if (!waitlistQuery.empty) {
      const referrerDoc = waitlistQuery.docs[0];
      await db.collection('users').doc(newUserUid).update({ referredBy: code });
      await referrerDoc.ref.update({ referralCount: FieldValue.increment(1) });
      return res.status(200).json({ linked: true, referrerType: 'waitlist' });
    }

    return res.status(200).json({ linked: false, reason: 'code not found' });
  } catch (err) {
    console.error('link-referral failed:', err);
    return res.status(500).json({ error: 'Could not link referral' });
  }
}
