import type { Board, Player } from './types';

// All possible 5-in-a-row lines on a 6×6 board
const WIN_LINES: [number, number][][] = (() => {
  const lines: [number, number][][] = [];

  // Rows: 2 starting positions per row (cols 0-4 and 1-5)
  for (let r = 0; r < 6; r++) {
    for (let cs = 0; cs <= 1; cs++) {
      lines.push([[r, cs], [r, cs+1], [r, cs+2], [r, cs+3], [r, cs+4]]);
    }
  }

  // Columns: 2 starting positions per col
  for (let c = 0; c < 6; c++) {
    for (let rs = 0; rs <= 1; rs++) {
      lines.push([[rs, c], [rs+1, c], [rs+2, c], [rs+3, c], [rs+4, c]]);
    }
  }

  // Diagonals \: top-left corner offsets (0,0) and (1,1) and (0,1) and (1,0)
  for (let rs = 0; rs <= 1; rs++) {
    for (let cs = 0; cs <= 1; cs++) {
      lines.push([[rs,cs],[rs+1,cs+1],[rs+2,cs+2],[rs+3,cs+3],[rs+4,cs+4]]);
    }
  }

  // Diagonals /: bottom-left starting positions
  for (let rs = 4; rs <= 5; rs++) {
    for (let cs = 0; cs <= 1; cs++) {
      lines.push([[rs,cs],[rs-1,cs+1],[rs-2,cs+2],[rs-3,cs+3],[rs-4,cs+4]]);
    }
  }

  return lines;
})();

export function checkWin(board: Board, player: Player): [number, number][] | null {
  for (const line of WIN_LINES) {
    if (line.every(([r, c]) => board[r][c].piece === player)) {
      return line as [number, number][];
    }
  }
  return null;
}

export function largestGroup(board: Board, player: Player): number {
  const visited = Array.from({ length: 6 }, () => Array(6).fill(false));
  let max = 0;

  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      if (board[r][c].piece === player && !visited[r][c]) {
        let size = 0;
        const queue: [number, number][] = [[r, c]];
        visited[r][c] = true;
        while (queue.length) {
          const [cr, cc] = queue.shift()!;
          size++;
          for (const [dr, dc] of [[0,1],[0,-1],[1,0],[-1,0]] as [number,number][]) {
            const nr = cr + dr, nc = cc + dc;
            if (nr >= 0 && nr < 6 && nc >= 0 && nc < 6 && !visited[nr][nc] && board[nr][nc].piece === player) {
              visited[nr][nc] = true;
              queue.push([nr, nc]);
            }
          }
        }
        max = Math.max(max, size);
      }
    }
  }
  return max;
}
