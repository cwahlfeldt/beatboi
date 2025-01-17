import { useState, useCallback } from "react";
import { Asset } from "expo-asset";
import {
  analyzeAudio,
  AnalysisResult,
  AnalysisOptions,
} from "../src/services/rhythmix";

import TEST_TRACK from "../assets/tracks/Heartbeat_Racer.mp3";

interface UseRhythmixState {
  loading: boolean;
  error: Error | null;
  analysisResult: AnalysisResult | null;
}

export function useRhythmix(defaultOptions?: Partial<AnalysisOptions>) {
  const [state, setState] = useState<UseRhythmixState>({
    loading: false,
    error: null,
    analysisResult: null,
  });

  const analyzeTestTrack = useCallback(
    async (options?: Partial<AnalysisOptions>) => {
      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        // Get the asset
        const asset = Asset.fromModule(TEST_TRACK);
        console.log("Asset before download:", asset);
        await asset.downloadAsync();
        console.log("Asset after download:", asset);

        if (!asset.localUri) {
          throw new Error("Failed to load test track - no localUri available");
        }

        console.log("Using local URI:", asset.localUri);

        const finalOptions: AnalysisOptions = {
          difficulty: 5,
          columns: 4,
          min_note_gap: 100,
          ...defaultOptions,
          ...options,
        };

        const analysis = await analyzeAudio(asset.localUri, finalOptions);

        setState({
          loading: false,
          error: null,
          analysisResult: analysis,
        });

        return analysis;
      } catch (error) {
        const finalError =
          error instanceof Error ? error : new Error("Unknown error occurred");
        setState((prev) => ({
          ...prev,
          loading: false,
          error: finalError,
        }));
        throw finalError;
      }
    },
    [defaultOptions],
  );

  const reset = useCallback(() => {
    setState({
      loading: false,
      error: null,
      analysisResult: null,
    });
  }, []);

  return {
    loading: state.loading,
    error: state.error,
    analysisResult: state.analysisResult,
    analyzeTestTrack,
    reset,
  };
}
