import { useState, useEffect } from "react";
import { getAiModels, ApiAiModel } from "../lib/api";

export function useAiModels(trigger?: any) {
  const [data, setData] = useState<ApiAiModel[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    const fetchModels = () => {
      getAiModels()
        .then((models) => {
          if (mounted) {
            setData(models);
            setError(null);
            setIsLoading(false);
          }
        })
        .catch((err) => {
          if (mounted) {
            // If it's a 401 or similar during login, we just stay quiet.
            setError(err instanceof Error ? err : new Error(String(err)));
            setIsLoading(false);
          }
        });
    };

    fetchModels();

    window.addEventListener("focus", fetchModels);
    window.addEventListener("ai-models-updated", fetchModels);

    return () => {
      mounted = false;
      window.removeEventListener("focus", fetchModels);
      window.removeEventListener("ai-models-updated", fetchModels);
    };
  }, [trigger]);

  return { data, error, isLoading, refresh: () => window.dispatchEvent(new CustomEvent("ai-models-updated")) };
}
