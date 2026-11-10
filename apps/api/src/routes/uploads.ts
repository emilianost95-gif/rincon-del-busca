import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../env';
import { HttpError } from '../lib/http';
import { requirePermission } from '../lib/auth';

export const uploadDir = path.resolve(env.UPLOAD_DIR);
fs.mkdirSync(uploadDir, { recursive: true });

const EXT: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    // Nombre aleatorio: nunca se usa el nombre que manda el navegador.
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${EXT[file.mimetype] ?? ''}`),
  }),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (EXT[file.mimetype]) cb(null, true);
    else cb(new HttpError(400, 'bad_type', 'Formato no permitido. Usá JPG, PNG o WebP.'));
  },
});

/** Verifica la firma real del archivo, no sólo el tipo declarado. */
function looksLikeImage(file: string) {
  const buf = Buffer.alloc(12);
  const fd = fs.openSync(file, 'r');
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  const jpg = buf[0] === 0xff && buf[1] === 0xd8;
  const png = buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const webp = buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
  return jpg || png || webp;
}

export const uploadsRouter = Router();

uploadsRouter.post('/', requirePermission('catalog:write'), upload.single('file'), (req, res) => {
  if (!req.file) throw new HttpError(400, 'no_file', 'No se recibió ninguna imagen');
  if (!looksLikeImage(req.file.path)) {
    fs.unlinkSync(req.file.path);
    throw new HttpError(400, 'bad_type', 'El archivo no es una imagen válida');
  }
  res.status(201).json({ url: `/uploads/${req.file.filename}` });
});
