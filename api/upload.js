// api/upload.js
// Cloudinary signing + secure audio access. Actions (POST body):
//   (default)                 producers only: sign an upload. Beat audio is now
//                             uploaded as delivery type "authenticated", and the
//                             response includes a signed 30s previewUrl.
//   { action:'full', beatId } any signed-in user: returns a signed FULL-quality
//                             url IF they are the beat's producer, admin, or have
//                             a completed order for it.
//   { action:'secure-existing' }  admin only, one-time: converts already-uploaded
//                             public beats to authenticated and adds previewUrl.
//
// The audio file itself never passes through this function (Vercel's 4.5MB body
// limit); the browser uploads straight to Cloudinary with the signature below.
import admin from 'firebase-admin';
import { createHash } from 'crypto';
import {
  parseAudioUrl,
  signedPreviewUrl,
  signedFullUrl,
  plainAuthenticatedUrl,
} from '../lib/cloudinary-sign.js';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();
const ADMIN_UID = 'SlUg15UFENNJglFw9KfRqQNWdkx2';

const sha1hex = (s) => createHash('sha1').update(s).digest('hex');

async function handleFull(res, decoded, body, creds) {
  const { beatId } = body;
  if (!beatId || typeof beatId !== 'string') {
    return res.status(400).json({ error: 'beatId is required' });
  }
  const snap = await db.collection('beats').doc(beatId).get();
  if (!snap.exists) return res.status(404).json({ error: 'Beat not found' });
  const beat = snap.data();

  let allowed = decoded.uid === ADMIN_UID || decoded.admin === true || beat.producerId === decoded.uid;
  if (!allowed) {
    const q = await db
      .collection('orders')
      .where('buyerId', '==', decoded.uid)
      .where('beatId', '==', beatId)
      .limit(1)
      .get();
    allowed = !q.empty;
  }
  if (!allowed) return res.status(403).json({ error: 'You do not have access to this beat' });

  const a = parseAudioUrl(beat.audioUrl);
  if (!a) return res.status(400).json({ error: 'Beat has no valid audio file' });
  // Legacy (not yet secured) beats are still public, so just return their URL.
  if (a.type !== 'authenticated') return res.status(200).json({ url: beat.audioUrl });
  return res.status(200).json({ url: signedFullUrl(a, creds.apiSecret) });
}

// Moves one existing public asset to delivery type "authenticated".
async function makeAuthenticated(a, creds) {
  const timestamp = Math.round(Date.now() / 1000);
  const params = {
    from_public_id: a.publicId,
    timestamp: String(timestamp),
    to_public_id: a.publicId,
    to_type: 'authenticated',
    type: 'upload',
  };
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  const body = new URLSearchParams({
    ...params,
    api_key: creds.apiKey,
    signature: sha1hex(toSign + creds.apiSecret),
  });
  const r = await fetch(`https://api.cloudinary.com/v1_1/${creds.cloudName}/video/rename`, {
    method: 'POST',
    body,
  });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error?.message || `Cloudinary rename failed (${r.status})`);
}

async function handleSecureExisting(res, decoded, creds) {
  if (decoded.uid !== ADMIN_UID && decoded.admin !== true) {
    return res.status(403).json({ error: 'Admin only' });
  }
  const snap = await db.collection('beats').get();
  const report = [];
  for (const doc of snap.docs) {
    const beat = doc.data();
    const a = parseAudioUrl(beat.audioUrl);
    if (!a) continue;
    try {
      if (a.type === 'upload') await makeAuthenticated(a, creds);
      const aa = { ...a, type: 'authenticated' };
      await doc.ref.update({
        audioUrl: plainAuthenticatedUrl(aa),
        previewUrl: signedPreviewUrl(aa, creds.apiSecret),
      });
      report.push({ id: doc.id, title: beat.title || null, status: a.type === 'upload' ? 'secured' : 'preview-added' });
    } catch (e) {
      report.push({ id: doc.id, title: beat.title || null, status: 'failed', error: String(e.message || e) });
    }
  }
  return res.status(200).json({
    total: report.length,
    secured: report.filter((r) => r.status !== 'failed').length,
    failed: report.filter((r) => r.status === 'failed'),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    // -- AUTH --
    const authHeader = req.headers.authorization || '';
    const idToken = authHeader.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : null;
    if (!idToken) return res.status(401).json({ error: 'Missing auth token' });

    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid auth token' });
    }

    const creds = {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
    };
    if (!creds.cloudName || !creds.apiKey || !creds.apiSecret) {
      return res.status(500).json({ error: 'Cloudinary env vars missing' });
    }

    const body = req.body || {};
    if (body.action === 'full') return await handleFull(res, decoded, body, creds);
    if (body.action === 'secure-existing') return await handleSecureExisting(res, decoded, creds);

    // -- DEFAULT: sign an upload (producers only) --
    const userDoc = await db.collection('users').doc(decoded.uid).get();
    if (!userDoc.exists || userDoc.data().role !== 'producer') {
      return res.status(403).json({ error: 'Only producer accounts can upload beats' });
    }

    const { fileName, kind } = body;
    const safeName = (fileName || 'beat')
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 60);

    const isCover = kind === 'cover';
    const folder = isCover ? 'covers' : 'beats';
    const publicId = `${folder}/${Date.now()}_${safeName}`;
    const timestamp = Math.round(Date.now() / 1000);

    // Signed params must be alphabetical. Beat audio adds type=authenticated;
    // covers stay public (they're shown to everyone anyway).
    const str = isCover
      ? `public_id=${publicId}&timestamp=${timestamp}&upload_preset=klave_beats${creds.apiSecret}`
      : `public_id=${publicId}&timestamp=${timestamp}&type=authenticated&upload_preset=klave_beats${creds.apiSecret}`;
    const signature = sha1hex(str);

    const out = {
      cloudName: creds.cloudName,
      apiKey: creds.apiKey,
      timestamp,
      signature,
      publicId,
      uploadPreset: 'klave_beats',
    };
    if (!isCover) {
      out.type = 'authenticated';
      // Deterministic, so we can sign the preview URL before the upload finishes.
      out.previewUrl = signedPreviewUrl(
        { cloudName: creds.cloudName, publicId, ext: 'mp3' },
        creds.apiSecret
      );
    }
    return res.status(200).json(out);
  } catch (e) {
    console.error('upload.js error:', e);
    return res.status(500).json({ error: e.message });
  }
}
