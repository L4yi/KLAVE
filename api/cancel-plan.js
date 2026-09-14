// api/cancel-plan.js — cancels the caller's own recurring Paystack
// subscription. Reads the subscription code/token from their own
// Firestore doc (never trusts a client-supplied code — that would let
// someone cancel a stranger's subscription by guessing/reusing a code).
//
// IMPORTANT: this no longer downgrades the tier immediately. The
// subscriber already paid for their current billing period, so they keep
// paid-tier access until that period actually ends. This function:
//   1. Cancels the subscription on Paystack (stops future billing)
//   2. Looks up the current period's end date from Paystack
//   3. Marks the user doc with pendingCancellation + accessUntil
//   4. Emails a "cancelled — access continues until X" confirmation
// The actual downgrade happens later, via /api/check-expiring-subs.js
// (a daily Vercel Cron job — see vercel.json), which finds anyone whose
// accessUntil date has arrived and downgrades them then.
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

async function sendCancelConfirmationEmail(toEmail, accessUntilDate) {
  if (!toEmail || !process.env.RESEND_API_KEY) return;
  const dateStr = new Date(accessUntilDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'KLAVE <onboarding@resend.dev>', // swap once a verified domain exists
        to: toEmail,
        subject: 'Your KLAVE subscription has been cancelled',
        html: `
          <div style="font-family:sans-serif;background:#0a0a0a;color:#ffffff;padding:32px;border-radius:12px;">
            <div style="font-size:20px;font-weight:800;letter-spacing:2px;margin-bottom:2px;">KLAVE</div>
            <div style="font-size:11px;color:#888;letter-spacing:1px;margin-bottom:24px;">// sorry to see you go.</div>
            <p>Your subscription has been cancelled — you won't be charged again.</p>
            <p>Your paid-tier access stays active until <b>${dateStr}</b>, then your account moves to the Free plan automatically.</p>
            <p style="margin-top:24px;color:#aaa;">Changed your mind? You can resubscribe anytime from Settings &gt; Manage Plan.</p>
          </div>
        `,
      }),
    });
  } catch (e) {
    console.error('Cancel confirmation email failed:', e);
  }
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

    const userData = userSnap.data();
    const { subscriptionCode, subscriptionToken } = userData;
    if (!subscriptionCode || !subscriptionToken) {
      return res.status(400).json({ error: 'No active subscription on file' });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;

    // -- Look up the current period's end date BEFORE disabling, so we know
    // exactly how long to honor their already-paid-for access. --
    const subDetailRes = await fetch(`https://api.paystack.co/subscription/${encodeURIComponent(subscriptionCode)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const subDetailData = await subDetailRes.json();
    const accessUntil = subDetailData?.data?.next_payment_date || null;

    // -- Cancel on Paystack (stops all future billing) --
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

    // -- Mark pending cancellation. Tier stays as-is until the daily cron
    // job (check-expiring-subs.js) finds accessUntil has arrived. --
    const update = {
      pendingCancellation: true,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (accessUntil) {
      update.accessUntil = accessUntil;
    } else {
      // Fallback if Paystack didn't return a next_payment_date for some
      // reason — better to downgrade a bit late than never downgrade at
      // all. Defaults to 30 days out.
      const fallback = new Date();
      fallback.setDate(fallback.getDate() + 30);
      update.accessUntil = fallback.toISOString();
    }
    await userRef.set(update, { merge: true });

    await sendCancelConfirmationEmail(userData.email, update.accessUntil);

    return res.status(200).json({ success: true, accessUntil: update.accessUntil });
  } catch (e) {
    console.error('Cancel plan error:', e);
    return res.status(500).json({ error: e.message });
  }
}
