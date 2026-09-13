// api/upload.js — verifies the caller is a signed-in producer, then
// issues a signed Cloudinary upload payload.
//
// IMPORTANT: this function no longer receives the audio file itself.
// It used to accept the whole file as a base64 string in the request body,
// but Vercel serverless functions have a hard platform-level request body
// limit of 4.5MB (NOT configurable via bodyParser.sizeLimit — that setting
// only controls Next.js's own parser, which never even gets the chance to
// run before Vercel's platform limit rejects the request). Since base64
// adds ~33% overhead, that meant any audio file over roughly 3MB was
// silently failing with a 413 error, even though the UI advertised a
// 50MB limit.
//
// The fix: this endpoint only computes and returns a Cloudinary upload
// signature (a small JSON response). The client then uploads the actual
// file directly to Cloudinary from the browser, bypassing our backend
// entirely for the large payload.
//
// NEW: before signing anything, this now verifies the caller's Firebase
// ID token and checks their Firestore role is 'producer'. This closes
// the gap where a buyer account (or anyone with devtools open) could
// call this endpoint directly and get a valid signed upload payload
// even with the upload button hidden in the UI — the Firestore rules
// change on the `beats` collection stops the write, but this stops the
// wasted Cloudinary upload before it even happens.
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel env vars store literal \n, so they need converting back
      // to real newlines for the PEM key to parse.
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    // -- AUTH + ROLE CHECK --
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;

    if (!idToken) {
      return res.status(401).json({ error: 'Missing auth token' });
    }

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid auth token' });
    }

    const userDoc = await admin.firestore().collection('users').doc(decoded.uid).get();
    if (!userDoc.exists || userDoc.data().role !== 'producer') {
      return res.status(403).json({ error: 'Only producer accounts can upload beats' });
    }

    // -- EXISTING CLOUDINARY SIGNING LOGIC --
    const { fileName } = req.body || {};

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({ error: 'Cloudinary env vars missing' });
    }

    // Sanitize filename — remove extension, slashes, special chars
    const safeName = (fileName || 'beat')
      .replace(/\.[^/.]+$/, '')        // remove extension
      .replace(/[^a-zA-Z0-9_-]/g, '_') // replace special chars/slashes with underscore
      .slice(0, 60);                   // limit length

    const publicId = `beats/${Date.now()}_${safeName}`;

    // Sign the upload. Only public_id, timestamp, and upload_preset are
    // part of the signature — api_key and the file itself are never
    // included in the signed string, matching what Cloudinary expects.
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
    console.error('Sign error:', e);
    return res.status(500).json({ error: e.message });
  }
}
