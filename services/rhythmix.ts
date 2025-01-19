export interface AnalysisOptions {
  difficulty: number; // 1-10
  columns: number; // Number of columns (usually 4)
  min_note_gap: number; // Minimum ms between notes
}

export interface Note {
  time: number; // Timestamp in ms
  column: number; // Column number
  strength: number; // 0.0-1.0
  confidence: number; // 0.0-1.0
}

export interface Section {
  start: number;
  end: number;
  energy: number;
  complexity: number;
}

export interface AnalysisResult {
  metadata: {
    duration: number;
    bpm: number;
    key: string | null;
  };
  sections: Section[];
  notes: Note[];
}

// Try different server URLs depending on environment
const SERVER_URL = "http://192.168.40.223:8080";

// Skip server check since we only have the /analyze endpoint
async function checkServer(): Promise<boolean> {
  try {
    // Just verify the server's host is reachable
    await fetch(SERVER_URL, { method: "HEAD" });
    return true;
  } catch (error) {
    console.error("Server check failed:", error);
    return false;
  }
}

export async function analyzeAudio(
  audioUri: string,
  options: AnalysisOptions = { difficulty: 5, columns: 3, min_note_gap: 100 },
): Promise<AnalysisResult> {
  try {
    // Create form data
    console.log("Starting analysis with URI:", audioUri);

    // Try to fetch the file and get its size
    try {
      const fileInfo = await fetch(audioUri);
      console.log("File info:", {
        status: fileInfo.status,
        type: fileInfo.type,
        size: fileInfo.headers.get("content-length"),
      });
    } catch (error) {
      console.error("Failed to fetch file info:", error);
    }

    const formData = new FormData();
    console.log("Creating form data for file:", {
      exists: !!audioUri,
      uri: audioUri,
    });

    // Create file object with the correct structure for Expo Go
    const fileData = {
      uri: audioUri,
      type: "audio/mpeg",
      name: "audio.mp3",
      size: undefined,
    };
    console.log("File data:", fileData);

    // Add the audio file and options separately for clarity
    formData.append("audio", fileData as any);
    formData.append("options", JSON.stringify(options));

    // Log the complete formData contents
    for (const pair of (formData as any).entries()) {
      console.log("FormData entry:", pair[0], pair[1]);
    }

    // Log the complete request details
    console.log("Sending request:", {
      url: `${SERVER_URL}/analyze`,
      method: "POST",
      fileData: fileData,
      options: options,
    });

    // Add options
    formData.append("options", JSON.stringify(options));

    // Make the request
    console.log("Sending request with formData:", {
      audioUri,
      options,
    });

    // Create boundary for multipart form-data
    const boundary =
      "----WebKitFormBoundary" + Math.random().toString(36).substring(2);

    const response = await fetch(`${SERVER_URL}/analyze`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: formData,
    });

    // Log the complete response details
    console.log("Response details:", {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Server response:", {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        headers: Object.fromEntries(response.headers.entries()),
      });
      throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = (await response.json()) as AnalysisResult;

    // Log analysis results
    console.log("Analysis complete:", {
      duration: result.metadata.duration,
      bpm: result.metadata.bpm,
      key: result.metadata.key,
      totalSections: result.sections.length,
      totalNotes: result.notes.length,
      averageEnergy:
        result.sections.reduce((sum, s) => sum + s.energy, 0) /
        result.sections.length,
      averageComplexity:
        result.sections.reduce((sum, s) => sum + s.complexity, 0) /
        result.sections.length,
      notesPerColumn: result.notes.reduce(
        (acc, note) => {
          acc[note.column] = (acc[note.column] || 0) + 1;
          return acc;
        },
        {} as Record<number, number>,
      ),
    });

    return result;
  } catch (error) {
    console.error("Error analyzing audio:", {
      error,
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}
