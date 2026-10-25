/**
 * Grid Wuzz Grid: wilayah berwarna + nomor wilayah (agar tidak bergantung pada warna), garis tebal pada
 * batas wilayah, bintang/X berupa ikon vektor (bukan emoji, aman dari teks terpotong Android 16),
 * dan konflik disorot merah. Ukuran sel dihitung dari lebar layar sehingga 9x9 muat di HP kecil.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Icon } from '../Icon';
import { useTheme } from '../../theme';
import {
  Board,
  MARK_STAR,
  MARK_X,
  cellBorders,
  regionLabelCells,
} from '../../utils/gameBoard';

/** Sembilan warna wilayah; terang untuk tema terang, redup untuk tema gelap. */
const LIGHT_REGION_COLORS = [
  '#bfdbfe', '#fde68a', '#bbf7d0', '#fecaca', '#ddd6fe',
  '#fed7aa', '#a5f3fc', '#fbcfe8', '#e2e8f0',
];
const DARK_REGION_COLORS = [
  '#1e3a5f', '#5c4a14', '#14532d', '#5b2121', '#3b2f6b',
  '#6b3a12', '#134e5e', '#5b2145', '#334155',
];

const BOUNDARY_WIDTH = 2;
const INNER_WIDTH = StyleSheet.hairlineWidth;

export interface GameGridProps {
  regions: number[][];
  board: Board;
  conflicts: boolean[][];
  cellSize: number;
  disabled?: boolean;
  onTapCell: (row: number, col: number) => void;
}

const MARK_LABELS = ['kosong', 'tanda X', 'bintang'];

export const GameGrid: React.FC<GameGridProps> = React.memo(
  ({ regions, board, conflicts, cellSize, disabled = false, onTapCell }) => {
    const { colors, isDark } = useTheme();
    const palette = isDark ? DARK_REGION_COLORS : LIGHT_REGION_COLORS;
    const labels = useMemo(() => regionLabelCells(regions), [regions]);
    const size = regions.length;
    const iconSize = Math.max(14, Math.floor(cellSize * 0.58));
    const labelSize = Math.max(8, Math.floor(cellSize * 0.26));

    return (
      <View
        style={{ width: cellSize * size, height: cellSize * size }}
        accessibilityLabel={`Papan Wuzz Grid ${size} kali ${size}`}
      >
        {regions.map((row, r) => (
          <View key={r} style={styles.row}>
            {row.map((regionId, c) => {
              const b = cellBorders(regions, r, c);
              const mark = board[r]?.[c] ?? 0;
              const bad = conflicts[r]?.[c] ?? false;
              const label = labels.get(`${r},${c}`);
              return (
                <TouchableOpacity
                  key={c}
                  activeOpacity={0.7}
                  disabled={disabled}
                  onPress={() => onTapCell(r, c)}
                  accessibilityRole="button"
                  accessibilityLabel={`Baris ${r + 1}, kolom ${c + 1}, wilayah ${regionId + 1}, ${MARK_LABELS[mark]}${bad ? ', bentrok' : ''}`}
                  style={[
                    styles.cell,
                    {
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: palette[regionId % palette.length],
                      borderColor: colors.textPrimary,
                      borderTopWidth: b.top ? BOUNDARY_WIDTH : INNER_WIDTH,
                      borderLeftWidth: b.left ? BOUNDARY_WIDTH : INNER_WIDTH,
                      // Sisi kanan/bawah hanya digambar di tepi grid; batas dalam digambar sel tetangganya.
                      borderRightWidth: c === size - 1 ? BOUNDARY_WIDTH : 0,
                      borderBottomWidth: r === size - 1 ? BOUNDARY_WIDTH : 0,
                    },
                    bad && { backgroundColor: colors.dangerFill + '55' },
                  ]}
                >
                  {label !== undefined ? (
                    <Text
                      allowFontScaling={false}
                      style={[styles.regionLabel, { fontSize: labelSize, color: colors.textPrimary }]}
                    >
                      {label}
                    </Text>
                  ) : null}
                  {mark === MARK_STAR ? (
                    <Icon
                      name="star"
                      active
                      size={iconSize}
                      color={bad ? colors.dangerFill : colors.textPrimary}
                    />
                  ) : null}
                  {mark === MARK_X ? (
                    <Icon name="close" size={Math.floor(iconSize * 0.8)} color={colors.textSecondary} />
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    );
  }
);
GameGrid.displayName = 'GameGrid';

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  cell: { alignItems: 'center', justifyContent: 'center' },
  regionLabel: { position: 'absolute', top: 1, left: 3, fontWeight: '700', opacity: 0.75 },
});
