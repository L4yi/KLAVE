// api/check-expiring-subs.js — runs once a day via Vercel Cron (see
// vercel.json). Finds every user who cancelled their subscription
// (pendingCancellation: true) whose paid-through date (accessUntil) has
// now arrived, downgrades them to Free, and emails them a "your
// subscription ended, renew here" message.
//
// This is what actually closes the gap: cancel-plan.js no longer
// downgrades immediately, it just records accessUntil — this job is what
// makes that date actually mean something.
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

async function sendRenewalEmail(toEmail) {
  if (!toEmail || !process.env.RESEND_API_KEY) return;
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
        subject: 'Your KLAVE subscription has ended',
        html: `
          <div style="font-family:sans-serif;background:#0a0a0a;color:#ffffff;padding:32px;border-radius:12px;">
            <div style="font-size:20px;font-weight:800;letter-spacing:2px;margin-bottom:2px;">KLAVE</div>
            <div style="font-size:11px;color:#888;letter-spacing:1px;margin-bottom:24px;">// your paid access has ended.</div>
            <p>Your subscription's paid period is over, so your account has moved to the Free plan.</p>
            <p style="margin-top:16px;">Want your lower royalty rate and unlimited uploads back? You can resubscribe anytime from Settings &gt; Manage Plan.</p>
          </div>
        `,
      }),
    });
  } catch (e) {
    console.error('Renewal email failed for', toEmail, e);
  }
}

export default async function handler(req, res) {
  // Vercel Cron sends a GET request with this header automatically when
  // CRON_SECRET is set in your env vars — verifying it stops anyone else
  // from hitting this endpoint and mass-downgrading your subscribers.
  const authHeader = req.headers.authorization || '';
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = admin.firestore();
    const now = new Date();

    const pendingSnap = await db.collection('users').where('pendingCancellation', '==', true).get();

    let downgraded = 0;
    const errors = [];

    for (const doc of pendingSnap.docs) {
      const data = doc.data();
      const accessUntil = data.accessUntil ? new Date(data.accessUntil) : null;

      if (!accessUntil || accessUntil > now) continue; // not due yet

      try {
        await doc.ref.set({
          tier: 'free',
          pendingCancellation: admin.firestore.FieldValue.delete(),
          accessUntil: admin.firestore.FieldValue.delete(),
          subscriptionCode: admin.firestore.FieldValue.delete(),
          subscriptionToken: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        await sendRenewalEmail(data.email);
        downgraded++;
      } catch (e) {
        console.error('Failed to downgrade', doc.id, e);
        errors.push(doc.id);
      }
    }

    return res.status(200).json({ checked: pendingSnap.size, downgraded, errors });
  } catch (e) {
    console.error('check-expiring-subs error:', e);
    return res.status(500).json({ error: e.message });
  }
}
