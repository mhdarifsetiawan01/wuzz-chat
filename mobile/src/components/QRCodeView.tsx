/**
 * WuzzChat Mobile UI - Pure React Native QRCodeView Component
 * Renders QR Code 2D matrix directly as high-contrast scalable View modules.
 * Zero native linking dependencies, 100% compatible on iOS, Android, and Web.
 */

import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { generateQRMatrix } from '../services/qrCodeService';

export interface QRCodeViewProps {
  value: string;
  size?: number;
  color?: string;
  backgroundColor?: string;
  padding?: number;
}

export const QRCodeView: React.FC<QRCodeViewProps> = ({
  value,
  size = 200,
  color = '#0b141a',
  backgroundColor = '#ffffff',
  padding = 12,
}) => {
  const matrix = useMemo(() => {
    if (!value) return [];
    try {
      return generateQRMatrix(value);
    } catch (err) {
      console.warn('[QRCodeView] Failed to generate matrix:', err);
      return [];
    }
  }, [value]);

  const matrixSize = matrix.length;
  if (!matrixSize) {
    return <View style={[styles.container, { width: size, height: size, backgroundColor }]} />;
  }

  // Calculate pixel size per module
  const innerSize = size - padding * 2;
  const moduleSize = innerSize / matrixSize;

  return (
    <View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          padding,
          backgroundColor,
        },
      ]}
    >
      <View style={{ width: innerSize, height: innerSize }}>
        {matrix.map((row, rIdx) => (
          <View key={`row-${rIdx}`} style={[styles.row, { height: moduleSize }]}>
            {row.map((isDark, cIdx) => (
              <View
                key={`col-${cIdx}`}
                style={{
                  width: moduleSize,
                  height: moduleSize,
                  backgroundColor: isDark ? color : backgroundColor,
                }}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  row: {
    flexDirection: 'row',
  },
});
