/**
 * WuzzChat Mobile - TypingDots
 * Tiga titik berdenyut berurutan di samping teks "sedang mengetik".
 */

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

interface TypingDotsProps {
  color: string;
  size?: number;
}

const DOT_COUNT = 3;
const STEP_MS = 160;

export const TypingDots: React.FC<TypingDotsProps> = ({ color, size = 4 }) => {
  const opacities = useRef(Array.from({ length: DOT_COUNT }, () => new Animated.Value(0.25))).current;

  useEffect(() => {
    const loops = opacities.map((value, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * STEP_MS),
          Animated.timing(value, { toValue: 1, duration: STEP_MS * 2, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0.25, duration: STEP_MS * 2, useNativeDriver: true }),
          Animated.delay((DOT_COUNT - index - 1) * STEP_MS),
        ])
      )
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [opacities]);

  return (
    <View style={styles.row} accessibilityElementsHidden importantForAccessibility="no">
      {opacities.map((opacity, index) => (
        <Animated.View
          key={index}
          style={[
            { width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity },
            index > 0 && styles.gap,
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
    marginTop: 2,
  },
  gap: {
    marginLeft: 3,
  },
});
