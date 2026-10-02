// lib/cloudinary-sign.js  (a helper, NOT in /api, so it doesn't count as a Vercel function)
//
// Beat audio is stored on Cloudinary as delivery type "authenticated": the raw
// URL does nothing without a valid signature, and only this server (which holds
// CLOUDINARY_API_SECRET) can create signatures.
//   - PREVIEW url: a signed URL for a 30s / 128kbps mp3 clip. The transformation
//     is part of the signature, so nobody can edit it to get the full track.
//     Safe to store on the beat doc and show to everyone.
//   - FULL url: signed original file. Only handed out to the beat's producer,
//     admin, or someone with a completed order for the beat.
import { createHash } from 'crypto';

export const PREVIEW_TRANSFORM = 'so_0,du_30,br_128k';

function urlSignature(toSign, secret) {
  return createHash('sha1')
    .update(toSign + secret)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .slice(0, 8);
}

// Reads a stored audioUrl such as
//   https://res.cloudinary.com/<cloud>/video/(upload|authenticated)/[s--SIG--/][v123/]beats/123_name.wav
// and returns { cloudName, type, publicId, ext } (or null if it doesn't look right).
export function parseAudioUrl(url) {
  const m = String(url || '').match(
    /^https:\/\/res\.cloudinary\.com\/([^/]+)\/video\/(upload|authenticated)\/(.+)$/
  );
  if (!m) return null;
  const segs = m[3].split('/');
  const i = segs.indexOf('beats');
  if (i === -1) return null;
  const rest = segs.slice(i).join('/'); // beats/123_name.wav
  const dot = rest.lastIndexOf('.');
  const publicId = decodeURIComponent(dot > -1 ? rest.slice(0, dot) : rest);
  const ext = dot > -1 ? rest.slice(dot + 1) : 'mp3';
  return { cloudName: m[1], type: m[2], publicId, ext };
}

function signedUrl({ cloudName, publicId, ext, transformation }, secret) {
  const path = [transformation, `${publicId}.${ext}`].filter(Boolean).join('/');
  return `https://res.cloudinary.com/${cloudName}/video/authenticated/s--${urlSignature(path, secret)}--/${path}`;
}

export function signedPreviewUrl(a, secret) {
  return signedUrl({ ...a, ext: 'mp3', transformation: PREVIEW_TRANSFORM }, secret);
}

export function signedFullUrl(a, secret) {
  return signedUrl({ ...a, transformation: '' }, secret);
}

// What we store in Firestore as audioUrl: the plain authenticated URL.
// It is useless without a signature, so it's fine that beat docs are public.
export function plainAuthenticatedUrl({ cloudName, publicId, ext }) {
  return `https://res.cloudinary.com/${cloudName}/video/authenticated/${publicId}.${ext}`;
}

// Link to give a paying buyer: signed full file, or the stored URL for any
// legacy beat that hasn't been secured yet.
export function buyerDownloadUrl(beat, secret) {
  const a = parseAudioUrl(beat.audioUrl);
  if (a && a.type === 'authenticated' && secret) return signedFullUrl(a, secret);
  return beat.audioUrl;
}
