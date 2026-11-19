import { Router } from "express";
import express from "express";
import path from "path";
import fs from "fs";
import { projectRepository } from "../repositories/projectRepository.js";

const router = Router();

router.get("/media/projects/:id/raw-original.mp4", (req, res) => {
  const project = projectRepository.get(String(req.params.id));
  if (!project) return res.status(404).send("Project not found");

  const rawPath = project.rawOriginalFilePath || path.join(projectRepository.getDir(project.id), "original.mp4");
  if (fs.existsSync(rawPath)) {
    return res.sendFile(rawPath);
  }
  if (fs.existsSync(project.originalFilePath)) {
    return res.sendFile(project.originalFilePath);
  }
  res.status(404).send("Raw video file not found");
});

router.get("/media/projects/:id/original.mp4", (req, res) => {
  const project = projectRepository.get(String(req.params.id));
  if (!project) return res.status(404).send("Project not found");

  if (project.originalFilePath && fs.existsSync(project.originalFilePath)) {
    return res.sendFile(project.originalFilePath);
  }
  const defaultPath = path.join(projectRepository.getDir(project.id), "original.mp4");
  if (fs.existsSync(defaultPath)) {
    return res.sendFile(defaultPath);
  }
  res.status(404).send("Original video file not found");
});

router.use("/media/projects", (_req, res, next) => {
  const mediaDir = path.resolve(process.cwd(), "data/projects");
  express.static(mediaDir)(_req, res, next);
});

router.use("/media/audio", express.static(path.resolve(process.cwd(), "assets/audio")));

export default router;
