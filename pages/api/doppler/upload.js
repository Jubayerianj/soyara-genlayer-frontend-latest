// pages/api/doppler/upload.js
// Handles image uploads for Doppler token fair-launches on LitVM
// Saves uploaded images to public storage and returns a lightweight URL to prevent oversized transaction calldata.

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(455).json({ error: 'Method not allowed' });
  }

  try {
    const { imageBase64, filename } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Parse base64 data
    const matches = imageBase64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    let buffer;
    let ext = 'png';

    if (matches && matches.length === 3) {
      const mime = matches[1];
      if (mime.includes('jpeg') || mime.includes('jpg')) ext = 'jpg';
      else if (mime.includes('webp')) ext = 'webp';
      else if (mime.includes('gif')) ext = 'gif';
      else if (mime.includes('svg')) ext = 'svg';
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(imageBase64, 'base64');
    }

    // Generate unique content-addressed filename
    const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
    const cleanName = (filename || 'token')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .slice(0, 20);
    const savedFileName = `${cleanName}_${hash}.${ext}`;

    const uploadsDir = path.join(process.cwd(), 'public', 'tokens');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const filePath = path.join(uploadsDir, savedFileName);
    fs.writeFileSync(filePath, buffer);

    const relativeUrl = `/tokens/${savedFileName}`;

    return res.status(200).json({
      success: true,
      url: relativeUrl,
      filename: savedFileName,
    });
  } catch (error) {
    console.error('Image upload error:', error);
    return res.status(500).json({ error: error.message || 'Failed to upload image' });
  }
}
