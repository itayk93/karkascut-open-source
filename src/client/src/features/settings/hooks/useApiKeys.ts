import { useState, useEffect, useCallback } from "react";
import { api, useToast } from "../../../shared";

export function useApiKeys() {
  const [hasServerKey, setHasServerKey] = useState<boolean>(false);
  const [maskedServerKey, setMaskedServerKey] = useState<string | null>(null);
  const [hasNvidiaKey, setHasNvidiaKey] = useState<boolean>(false);
  const [maskedNvidiaKey, setMaskedNvidiaKey] = useState<string | null>(null);
  const [showKeyModal, setShowKeyModal] = useState<boolean>(false);
  const toast = useToast();

  const refreshKeys = useCallback(async () => {
    try {
      const data = await api.getHealth();
      setHasServerKey(data.hasOpenAIKey);
      setMaskedServerKey(data.maskedKey);
      setHasNvidiaKey(data.hasNvidiaKey);
      setMaskedNvidiaKey(data.maskedNvidiaKey);
    } catch (err: unknown) {
      console.error("Failed to fetch keys:", err);
    }
  }, []);

  useEffect(() => {
    refreshKeys();
  }, [refreshKeys]);

  const saveOpenAiKey = async (apiKey: string) => {
    try {
      const res = await api.saveOpenAiKey(apiKey);
      if (res.success) {
        setHasServerKey(true);
        setMaskedServerKey(res.maskedKey);

        // Verify the saved key actually authenticates before letting the user proceed
        const check = await api
          .validateOpenAiKey()
          .catch(() => ({ valid: true as boolean, error: undefined as string | undefined }));
        if (!check.valid) {
          toast.error(check.error || "המפתח נשמר אך נכשל באימות מול OpenAI. בדוק אותו שוב.");
          return false;
        }

        setShowKeyModal(false);
        toast.success("מפתח OpenAI נשמר ואומת בהצלחה!");
        return true;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "שגיאה בשמירת מפתח";
      toast.error(msg);
      return false;
    }
  };

  const saveNvidiaKey = async (apiKey: string) => {
    try {
      const res = await api.saveNvidiaKey(apiKey);
      if (res.success) {
        setHasNvidiaKey(true);
        setMaskedNvidiaKey(res.maskedKey);
        setShowKeyModal(false);
        toast.success("מפתח NVIDIA Maxine נשמר בהצלחה בשרת!");
        return true;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "שגיאה בשמירת מפתח";
      toast.error(msg);
      return false;
    }
  };

  return {
    hasServerKey,
    maskedServerKey,
    hasNvidiaKey,
    maskedNvidiaKey,
    showKeyModal,
    setShowKeyModal,
    saveOpenAiKey,
    saveNvidiaKey,
    refreshKeys
  };
}
