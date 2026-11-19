import { useState, useCallback, useEffect } from "react";
import { Project, api, useToast } from "../../../shared";

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
  const toast = useToast();

  const fetchProjects = useCallback(async () => {
    try {
      const data = await api.listProjects();
      setProjects(data);
      setCurrentProject((prev) => {
        if (!prev) return null;
        const found = data.find((p) => p.id === prev.id);
        return found || null;
      });
    } catch (err: unknown) {
      console.error("Failed to fetch projects:", err);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const uploadVideo = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const newProj = await api.uploadVideo(file);
      await fetchProjects();
      setCurrentProject(newProj);
      toast.success("סרטון הועלה בהצלחה!");
      return newProj;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "העלאת הסרטון נכשלה";
      setUploadError(msg);
      toast.error(msg);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const deleteProject = async (id: string) => {
    try {
      await api.deleteProject(id);
      if (currentProject?.id === id) {
        setCurrentProject(null);
      }
      toast.info("פרויקט נמחק");
      await fetchProjects();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "מחיקת פרויקט נכשלה";
      toast.error(msg);
    }
  };

  const deleteProjects = async (ids: string[]) => {
    if (ids.length === 0) return;
    try {
      const res = await api.deleteProjects(ids);
      if (currentProject && ids.includes(currentProject.id)) {
        setCurrentProject(null);
      }
      toast.info(res.message || `${ids.length} פרויקטים נמחקו`);
      await fetchProjects();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "מחיקת פרויקטים נכשלה";
      toast.error(msg);
    }
  };

  return {
    projects,
    setProjects,
    currentProject,
    setCurrentProject,
    uploading,
    uploadError,
    pendingUploadFile,
    setPendingUploadFile,
    fetchProjects,
    uploadVideo,
    deleteProject,
    deleteProjects
  };
}
