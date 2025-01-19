import React, { useEffect } from "react";
import { Dimensions } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

const { width } = Dimensions.get("window");
const COLUMN_WIDTH = width / 3;
const NOTE_SIZE = 50;

// Colors from theme (we'll move these to a theme file later)
const COLORS = {
  primary: {
    red: "#FF3366", // Neon pink-red
    green: "#00FF9F", // Neon mint
    blue: "#00CCFF", // Neon blue
  },
};

export interface NoteProps {
  id: number;
  column: number;
  startTime: number;
  active: boolean;
  hit: boolean;
  strength: number;
  confidence: number;
}

const Note: React.FC<NoteProps> = ({ column, startTime, strength }) => {
  const currentTime = useSharedValue(0);
  const startPosition = -NOTE_SIZE;
  const endPosition = Dimensions.get("window").height * 0.8; // BEAT_LINE_Y

  // Update time every frame
  useEffect(() => {
    const interval = setInterval(() => {
      currentTime.value = Date.now();
    }, 16);
    return () => clearInterval(interval);
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    // Calculate progress based on exact server time
    const timeProgress = (currentTime.value - startTime) / 1000;

    // Linear interpolation from start to end position
    const position = startPosition + timeProgress * (endPosition - startPosition);

    // Scale note size based on strength (optional visual feedback)
    const scale = 0.8 + strength * 0.4;

    return {
      position: "absolute",
      width: NOTE_SIZE * 2,
      height: NOTE_SIZE,
      left: (COLUMN_WIDTH - NOTE_SIZE * 2) / 2,
      transform: [
        { translateY: position },
        { scaleX: scale },
        { scaleY: scale },
      ],
      backgroundColor: Object.values(COLORS.primary)[column],
      borderRadius: 4,
      opacity: timeProgress > 1 ? 0 : 1, // Fade out after passing beat line
    };
  });

  return <Animated.View style={animatedStyle} />;
};

export default Note;