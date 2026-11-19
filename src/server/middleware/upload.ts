import multer from "multer";
import path from "path";
import fs from "fs";
import { projectRepository } from "../repositories/projectRepository.js";
import { generateId } from "../utils/id.js";

const UPLOAD_DIR = path.resolve(process.cwd(), "data/uploads");

export const mainVideoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".mp4";
      cb(null, `${generateId("upload")}${ext}`);
    }
  }),
  limits: { fileSize: 1024 * 1024 * 1000 }
});

export const assetUpload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const projectId = String(req.params.id);
      const assetDir = path.join(projectRepository.getDir(projectId), "assets");
      if (!fs.existsSync(assetDir)) fs.mkdirSync(assetDir, { recursive: true });
      cb(null, assetDir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || ".png";
      cb(null, `${generateId("asset")}${ext}`);
    }
  }),
  limits: { fileSize: 250 * 1024 * 1024 }
});
