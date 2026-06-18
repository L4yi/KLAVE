// api/upload.js — Cloudinary upload proxy
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { file, fileName } = req.body;

    if (!file) return res.status(400).json({ error: 'No file provided' });

    // Upload base64 file to Cloudinary
    const result = await cloudinary.uploader.upload(file, {
      resource_type: 'auto',
      upload_preset: 'klave_beats',
      public_id: `beats/${Date.now()}_${fileName || 'beat'}`,
      overwrite: false,
    });

    res.status(200).json({
      secure_url: result.secure_url,
      public_id: result.public_id,
      duration: result.duration || 0,
      format: result.format,
      bytes: result.bytes,
    });

  } catch (e) {
    console.error('Upload error:', e);
    res.status(500).json({ error: e.message });
  }
}
