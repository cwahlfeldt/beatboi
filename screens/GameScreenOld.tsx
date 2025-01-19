import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  Alert,
} from "react-native";
import { Audio } from "expo-av";
import Animated, {
  useSharedValue,
  withTiming,
  useAnimatedStyle,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { useRhythmix } from "../hooks/useRhythmix";

const { width, height } = Dimensions.get("window");
const COLUMN_WIDTH = width / 3;
const NOTE_SIZE = 50;
// No artificial constants - we'll use the actual song timing

// Dynamic timing calculations based on song BPM
// Fixed timing windows to match server data
const GAME_TIMINGS = {
  NOTE_SPEED: 1000, // 1 second travel time
  PREVIEW_TIME: 1000, // Show notes 1 second ahead
  PERFECT_WINDOW: 50, // ±50ms for perfect
  GOOD_WINDOW: 100, // ±100ms for good
};

// These will be set when the song loads
let NOTE_SPEED = 0;
let PREVIEW_TIME = 0;
let SPAWN_OFFSET = 0;
let PERFECT_THRESHOLD = 0;
let GOOD_THRESHOLD = 0;
const BEAT_LINE_Y = height * 0.8;

// Modern neon color scheme
const COLORS = {
  primary: {
    red: "#FF3366", // Neon pink-red
    green: "#00FF9F", // Neon mint
    blue: "#00CCFF", // Neon blue
  },
  ui: {
    background: "#111111",
    buttonActive: "#1DB954",
    buttonInactive: "#333333",
    text: "#FFFFFF",
    beatLine: "#FFFFFF",
    debug: "rgba(0, 0, 0, 0.8)",
  },
  feedback: {
    perfect: "#FFD700", // Gold
    good: "#00FF9F", // Mint
    miss: "#FF3366", // Pink-red
  },
};

interface GameNote {
  id: number;
  column: number;
  startTime: number;
  active: boolean;
  hit: boolean;
  strength: number; // Note strength from server (0-1)
  confidence: number; // Note confidence from server (0-1)
}

interface HitResult {
  type: "PERFECT" | "GOOD" | "MISS";
  score: number;
}

interface HitFeedback {
  text: string;
  color: string;
  timestamp: number;
}

interface NoteProps {
  note: GameNote;
  onMiss: (id: number) => void;
}

// Much simpler note that just shows position based on time
const Note: React.FC<NoteProps> = ({ note }) => {
  const currentTime = useSharedValue(0);
  const startPosition = -NOTE_SIZE;
  const endPosition = BEAT_LINE_Y;

  // Update time every frame
  useEffect(() => {
    const interval = setInterval(() => {
      currentTime.value = Date.now();
    }, 16);
    return () => clearInterval(interval);
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    // Calculate progress based on exact server time
    const timeProgress = (currentTime.value - note.startTime) / 1000;

    // Linear interpolation from start to end position
    const position =
      startPosition + timeProgress * (endPosition - startPosition);

    return {
      position: "absolute",
      width: NOTE_SIZE * 2,
      height: NOTE_SIZE,
      left: (COLUMN_WIDTH - NOTE_SIZE * 2) / 2,
      transform: [{ translateY: position }],
      backgroundColor: Object.values(COLORS.primary)[note.column],
      borderRadius: 4,
      opacity: timeProgress > 1 ? 0 : 1, // Fade out after passing beat line
    };
  });

  return <Animated.View style={animatedStyle} />;
};

const GameScreen: React.FC = () => {
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [notes, setNotes] = useState<GameNote[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [hitFeedback, setHitFeedback] = useState<HitFeedback[]>([]);
  const [currentBPM, setCurrentBPM] = useState(0);

  const gameTime = useSharedValue(0);
  const activeNotes = useSharedValue(0);

  const soundRef = useRef<Audio.Sound | null>(null);
  const nextNoteId = useRef(0);

  // Using real BPM timing, no scaling needed

  const { loading, analyzeTestTrack } = useRhythmix({
    difficulty: 5,
    columns: 3,
    min_note_gap: 150,
  });

  const handleNoteMiss = useCallback((id: number) => {
    setCombo(0);
    setHitFeedback((prev) => [
      ...prev,
      {
        text: "MISS",
        color: COLORS.feedback.miss,
        timestamp: Date.now(),
      },
    ]);
    setNotes((prev) =>
      prev.map((note) => (note.id === id ? { ...note, active: false } : note)),
    );
  }, []);

  const handleTapColumn = useCallback(
    (column: number) => {
      if (!isPlaying) return;

      const currentTime = gameTime.value;
      const columnNotes = notes
        .filter(
          (note) =>
            note.column === column &&
            note.active &&
            !note.hit &&
            Math.abs(note.startTime - currentTime) <= GOOD_THRESHOLD,
        )
        .sort(
          (a, b) =>
            Math.abs(a.startTime - currentTime) -
            Math.abs(b.startTime - currentTime),
        );

      if (columnNotes.length === 0) return;

      const closestNote = columnNotes[0];
      const timeDiff = Math.abs(closestNote.startTime - currentTime);

      let hitResult: HitResult | null = null;

      if (timeDiff <= PERFECT_THRESHOLD) {
        hitResult = { type: "PERFECT", score: 100 };
      } else if (timeDiff <= GOOD_THRESHOLD) {
        hitResult = { type: "GOOD", score: 50 };
      }

      if (hitResult) {
        const hitTimestamp = Date.now();
        setScore((prev) => prev + hitResult!.score);
        setCombo((prev) => prev + 1);
        setHitFeedback((prev) => [
          ...prev,
          {
            text: hitResult!.type,
            color:
              hitResult!.type === "PERFECT"
                ? COLORS.feedback.perfect
                : COLORS.feedback.good,
            timestamp: hitTimestamp,
          },
        ]);

        setNotes((prev) =>
          prev.map((note) =>
            note.id === closestNote.id
              ? { ...note, hit: true, active: false }
              : note,
          ),
        );
      }
    },
    [isPlaying, notes, gameTime.value],
  );

  const prepareGame = useCallback(async () => {
    try {
      const result = await analyzeTestTrack();
      const asset = require("../assets/tracks/Heartbeat_Racer.mp3");
      const { sound } = await Audio.Sound.createAsync(asset);
      soundRef.current = sound;

      // Just store BPM for reference
      setCurrentBPM(result.metadata.bpm);

      // Use fixed gameplay timings
      NOTE_SPEED = GAME_TIMINGS.NOTE_SPEED;
      PREVIEW_TIME = GAME_TIMINGS.PREVIEW_TIME;
      PERFECT_THRESHOLD = GAME_TIMINGS.PERFECT_WINDOW;
      GOOD_THRESHOLD = GAME_TIMINGS.GOOD_WINDOW;

      console.log("Game Setup:", {
        noteTimes: result.notes.slice(0, 5).map((n) => n.time),
        noteSpeed: NOTE_SPEED,
        previewTime: PREVIEW_TIME,
      });

      // Log first few notes to verify timing
      const firstFewNotes = result.notes.slice(0, 5);
      console.log(
        "First notes timing:",
        firstFewNotes.map((note) => ({
          time: note.time,
          strength: note.strength,
          confidence: note.confidence,
        })),
      );

      const validationChecks = {
        noteSpeedCheck: NOTE_SPEED > 1000 && NOTE_SPEED < 10000,
        previewTimeCheck: PREVIEW_TIME > 1000 && PREVIEW_TIME < 10000,
        spawnOffsetCheck: SPAWN_OFFSET > 200 && SPAWN_OFFSET < 5000,
        thresholdCheck: PERFECT_THRESHOLD < GOOD_THRESHOLD,
      };

      console.log("Timing validation:", validationChecks);

      if (!Object.values(validationChecks).every((check) => check)) {
        console.warn("Some timing values may be outside expected ranges!");
      }

      // Use notes exactly as they come from the server
      const gameNotes = result.notes.map((note) => ({
        id: nextNoteId.current++,
        column: note.column,
        startTime: note.time, // Exact time from server
        active: false,
        hit: false,
        strength: note.strength,
        confidence: note.confidence,
      }));

      setNotes(gameNotes);
      setIsReady(true);
    } catch (error) {
      console.error("Failed to prepare game:", error);
      Alert.alert("Error", "Failed to prepare game");
    }
  }, [analyzeTestTrack]);

  const updateNotes = useCallback((currentTime: number) => {
    setNotes((prevNotes) => {
      const updatedNotes = prevNotes.map((note) => ({
        ...note,
        active:
          !note.hit && // Not already hit
          currentTime >= note.startTime - GAME_TIMINGS.PREVIEW_TIME && // Within preview window
          currentTime <= note.startTime + 200, // Small window after beat for cleanup
      }));

      activeNotes.value = updatedNotes.filter((n) => n.active).length;
      return updatedNotes;
    });
  }, []);

  const handleStartGame = useCallback(async () => {
    if (!isReady || !soundRef.current) return;

    try {
      gameTime.value = 0;
      setScore(0);
      setCombo(0);
      setIsPlaying(true);
      await soundRef.current.playAsync();

      gameTime.value = withTiming(
        300000,
        {
          duration: 300000,
          easing: Easing.linear,
        },
        () => {
          runOnJS(setIsPlaying)(false);
        },
      );
    } catch (error) {
      console.error("Failed to start game:", error);
      Alert.alert("Error", "Failed to start game");
    }
  }, [isReady]);

  useEffect(() => {
    if (isPlaying) {
      const interval = setInterval(() => {
        runOnJS(updateNotes)(gameTime.value);
      }, 16);

      return () => clearInterval(interval);
    }
  }, [isPlaying, updateNotes]);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync();
      gameTime.value = 0;
    };
  }, []);

  const DebugOverlay = () => (
    <View style={styles.debugOverlay}>
      <Text style={styles.debugText}>
        Game Status: {isPlaying ? "Playing" : "Stopped"}
        {"\n"}
        Game Time: {Math.floor(gameTime.value)}ms{"\n"}
        BPM: {currentBPM}
        {"\n"}
        Note Speed: {NOTE_SPEED}ms{"\n"}
        Perfect Window: ±{PERFECT_THRESHOLD}ms{"\n"}
        Good Window: ±{GOOD_THRESHOLD}ms{"\n"}
        Active Notes: {activeNotes.value}
        {"\n"}
        Total Notes: {notes.length}
      </Text>
    </View>
  );

  const HitFeedbackDisplay = () => (
    <View style={styles.hitFeedbackContainer}>
      {hitFeedback
        .filter((feedback) => Date.now() - feedback.timestamp < 500)
        .map((feedback, index) => (
          <Animated.Text
            key={`${feedback.timestamp}-${index}`}
            style={[styles.hitFeedbackText, { color: feedback.color }]}
          >
            {feedback.text}
          </Animated.Text>
        ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <DebugOverlay />
      <HitFeedbackDisplay />

      <View style={styles.controlsContainer}>
        {!isReady ? (
          <TouchableOpacity
            style={styles.button}
            onPress={prepareGame}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? "Analyzing..." : "Load Game"}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.button, isPlaying && styles.playingButton]}
            onPress={handleStartGame}
            disabled={isPlaying}
          >
            <Text style={styles.buttonText}>
              {isPlaying ? "Playing..." : "Start Game"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.scoreContainer}>
        <Text style={styles.scoreText}>Score: {score}</Text>
        <Text style={styles.comboText}>Combo: {combo}x</Text>
      </View>

      <View style={styles.columns}>
        {[0, 1, 2].map((columnIndex) => (
          <TouchableOpacity
            key={columnIndex}
            style={[
              styles.column,
              { borderColor: Object.values(COLORS.primary)[columnIndex] },
            ]}
            onPress={() => handleTapColumn(columnIndex)}
            activeOpacity={0.7}
          >
            {notes
              .filter((note) => note.column === columnIndex && note.active)
              .map((note) => (
                <Note key={note.id} note={note} onMiss={handleNoteMiss} />
              ))}
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.beatLine, { top: BEAT_LINE_Y }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.ui.background,
  },
  controlsContainer: {
    position: "absolute",
    top: 60,
    right: 20,
    zIndex: 1,
  },
  button: {
    backgroundColor: COLORS.ui.buttonActive,
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  playingButton: {
    backgroundColor: COLORS.ui.buttonInactive,
  },
  buttonText: {
    color: COLORS.ui.text,
    fontSize: 16,
    fontWeight: "bold",
    textAlign: "center",
  },
  columns: {
    flex: 1,
    flexDirection: "row",
  },
  column: {
    flex: 1,
    borderWidth: 1,
    borderStyle: "dashed",
    height: "95%",
  },
  beatLine: {
    position: "absolute",
    width: "100%",
    height: 4,
    backgroundColor: COLORS.ui.beatLine,
    shadowColor: COLORS.ui.beatLine,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 5,
  },
  debugOverlay: {
    position: "absolute",
    top: 100,
    left: 20,
    backgroundColor: COLORS.ui.debug,
    padding: 10,
    borderRadius: 5,
    zIndex: 999,
  },
  debugText: {
    color: COLORS.ui.text,
    fontSize: 14,
    fontWeight: "bold",
  },
  scoreContainer: {
    position: "absolute",
    top: 40,
    left: 20,
    zIndex: 1,
  },
  scoreText: {
    color: COLORS.ui.text,
    fontSize: 24,
    fontWeight: "bold",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  comboText: {
    color: COLORS.ui.text,
    fontSize: 18,
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  hitFeedbackContainer: {
    position: "absolute",
    top: BEAT_LINE_Y - 100,
    width: "100%",
    alignItems: "center",
    pointerEvents: "none",
    zIndex: 998,
  },
  hitFeedbackText: {
    fontSize: 24,
    fontWeight: "bold",
    textShadowColor: "rgba(0, 0, 0, 0.5)",
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
});

export default GameScreen;
