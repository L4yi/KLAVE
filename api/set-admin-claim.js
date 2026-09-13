// /api/set-admin-claim.js
// ONE-TIME SETUP ENDPOINT — run this once, then delete this file from your repo.
//
// This gives your Firebase account a real, server-verified "admin: true" custom
// claim, instead of relying only on the client checking your UID against a
// hardcoded string. Firestore security rules can then check
// request.auth.token.admin == true, which a user can NEVER fake from the
// browser — unlike a client-side isAdmin() function.
//
// Protected by ADMIN_SETUP_SECRET so a stranger can't call this and grant
// themselves admin. It also only ever touches YOUR already-known UID — it
// can't be used to make an arbitrary UID an admin, even with the secret.

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY
        .trim()
        .replace(/^"|"$/g, '')
        .replace(/\\n/g, '\n'),
    }),
  });
}

const ADMIN_UID = 'SlUg15UFENNJglFw9KfRqQNWdkx2'; // your account — hardcoded on purpose, not from the request

export default async function handler(req, res) {
  const secret = req.query.secret;

  if (!secret || secret !== process.env.ADMIN_SETUP_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    await getAuth().setCustomUserClaims(ADMIN_UID, { admin: true });
    return res.status(200).json({
      success: true,
      message: 'Admin claim set. Sign out and back in on the app, then you can delete this file.',
    });
  } catch (err) {
    console.error('Failed to set admin claim:', err);
    return res.status(500).json({ error: err.message });
  }
}
