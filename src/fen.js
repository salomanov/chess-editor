export const EMPTY_PLACEMENT = '8/8/8/8/8/8/8/8';
export const START_PLACEMENT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

export const PIECE_SET = [
  { code: 'K', label: 'Белый король', symbol: '♔', asset: '/pieces/lichess/wK.svg' },
  { code: 'Q', label: 'Белый ферзь', symbol: '♕', asset: '/pieces/lichess/wQ.svg' },
  { code: 'R', label: 'Белая ладья', symbol: '♖', asset: '/pieces/lichess/wR.svg' },
  { code: 'B', label: 'Белый слон', symbol: '♗', asset: '/pieces/lichess/wB.svg' },
  { code: 'N', label: 'Белый конь', symbol: '♘', asset: '/pieces/lichess/wN.svg' },
  { code: 'P', label: 'Белая пешка', symbol: '♙', asset: '/pieces/lichess/wP.svg' },
  { code: 'k', label: 'Черный король', symbol: '♚', asset: '/pieces/lichess/bK.svg' },
  { code: 'q', label: 'Черный ферзь', symbol: '♛', asset: '/pieces/lichess/bQ.svg' },
  { code: 'r', label: 'Черная ладья', symbol: '♜', asset: '/pieces/lichess/bR.svg' },
  { code: 'b', label: 'Черный слон', symbol: '♝', asset: '/pieces/lichess/bB.svg' },
  { code: 'n', label: 'Черный конь', symbol: '♞', asset: '/pieces/lichess/bN.svg' },
  { code: 'p', label: 'Черная пешка', symbol: '♟', asset: '/pieces/lichess/bP.svg' },
];

export const PIECE_META = Object.fromEntries(
  PIECE_SET.map((piece) => [piece.code, piece]),
);

export function parsePlacement(placement) {
  const rows = String(placement || EMPTY_PLACEMENT).trim().split('/');
  if (rows.length !== 8) {
    throw new Error('В позиции должно быть 8 горизонталей.');
  }

  return rows.map((row) => {
    const cells = [];
    for (const char of row) {
      if (/^\d$/.test(char)) {
        const count = Number(char);
        for (let i = 0; i < count; i += 1) {
          cells.push(null);
        }
      } else if (PIECE_META[char]) {
        cells.push(char);
      } else {
        throw new Error(`Неизвестный символ в позиции: ${char}`);
      }
    }

    if (cells.length !== 8) {
      throw new Error('Каждая горизонталь должна содержать 8 клеток.');
    }

    return cells;
  });
}

export function serializeBoard(board) {
  return board
    .map((row) => {
      let empty = 0;
      let encoded = '';

      for (const cell of row) {
        if (!cell) {
          empty += 1;
          continue;
        }

        if (empty) {
          encoded += String(empty);
          empty = 0;
        }
        encoded += cell;
      }

      if (empty) {
        encoded += String(empty);
      }

      return encoded || '8';
    })
    .join('/');
}

export function cloneBoard(board) {
  return board.map((row) => [...row]);
}

export function createEmptyBoard() {
  return parsePlacement(EMPTY_PLACEMENT);
}
