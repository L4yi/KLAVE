// api/verify-plan-payment.js — verifies a Paystack transaction for a plan
// upgrade (pro7 / pro25 / lifetime), then writes the new tier onto the
// user's Firestore doc via the Admin SDK. The client can never set `tier`
// itself — firestore.rules has no client-facing rule for it — so this is
// the only legitimate path a user's tier ever changes after signup.
//
// For recurring plans (pro7/pro25), this also looks up the subscription
// that Paystack auto-created on first charge and stores its code + email
// token, so /api/cancel-plan.js can cancel it later.
//
// CAVEAT: this only handles the *first* charge. Recurring renewal charges,
// failed-payment downgrades, and subscription-cancelled events all happen
// on Paystack's side automatically, but this app does not yet listen for
// those via a webhook — so if a renewal fails or a subscriber cancels
// directly on Paystack's end, KLAVE's Firestore `tier` field won't know
// until you add a webhook handler for charge.success / subscription.disable
// events. Fine for launch, but flag this before scaling paid plans.
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

  const { reference, tier } = req.body || {};
  if (!reference || !['pro7', 'pro25', 'lifetime'].includes(tier)) {
    return res.status(400).json({ error: 'Missing or invalid reference/tier' });
  }

  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) return res.status(500).json({ error: 'PAYSTACK_SECRET_KEY missing' });

    // -- VERIFY THE TRANSACTION WITH PAYSTACK (source of truth, never trust the client) --
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const verifyData = await verifyRes.json();

    if (!verifyData.status || verifyData.data.status !== 'success') {
      return res.status(400).json({ error: 'Payment not verified as successful' });
    }

    const meta = verifyData.data.metadata || {};
    // The uid on the transaction metadata must match the authenticated
    // caller — otherwise someone could replay a valid reference from a
    // different account to upgrade their own tier for free.
    if (meta.uid !== decoded.uid || meta.tier !== tier) {
      return res.status(403).json({ error: 'Payment does not match this account/tier' });
    }

    let subscriptionCode = null;
    let subscriptionToken = null;

    if (tier === 'pro7' || tier === 'pro25') {
      // Recurring plan — Paystack auto-creates a subscription on first
      // charge against a plan. Look it up via the customer code so we can
      // store it for later cancellation.
      const customerCode = verifyData.data.customer && verifyData.data.customer.customer_code;
      if (customerCode) {
        const subRes = await fetch(`https://api.paystack.co/subscription?customer=${encodeURIComponent(customerCode)}`, {
          headers: { Authorization: `Bearer ${secretKey}` },
        });
        const subData = await subRes.json();
        if (subData.status && subData.data && subData.data.length) {
          // Most recent subscription for this customer.
          const sub = subData.data[0];
          subscriptionCode = sub.subscription_code;
          subscriptionToken = sub.email_token;
        }
      }
    }

    // -- GRANT THE TIER (Admin SDK bypasses firestore.rules, which is
    // correct here — this is the one server-verified path allowed to
    // change it) --
    const userRef = admin.firestore().collection('users').doc(decoded.uid);
    const update = { tier, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
    if (subscriptionCode) update.subscriptionCode = subscriptionCode;
    if (subscriptionToken) update.subscriptionToken = subscriptionToken;
    await userRef.set(update, { merge: true });

    return res.status(200).json({ success: true, tier, subscriptionCode });
  } catch (e) {
    console.error('Plan verification error:', e);
    return res.status(500).json({ error: e.message });
  }
}
