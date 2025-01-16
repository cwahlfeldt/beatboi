import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  Alert,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
  WithTimingConfig,
} from "react-native-reanimated";

const { width, height } = Dimensions.get("window");
const COLUMN_WIDTH = width / 3;
const BEAT_LINE_Y = height * 0.8;
const NOTE_SIZE = 50;
const NOTE_SPEED = 2000;
const PERFECT_THRESHOLD = 15;
const GOOD_THRESHOLD = 30;


interface Note {
  id: number;
  column: number;
  startTime: number;
  active: boolean;
  currentY: number;
}

interface NoteProps {
  color: string;
  startY: number;
  onComplete: () => void;
  onUpdate?: (position: number) => void;
}

const Note: React.FC<NoteProps> = ({ color, startY, onComplete, onUpdate }) => {
  const translateY = useSharedValue(startY);
  const active = useSharedValue(true);

  useEffect(() => {
    const config: WithTimingConfig = {
      duration: NOTE_SPEED,
      easing: Easing.linear,
    };

    translateY.value = withTiming(BEAT_LINE_Y + 100, config, (finished) => {
      if (finished) {
        active.value = false;
        runOnJS(onComplete)();
      }
    });
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    if (onUpdate) {
      runOnJS(onUpdate)(translateY.value);
    }
    return {
      transform: [{ translateY: translateY.value }],
      opacity: active.value ? 1 : 0,
    };
  });

  return (
    <Animated.View
      style={[styles.note, animatedStyle, { backgroundColor: color }]}
    />
  );
};

const GameScreen: React.FC = () => {
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [notes, setNotes] = useState<Note[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const nextNoteId = useRef(0);

  const handleNoteComplete = (noteId: number) => {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    setCombo(0);
  };

  return (
    <View style={styles.container}>

      <View style={styles.scoreContainer}>
        <Text style={styles.scoreText}>Score: {score}</Text>
        <Text style={styles.comboText}>Combo: {combo}</Text>
      </View>

      <View style={styles.columns}>
        {[0, 1, 2].map((columnIndex) => (
          <View
            key={columnIndex}
            style={[styles.column, { borderColor: colors[columnIndex] }]}
          >
            {notes
              .filter((note) => note.column === columnIndex && note.active)
              .map((note) => (
                <Note
                  key={note.id}
                  color={colors[columnIndex]}
                  startY={-NOTE_SIZE}
                  onComplete={() => handleNoteComplete(note.id)}
                  onUpdate={(position) => {
                    setNotes(prev =>
                      prev.map(n => n.id === note.id ? { ...n, currentY: position } : n)
                    );
                  }}
                />
              ))}
          </View>
        ))}
      </View>

      <View style={[styles.beatLine, { top: BEAT_LINE_Y }]} />
    </View>
  );
};

const colors = ["#FF0000", "#00FF00", "#0000FF"];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
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
    height: 2,
    backgroundColor: "#FFF",
  },
  note: {
    position: "absolute",
    width: NOTE_SIZE * 2.5,
    height: NOTE_SIZE / 1.2,
    borderRadius: NOTE_SIZE / 8,
    left: (COLUMN_WIDTH - NOTE_SIZE) / 11,
  },
  scoreContainer: {
    position: "absolute",
    top: 40,
    left: 20,
    zIndex: 1,
  },
  scoreText: {
    color: "#FFF",
    fontSize: 24,
    fontWeight: "bold",
  },
  comboText: {
    color: "#FFF",
    fontSize: 18,
  },
  resetButton: {
    backgroundColor: '#E75A4D',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  debugButton: {
    backgroundColor: '#666',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
});

export default GameScreen;