// api/upload-avatar.js — issues a signed Cloudinary upload payload for
// profile avatar photos. Split out from api/upload.js because beat
// uploads are producer-only, but ANY signed-in user (buyer or
// producer) needs to be able to set a profile photo.
//
// Same signed-upload pattern as api/upload.js: this endpoint never
// touches the actual image bytes, it just returns a signature. The
// client uploads the file straight to Cloudinary from the browser.
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

  try {
    // -- AUTH CHECK (no role gate — any signed-in user can set an avatar) --
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;

    if (!idToken) {
      return res.status(401).json({ error: 'Missing auth token' });
    }

    try {
      await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid auth token' });
    }

    // -- CLOUDINARY SIGNING LOGIC (mirrors upload.js) --
    const { fileName } = req.body || {};

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({ error: 'Cloudinary env vars missing' });
    }

    const safeName = (fileName || 'avatar')
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 60);

    // Separate folder from beats/ so avatars and beat audio never collide
    // and can be moderated/cleaned up independently.
    const publicId = `avatars/${Date.now()}_${safeName}`;

    const timestamp = Math.round(Date.now() / 1000);
    const str = `public_id=${publicId}&timestamp=${timestamp}&upload_preset=klave_beats${apiSecret}`;

    const { createHash } = await import('crypto');
    const signature = createHash('sha1').update(str).digest('hex');

    return res.status(200).json({
      cloudName,
      apiKey,
      timestamp,
      signature,
      publicId,
      uploadPreset: 'klave_beats',
    });

  } catch (e) {
    console.error('Avatar sign error:', e);
    return res.status(500).json({ error: e.message });
  }
}
