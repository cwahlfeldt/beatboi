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
const NOTE_SPEED = 1500;
const PREVIEW_TIME = NOTE_SPEED;
const SPAWN_OFFSET = 2000;
const BEAT_LINE_Y = height * 0.8;
const PERFECT_THRESHOLD = 50;
const GOOD_THRESHOLD = 100;

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

const Note: React.FC<NoteProps> = ({ note, onMiss }) => {
  const translateY = useSharedValue(-NOTE_SIZE);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (note.active) {
      translateY.value = -NOTE_SIZE;
      opacity.value = 1;

      translateY.value = withTiming(
        BEAT_LINE_Y,
        {
          duration: NOTE_SPEED,
          easing: Easing.linear,
        },
        (finished) => {
          if (finished) {
            runOnJS(onMiss)(note.id);
          }
        },
      );
    }
  }, [note.active]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
      opacity: opacity.value,
      position: "absolute",
      width: NOTE_SIZE * 2.5,
      height: NOTE_SIZE / 1.2,
      left: (COLUMN_WIDTH - NOTE_SIZE * 2.5) / 2,
      backgroundColor: Object.values(COLORS.primary)[note.column],
      borderWidth: 2,
      borderColor: "#FFFFFF",
      borderRadius: NOTE_SIZE / 8,
      shadowColor: Object.values(COLORS.primary)[note.column],
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.8,
      shadowRadius: 10,
      elevation: 8,
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

  const gameTime = useSharedValue(0);
  const activeNotes = useSharedValue(0);

  const soundRef = useRef<Audio.Sound | null>(null);
  const nextNoteId = useRef(0);

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
        .filter((note) => note.column === column && note.active && !note.hit)
        .sort((a, b) => a.startTime - b.startTime);

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
            timestamp: Date.now(),
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

      const gameNotes = result.notes
        .sort((a, b) => a.time - b.time)
        .map((note) => ({
          id: nextNoteId.current++,
          column: note.column,
          startTime: note.time + SPAWN_OFFSET,
          active: false,
          hit: false,
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
          !note.hit &&
          currentTime >= note.startTime - PREVIEW_TIME &&
          currentTime <= note.startTime + 500,
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
            key={feedback.timestamp}
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
