import fs from "fs";
import path from "path";
import { Project } from "../types.js";

export interface IProjectRepository {
  get(id: string): Project | null;
  save(project: Project): void;
  list(): Project[];
  delete(id: string): boolean;
  getDir(id: string): string;
}

export class FileProjectRepository implements IProjectRepository {
  private readonly dataDir: string;
  private readonly projectsDir: string;
  private readonly uploadsDir: string;

  constructor(baseDir = process.cwd()) {
    this.dataDir = path.resolve(baseDir, "data");
    this.projectsDir = path.join(this.dataDir, "projects");
    this.uploadsDir = path.join(this.dataDir, "uploads");
    this.ensureDirs();
  }

  private ensureDirs(): void {
    if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
    if (!fs.existsSync(this.projectsDir)) fs.mkdirSync(this.projectsDir, { recursive: true });
    if (!fs.existsSync(this.uploadsDir)) fs.mkdirSync(this.uploadsDir, { recursive: true });
  }

  getDir(projectId: string): string {
    const dir = path.join(this.projectsDir, projectId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  get(projectId: string): Project | null {
    const filePath = path.join(this.getDir(projectId), "project.json");
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data) as Project;
    } catch (err: unknown) {
      console.error(`Error reading project ${projectId}:`, err);
      return null;
    }
  }

  save(project: Project): void {
    const dir = this.getDir(project.id);
    const filePath = path.join(dir, "project.json");
    project.updatedAt = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(project, null, 2), "utf-8");
  }

  list(): Project[] {
    if (!fs.existsSync(this.projectsDir)) return [];
    const entries = fs.readdirSync(this.projectsDir, { withFileTypes: true });
    const projects: Project[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const p = this.get(entry.name);
        if (p) projects.push(p);
      }
    }
    return projects.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  delete(projectId: string): boolean {
    const dir = path.join(this.projectsDir, projectId);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      return true;
    }
    return false;
  }
}

export const projectRepository = new FileProjectRepository();
