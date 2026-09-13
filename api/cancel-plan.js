// api/cancel-plan.js — cancels the caller's own recurring Paystack
// subscription. Reads the subscription code/token from their own
// Firestore doc (never trusts a client-supplied code — that would let
// someone cancel a stranger's subscription by guessing/reusing a code).
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;
  if (!idToken) return res.status(401).json({ error: 'Missing auth token' });

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid auth token' });
  }

  try {
    const userRef = admin.firestore().collection('users').doc(decoded.uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ error: 'User not found' });

    const { subscriptionCode, subscriptionToken } = userSnap.data();
    if (!subscriptionCode || !subscriptionToken) {
      return res.status(400).json({ error: 'No active subscription on file' });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    const cancelRes = await fetch('https://api.paystack.co/subscription/disable', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: subscriptionCode, token: subscriptionToken }),
    });
    const cancelData = await cancelRes.json();

    if (!cancelData.status) {
      return res.status(400).json({ error: cancelData.message || 'Cancellation failed' });
    }

    // NOTE: Paystack keeps access active until the current paid period
    // ends, then fires a subscription.not_renew / subscription.disable
    // webhook. Without a webhook handler wired up yet, the tier here
    // stays as-is until you manually downgrade it or add that webhook —
    // flagged in verify-plan-payment.js too.
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('Cancel plan error:', e);
    return res.status(500).json({ error: e.message });
  }
}
