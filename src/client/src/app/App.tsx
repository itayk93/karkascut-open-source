import React, { useState, useEffect } from "react";
import { Project, api, useToast } from "../shared";
import { ApiKeyModal, useApiKeys } from "../features/settings";
import { ProjectDashboard, UploadScriptModal, useProjects } from "../features/projects";
import { ProcessingPipelineStatus, useProcessing } from "../features/processing";
import { StudioWorkspace } from "../features/studio";
import { useBroll } from "../features/broll";
import { useVideoExport } from "../features/export";

export const App: React.FC = () => {
  const {
    hasServerKey,
    maskedServerKey,
    hasNvidiaKey,
    maskedNvidiaKey,
    showKeyModal,
    setShowKeyModal,
    saveOpenAiKey,
    saveNvidiaKey
  } = useApiKeys();

  const {
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
  } = useProjects();

  const handleProjectUpdated = (proj: Project) => {
    setCurrentProject(proj);
    setProjects((prev) => prev.map((p) => (p.id === proj.id ? proj : p)));
  };

  const {
    videoCacheBuster,
    startProcessing,
    reRender,
    cancelJob,
    updateCuts,
    toggleCut,
    updateTranscriptWords,
    rotateVideo,
    runEyeContact
  } = useProcessing(currentProject, handleProjectUpdated);

  const { isMatchingBroll, uploadBrollAsset, updateBrollAssetHint, deleteBrollAsset, autoMatchBroll, updateBrollOverlays } = useBroll(
    currentProject,
    handleProjectUpdated
  );

  const { exportFinalVideo, downloadFinalVideo, exportPremiereXml, exportJsonPlan, importJsonPlan } = useVideoExport(
    currentProject,
    handleProjectUpdated
  );

  const toast = useToast();
  const [preflighting, setPreflighting] = useState<boolean>(false);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);
  const [isMobileScreen, setIsMobileScreen] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth < 768;
    }
    return false;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingUploadFile(file);
    e.target.value = "";
  };

  const processUploadWithScript = async (file: File, originalScript?: string) => {
    // Pre-flight: verify the OpenAI key actually works before uploading /
    // starting anything, so a bad key can't leave a half-processed project.
    setPreflighting(true);
    try {
      const check = await api.validateOpenAiKey();
      if (!check.valid) {
        toast.error(check.error || "מפתח OpenAI API לא תקין — לא ניתן להתחיל עיבוד.");
        setShowKeyModal(true);
        return;
      }
    } catch {
      toast.error("לא ניתן לאמת את מפתח ה-OpenAI מול השרת. ודא שהשרת (פורט 3050) רץ.");
      return;
    } finally {
      setPreflighting(false);
    }

    setPendingUploadFile(null);
    const proj = await uploadVideo(file);
    if (!proj) return;

    await startProcessing({
      originalScript,
      renderPreferences: {
        makeVertical: true,
        burnCaptions: true,
        captionsStyle: "hormozi"
      }
    }, proj.id);
    fetchProjects();
  };

  const handleCancel = async () => {
    setIsCancelling(true);
    await cancelJob();
    setIsCancelling(false);
  };

  return (
    <div className={currentProject ? "studio-wrapper" : "container"} dir="rtl">
      {/* API Key Modal */}
      <ApiKeyModal
        isOpen={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        hasServerKey={hasServerKey}
        maskedServerKey={maskedServerKey}
        hasNvidiaKey={hasNvidiaKey}
        maskedNvidiaKey={maskedNvidiaKey}
        onSaveOpenAiKey={saveOpenAiKey}
        onSaveNvidiaKey={saveNvidiaKey}
      />

      {/* VIEW 1: DASHBOARD */}
      {!currentProject && (
        <ProjectDashboard
          projects={projects}
          uploading={uploading}
          uploadError={uploadError}
          isKeyConfigured={hasServerKey}
          isMobileScreen={isMobileScreen}
          onSelectProject={setCurrentProject}
          onDeleteProject={deleteProject}
          onDeleteProjects={deleteProjects}
          onFileSelect={handleFileSelect}
          onOpenSettings={() => setShowKeyModal(true)}
        />
      )}

      {/* VIEW 2: PROCESSING PIPELINE */}
      {currentProject && (currentProject.status === "processing" || currentProject.status === "exporting") && (
        <div style={{ maxWidth: "800px", margin: "40px auto 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <button
              className="btn btn-secondary"
              onClick={() => setCurrentProject(null)}
              style={{ fontSize: "13px", padding: "4px 12px" }}
            >
              → חזור לרשימת הפרויקטים
            </button>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
              <bdi dir="ltr">{currentProject.originalFileName}</bdi>
            </span>
          </div>
          <ProcessingPipelineStatus
            currentStepIndex={currentProject.currentStepIndex || 1}
            processingStep={"\u200F" + (currentProject.processingStep || "מעבד נתונים...") + "\u200F"}
            logs={currentProject.logs || []}
            isExporting={currentProject.status === "exporting"}
            onCancel={handleCancel}
            isCancelling={isCancelling}
          />
        </div>
      )}

      {/* VIEW 2b: PROCESSING FAILED */}
      {currentProject && currentProject.status === "error" && (
        <div style={{ maxWidth: "760px", margin: "40px auto 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <button
              className="btn btn-secondary"
              onClick={() => setCurrentProject(null)}
              style={{ fontSize: "13px", padding: "4px 12px" }}
            >
              → חזור לרשימת הפרויקטים
            </button>
            <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>
              <bdi dir="ltr">{currentProject.originalFileName}</bdi>
            </span>
          </div>

          <div
            style={{
              background: "#fff",
              border: "1px solid #fecaca",
              borderRadius: "14px",
              padding: "24px"
            }}
          >
            <h2 style={{ margin: "0 0 8px", color: "#b91c1c", fontSize: "18px" }}>העיבוד נכשל</h2>
            <p style={{ margin: "0 0 14px", fontSize: "14px", color: "#475569" }}>
              {currentProject.errorMessage || "אירעה שגיאה בתהליך העיבוד."}
            </p>

            {(currentProject.logs || []).length > 0 && (
              <pre
                style={{
                  fontSize: "12px",
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: "8px",
                  padding: "10px",
                  maxHeight: "220px",
                  overflowY: "auto",
                  color: "#334155",
                  direction: "ltr",
                  whiteSpace: "pre-wrap"
                }}
              >
                {(currentProject.logs || []).slice(-25).join("\n")}
              </pre>
            )}

            <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
              <button
                className="btn btn-primary"
                onClick={() => setShowKeyModal(true)}
                style={{ fontSize: "13px" }}
              >
                בדוק / עדכן מפתח API
              </button>
              <button
                className="btn btn-secondary"
                disabled={preflighting}
                onClick={async () => {
                  const check = await api.validateOpenAiKey().catch(() => ({ valid: false, error: "השרת לא זמין" }));
                  if (!check.valid) {
                    toast.error(check.error || "מפתח OpenAI API לא תקין.");
                    setShowKeyModal(true);
                    return;
                  }
                  await startProcessing(
                    { renderPreferences: currentProject.renderPreferences },
                    currentProject.id
                  );
                }}
                style={{ fontSize: "13px" }}
              >
                נסה שוב לעבד
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: STUDIO WORKSPACE */}
      {currentProject && (currentProject.status === "ready" || currentProject.status === "exported") && (
        <StudioWorkspace
          project={currentProject}
          videoCacheBuster={videoCacheBuster}
          isMobileScreen={isMobileScreen}
          onBack={() => setCurrentProject(null)}
          onOpenKeyModal={() => setShowKeyModal(true)}
          onProjectUpdated={handleProjectUpdated}
          reRender={reRender}
          exportFinalVideo={exportFinalVideo}
          downloadFinalVideo={downloadFinalVideo}
          exportPremiereXml={exportPremiereXml}
          exportJsonPlan={exportJsonPlan}
          importJsonPlan={importJsonPlan}
          updateCuts={updateCuts}
          toggleCut={toggleCut}
          updateTranscriptWords={updateTranscriptWords}
          rotateVideo={rotateVideo}
          runEyeContact={runEyeContact}
          uploadBrollAsset={uploadBrollAsset}
          updateBrollAssetHint={updateBrollAssetHint}
          deleteBrollAsset={deleteBrollAsset}
          autoMatchBroll={autoMatchBroll}
          isMatchingBroll={isMatchingBroll}
          updateBrollOverlays={updateBrollOverlays}
          onFileSelect={handleFileSelect}
        />
      )}

      {/* Script Input Modal */}
      {pendingUploadFile && (
        <UploadScriptModal
          isOpen={!!pendingUploadFile}
          fileName={pendingUploadFile.name}
          onConfirm={(script) => processUploadWithScript(pendingUploadFile, script)}
          onSkip={() => processUploadWithScript(pendingUploadFile)}
          onCancel={() => setPendingUploadFile(null)}
        />
      )}
    </div>
  );
};
