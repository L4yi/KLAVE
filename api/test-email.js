// api/test-email.js — THROWAWAY endpoint for testing Resend delivery only.
// Sends the exact same "download ready" email as verify-payment.js, but
// with fake beat data and no Paystack/payment involved at all — no money
// moves, no order gets written to Firestore.
//
// DELETE THIS FILE once the email is confirmed working. It's admin-gated,
// but there's no reason to leave a free-to-call email-sending endpoint
// sitting in a shipped app longer than it needs to.
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

const ADMIN_UID = 'SlUg15UFENNJglFw9KfRqQNWdkx2';

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
  if (decoded.uid !== ADMIN_UID) {
    return res.status(403).json({ error: 'Admin only' });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY not set in Vercel env vars' });
  }

  const toEmail = decoded.email; // sends to your own admin email — the only address the sandbox sender can reach

  const fakeBeat = {
    title: 'TEST BEAT — Ghost Notes',
    prod: 'North',
    audioUrl: 'https://example.com/fake-download-link.mp3',
  };

  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'KLAVE <onboarding@resend.dev>',
        to: toEmail,
        subject: `[TEST] Your beat is ready — ${fakeBeat.title}`,
        html: `
          <div style="font-family:sans-serif;background:#0a0a0a;color:#ffffff;padding:32px;border-radius:12px;">
            <div style="font-size:20px;font-weight:800;letter-spacing:2px;margin-bottom:2px;">KLAVE</div>
            <div style="font-size:11px;color:#888;letter-spacing:1px;margin-bottom:24px;">// this is a TEST email, no real purchase happened.</div>
            <h2 style="margin:0 0 4px;">${fakeBeat.title}</h2>
            <p style="color:#aaa;margin:0 0 4px;">prod. ${fakeBeat.prod}</p>
            <p style="color:#aaa;margin:0 0 20px;">License: Standard (TEST)</p>
            <a href="${fakeBeat.audioUrl}" style="display:inline-block;background:#3B5BFF;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;">Download Your Beat</a>
            <p style="color:#555;font-size:11px;margin-top:28px;">This was sent by /api/test-email.js — no order was created.</p>
          </div>
        `,
      }),
    });

    const emailData = await emailRes.json();

    if (!emailRes.ok) {
      return res.status(500).json({ error: 'Resend rejected the request', details: emailData });
    }

    return res.status(200).json({ success: true, sentTo: toEmail, resendResponse: emailData });
  } catch (e) {
    console.error('Test email error:', e);
    return res.status(500).json({ error: e.message });
  }
}
