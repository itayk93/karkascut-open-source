import { projectRepository } from "../repositories/projectRepository.js";
import { Project } from "../types.js";

export function getProjectDir(projectId: string): string {
  return projectRepository.getDir(projectId);
}

export function saveProject(project: Project): void {
  projectRepository.save(project);
}

export function getProject(projectId: string): Project | null {
  return projectRepository.get(projectId);
}

export function listProjects(): Project[] {
  return projectRepository.list();
}

export function deleteProject(projectId: string): boolean {
  return projectRepository.delete(projectId);
}
