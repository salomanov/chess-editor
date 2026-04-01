import { useEffect, useMemo, useRef, useState } from 'react';
import readXlsxFile from 'read-excel-file/browser';
import writeXlsxFile from 'write-excel-file/browser';
import {
  EMPTY_PLACEMENT,
  FILES,
  PIECE_META,
  PIECE_SET,
  START_PLACEMENT,
  cloneBoard,
  createEmptyBoard,
  parsePlacement,
  serializeBoard,
} from './fen.js';

const TARGET_HEADERS = ['Номер', 'Позиция', 'ход'];
const BLACK_SPARE_PIECES = PIECE_SET.filter(({ code }) => code === code.toLowerCase());
const WHITE_SPARE_PIECES = PIECE_SET.filter(({ code }) => code === code.toUpperCase());

function createPosition(overrides = {}) {
  return {
    id:
      globalThis.crypto?.randomUUID?.() ??
      `position-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    placement: EMPTY_PLACEMENT,
    turn: 'w',
    ...overrides,
  };
}

function buildFullFen(position) {
  if (!position) {
    return `${EMPTY_PLACEMENT} w - - 0 1`;
  }

  return [position.placement, position.turn, '-', '-', '0', '1'].join(' ');
}

function normalizeRows(rows) {
  return rows
    .filter((row) => {
      const [, placement, turn] = row;
      return placement || turn;
    })
    .map((row) => {
      const [, placement, turn] = row;
      const safePlacement = String(placement || EMPTY_PLACEMENT).trim() || EMPTY_PLACEMENT;
      const safeTurn = String(turn || 'w').trim().toLowerCase() === 'b' ? 'b' : 'w';

      try {
        parsePlacement(safePlacement);
      } catch (error) {
        throw new Error(
          `Строка с позицией "${safePlacement}" содержит некорректный FEN: ${error.message}`,
        );
      }

      return createPosition({
        placement: safePlacement,
        turn: safeTurn,
      });
    });
}

function findPositionsSheet(sheets) {
  for (const sheet of sheets) {
    const header = sheet.data[0]?.map((value) => String(value ?? '').trim());
    const matches = TARGET_HEADERS.every((title, index) => header?.[index] === title);
    if (matches) {
      return {
        sheetName: sheet.sheet,
        rows: sheet.data,
      };
    }
  }

  return null;
}

function ensureXlsxExtension(fileName) {
  return /\.xlsx$/i.test(fileName) ? fileName : `${fileName}.xlsx`;
}

function moveItem(array, fromIndex, toIndex) {
  const next = [...array];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function Board({
  board,
  paletteSelection,
  dragState,
  onSquareClick,
  onPiecePointerDown,
  onClearSquare,
}) {
  return (
    <div className="board-wrap">
      <div className="board">
        {board.map((row, rowIndex) =>
          row.map((piece, colIndex) => {
            const key = `${rowIndex}-${colIndex}`;
            const isDark = (rowIndex + colIndex) % 2 === 1;
            const isDraggedPiece =
              dragState?.type === 'move' &&
              dragState.row === rowIndex &&
              dragState.col === colIndex;

            return (
              <button
                key={key}
                type="button"
                className={['square', isDark ? 'square-dark' : 'square-light'].join(' ')}
                data-square="true"
                data-row={rowIndex}
                data-col={colIndex}
                onClick={() => onSquareClick(rowIndex, colIndex)}
                onDoubleClick={() => onClearSquare(rowIndex, colIndex)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onClearSquare(rowIndex, colIndex);
                }}
                aria-label={`Клетка ${FILES[colIndex]}${8 - rowIndex}`}
              >
                <span
                  className={[
                    'square-rank',
                    isDark ? 'square-coord-on-dark' : 'square-coord-on-light',
                  ].join(' ')}
                >
                  {colIndex === 0 ? 8 - rowIndex : ''}
                </span>
                <span
                  className={[
                    'square-file',
                    isDark ? 'square-coord-on-dark' : 'square-coord-on-light',
                  ].join(' ')}
                >
                  {rowIndex === 7 ? FILES[colIndex] : ''}
                </span>
                {piece ? (
                  <img
                    className={
                      isDraggedPiece ? 'piece-image piece-image-dragged' : 'piece-image'
                    }
                    draggable={false}
                    src={PIECE_META[piece].asset}
                    alt={PIECE_META[piece].label}
                    onPointerDown={(event) =>
                      onPiecePointerDown(event, {
                        type: 'move',
                        piece,
                        row: rowIndex,
                        col: colIndex,
                      })
                    }
                  />
                ) : paletteSelection ? (
                  paletteSelection === 'erase' ? (
                    <span className="ghost-piece ghost-piece-erase">✕</span>
                  ) : (
                    <img
                      className="ghost-piece-image"
                      src={PIECE_META[paletteSelection]?.asset}
                      alt=""
                    />
                  )
                ) : null}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}

function SpareRow({
  pieces,
  paletteSelection,
  onSelect,
  onPiecePointerDown,
  includeErase = false,
}) {
  return (
    <div className="spare-row">
      {pieces.map((piece) => (
        <button
          key={piece.code}
          type="button"
          onPointerDown={(event) =>
            onPiecePointerDown(event, { type: 'add', piece: piece.code })
          }
          onClick={() => onSelect(piece.code)}
          className={
            paletteSelection === piece.code ? 'spare-piece spare-piece-active' : 'spare-piece'
          }
          title={piece.label}
          aria-label={piece.label}
        >
          <img src={piece.asset} alt="" className="spare-piece-image" />
        </button>
      ))}
      {includeErase ? (
        <button
          type="button"
          data-erase-button="true"
          onClick={() => onSelect('erase')}
          className={
            paletteSelection === 'erase'
              ? 'spare-piece spare-piece-active spare-piece-erase'
              : 'spare-piece spare-piece-erase'
          }
          title="Очистить клетку"
          aria-label="Очистить клетку"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

export default function App() {
  const [positions, setPositions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [workbookName, setWorkbookName] = useState('positions-edited.xlsx');
  const [sheetName, setSheetName] = useState('positions');
  const [status, setStatus] = useState('Выберите Excel-файл, чтобы загрузить список позиций.');
  const [error, setError] = useState('');
  const [paletteSelection, setPaletteSelection] = useState(null);
  const [dragState, setDragState] = useState(null);
  const [draggedListId, setDraggedListId] = useState(null);

  const fileInputRef = useRef(null);
  const workbookSheetsRef = useRef(null);
  const dragSessionRef = useRef(null);
  const suppressClickRef = useRef(false);

  const selectedIndex = positions.findIndex((position) => position.id === selectedId);
  const selectedPosition = selectedIndex >= 0 ? positions[selectedIndex] : null;
  const selectedBoard = useMemo(() => {
    if (!selectedPosition) {
      return createEmptyBoard();
    }

    return parsePlacement(selectedPosition.placement);
  }, [selectedPosition]);
  const fullFen = useMemo(() => buildFullFen(selectedPosition), [selectedPosition]);

  useEffect(() => {
    if (!positions.length) {
      setSelectedId(null);
      return;
    }

    if (!positions.some((position) => position.id === selectedId)) {
      setSelectedId(positions[0].id);
    }
  }, [positions, selectedId]);

  useEffect(
    () => () => {
      const session = dragSessionRef.current;
      if (!session) {
        return;
      }

      window.removeEventListener('pointermove', session.onMove);
      window.removeEventListener('pointerup', session.onUp);
      window.removeEventListener('pointercancel', session.onUp);
    },
    [],
  );

  function updateCurrentPosition(updater) {
    if (!selectedPosition) {
      return;
    }

    setPositions((current) =>
      current.map((position) => (position.id === selectedId ? updater(position) : position)),
    );
  }

  async function handleFileSelect(event) {
    const [file] = event.target.files || [];
    if (!file) {
      return;
    }

    try {
      setError('');
      const sheets = await readXlsxFile(file);
      const result = findPositionsSheet(sheets);

      if (!result) {
        throw new Error(
          'Не найден лист с заголовками "Номер", "Позиция", "ход".',
        );
      }

      const importedPositions = normalizeRows(result.rows.slice(1));
      if (!importedPositions.length) {
        importedPositions.push(createPosition());
      }

      workbookSheetsRef.current = sheets;
      setWorkbookName(file.name.replace(/\.xlsx$/i, '') + '-edited.xlsx');
      setSheetName(result.sheetName);
      setPositions(importedPositions);
      setSelectedId(importedPositions[0].id);
      setPaletteSelection(null);
      setStatus(`Загружено ${importedPositions.length} позиций из листа "${result.sheetName}".`);
    } catch (loadError) {
      setError(loadError.message);
      setStatus('Файл не был загружен.');
    } finally {
      event.target.value = '';
    }
  }

  function commitBoard(nextBoard) {
    updateCurrentPosition((position) => ({
      ...position,
      placement: serializeBoard(nextBoard),
    }));
  }

  function placePieceAt(row, col, piece) {
    const nextBoard = cloneBoard(selectedBoard);
    nextBoard[row][col] = piece;
    commitBoard(nextBoard);
  }

  function clearSquare(row, col) {
    const nextBoard = cloneBoard(selectedBoard);
    nextBoard[row][col] = null;
    commitBoard(nextBoard);
  }

  function movePiece(fromRow, fromCol, toRow, toCol) {
    const nextBoard = cloneBoard(selectedBoard);
    const piece = nextBoard[fromRow][fromCol];
    if (!piece) {
      return;
    }

    nextBoard[fromRow][fromCol] = null;
    nextBoard[toRow][toCol] = piece;
    commitBoard(nextBoard);
  }

  function handleSquareClick(row, col) {
    if (!selectedPosition || suppressClickRef.current || !paletteSelection) {
      return;
    }

    if (paletteSelection === 'erase') {
      clearSquare(row, col);
    } else {
      placePieceAt(row, col, paletteSelection);
    }
  }

  function clearDragSession() {
    const session = dragSessionRef.current;
    if (!session) {
      return;
    }

    window.removeEventListener('pointermove', session.onMove);
    window.removeEventListener('pointerup', session.onUp);
    window.removeEventListener('pointercancel', session.onUp);
    dragSessionRef.current = null;
  }

  function suppressClickOnce() {
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }

  function finishPointerDrag(payload, clientX, clientY) {
    const target = document.elementFromPoint(clientX, clientY);
    const eraseButton = target?.closest?.('[data-erase-button="true"]');
    if (eraseButton && payload.type === 'move') {
      clearSquare(payload.row, payload.col);
      return;
    }

    const square = target?.closest?.('[data-square="true"]');
    if (!square) {
      return;
    }

    const row = Number(square.dataset.row);
    const col = Number(square.dataset.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      return;
    }

    if (payload.type === 'move') {
      movePiece(payload.row, payload.col, row, col);
    }

    if (payload.type === 'add') {
      placePieceAt(row, col, payload.piece);
    }
  }

  function handlePiecePointerDown(event, payload) {
    if (event.button !== 0 || !selectedPosition) {
      return;
    }

    event.preventDefault();
    clearDragSession();
    setError('');

    const rect = event.currentTarget.getBoundingClientRect();
    const session = {
      started: false,
      payload,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      onMove: null,
      onUp: null,
    };

    session.onMove = (moveEvent) => {
      const dx = moveEvent.clientX - session.startX;
      const dy = moveEvent.clientY - session.startY;

      if (!session.started && Math.hypot(dx, dy) >= 6) {
        session.started = true;
        setPaletteSelection(null);
        setDragState({
          ...payload,
          x: moveEvent.clientX,
          y: moveEvent.clientY,
          offsetX: session.offsetX,
          offsetY: session.offsetY,
          width: session.width,
          height: session.height,
        });
      }

      if (!session.started) {
        return;
      }

      setDragState((current) =>
        current
          ? {
              ...current,
              x: moveEvent.clientX,
              y: moveEvent.clientY,
            }
          : current,
      );
    };

    session.onUp = (upEvent) => {
      const wasDragging = session.started;

      clearDragSession();
      setDragState(null);

      if (!wasDragging) {
        if (payload.type === 'add') {
          setPaletteSelection((current) => (current === payload.piece ? null : payload.piece));
        }
        return;
      }

      finishPointerDrag(payload, upEvent.clientX, upEvent.clientY);
      suppressClickOnce();
    };

    dragSessionRef.current = session;
    window.addEventListener('pointermove', session.onMove);
    window.addEventListener('pointerup', session.onUp);
    window.addEventListener('pointercancel', session.onUp);
  }

  function addPosition() {
    const nextPosition = createPosition();
    setPositions((current) => {
      if (!current.length) {
        return [nextPosition];
      }

      const insertAt = selectedIndex >= 0 ? selectedIndex + 1 : current.length;
      const next = [...current];
      next.splice(insertAt, 0, nextPosition);
      return next;
    });
    setSelectedId(nextPosition.id);
    setStatus('Добавлена новая пустая позиция.');
  }

  function removePosition() {
    if (!selectedPosition) {
      return;
    }

    const confirmDelete = window.confirm('Удалить выбранную позицию?');
    if (!confirmDelete) {
      return;
    }

    setPositions((current) => current.filter((position) => position.id !== selectedId));
    setStatus('Позиция удалена.');
  }

  async function exportWorkbook() {
    if (!positions.length) {
      setError('Нет данных для экспорта.');
      return;
    }

    try {
      setError('');
      const rows = [
        TARGET_HEADERS,
        ...positions.map((position, index) => [index + 1, position.placement, position.turn]),
      ];

      const sourceSheets = workbookSheetsRef.current ? [...workbookSheetsRef.current] : [];
      const nextSheets = sourceSheets.length
        ? sourceSheets.map((sheet) =>
            sheet.sheet === sheetName ? { ...sheet, data: rows } : sheet,
          )
        : [{ sheet: sheetName, data: rows }];

      if (!nextSheets.some((sheet) => sheet.sheet === sheetName)) {
        nextSheets.unshift({ sheet: sheetName, data: rows });
      }

      await writeXlsxFile(
        nextSheets.map((sheet) => sheet.data),
        {
          sheets: nextSheets.map((sheet) => sheet.sheet),
          fileName: ensureXlsxExtension(workbookName || 'positions-edited.xlsx'),
        },
      );

      setStatus('Excel-файл подготовлен и сохранен через браузер.');
    } catch (saveError) {
      setError(saveError.message || 'Не удалось сохранить Excel-файл.');
    }
  }

  function loadStartingPosition() {
    updateCurrentPosition((position) => ({
      ...position,
      placement: START_PLACEMENT,
      turn: 'w',
    }));
  }

  function clearCurrentBoard() {
    updateCurrentPosition((position) => ({
      ...position,
      placement: EMPTY_PLACEMENT,
    }));
  }

  function handleListDrop(targetId) {
    if (!draggedListId || draggedListId === targetId) {
      setDraggedListId(null);
      return;
    }

    setPositions((current) => {
      const fromIndex = current.findIndex((position) => position.id === draggedListId);
      const toIndex = current.findIndex((position) => position.id === targetId);
      if (fromIndex < 0 || toIndex < 0) {
        return current;
      }

      return moveItem(current, fromIndex, toIndex);
    });

    setDraggedListId(null);
  }

  return (
    <div className="page-shell">
      <header className="hero">
        <div className="hero-copy">
          <h1>Редактор позиций</h1>
        </div>
        <div className="hero-actions">
          <button
            type="button"
            className="primary-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            Выбрать Excel
          </button>
          <button type="button" className="secondary-btn" onClick={exportWorkbook}>
            Сохранить в Excel
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            hidden
            onChange={handleFileSelect}
          />
        </div>
      </header>

      <div className="status-bar">
        <span className="status-label">{status}</span>
        <span className="status-file">
          {sheetName} · {workbookName}
        </span>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      <main className="workspace">
        <section className="panel panel-board">
          <div className="board-inline-head">
            <span className="board-inline-title">
              {selectedPosition ? `Позиция ${selectedIndex + 1}` : 'Нет выбранной позиции'}
            </span>
            <span className="board-inline-fen">{fullFen}</span>
          </div>

          <div className="board-layout">
            <div className="board-stage">
              <SpareRow
                pieces={BLACK_SPARE_PIECES}
                paletteSelection={paletteSelection}
                onSelect={setPaletteSelection}
                onPiecePointerDown={handlePiecePointerDown}
                includeErase
              />

              <Board
                board={selectedBoard}
                paletteSelection={paletteSelection}
                dragState={dragState}
                onSquareClick={handleSquareClick}
                onPiecePointerDown={handlePiecePointerDown}
                onClearSquare={clearSquare}
              />

              <SpareRow
                pieces={WHITE_SPARE_PIECES}
                paletteSelection={paletteSelection}
                onSelect={setPaletteSelection}
                onPiecePointerDown={handlePiecePointerDown}
                includeErase
              />
            </div>

            <aside className="board-toolbar">
              <label className="field-label board-toolbar-label" htmlFor="turn-select">
                Ход
              </label>
              <select
                id="turn-select"
                className="editor-select board-toolbar-select"
                value={selectedPosition?.turn ?? 'w'}
                onChange={(event) =>
                  updateCurrentPosition((position) => ({
                    ...position,
                    turn: event.target.value,
                  }))
                }
                disabled={!selectedPosition}
              >
                <option value="w">Ход белых</option>
                <option value="b">Ход черных</option>
              </select>

              <button
                type="button"
                className="secondary-btn wide-btn"
                onClick={loadStartingPosition}
                disabled={!selectedPosition}
              >
                Начальная позиция
              </button>
              <button
                type="button"
                className="secondary-btn wide-btn"
                onClick={clearCurrentBoard}
                disabled={!selectedPosition}
              >
                Очистить доску
              </button>
              <button
                type="button"
                className="secondary-btn wide-btn"
                onClick={() => setPaletteSelection(null)}
              >
                Сбросить выбор
              </button>

              <div className="selection-state">
                {paletteSelection === 'erase'
                  ? 'Выбрано: очистка клетки'
                  : paletteSelection
                    ? `Выбрано: ${PIECE_META[paletteSelection].label}`
                    : 'Выбор фигуры отключен'}
              </div>
            </aside>
          </div>
        </section>

        <section className="panel panel-list">
          <div className="panel-head">
            <div className="list-inline-head">
              <span className="list-inline-title">Позиции</span>
            </div>
            <div className="inline-actions">
              <button type="button" className="chip-btn" onClick={addPosition}>
                Новая позиция
              </button>
              <button
                type="button"
                className="chip-btn danger"
                onClick={removePosition}
                disabled={!selectedPosition}
              >
                Удалить
              </button>
            </div>
          </div>

          <div className="list-meta">
            <span>{positions.length} записей</span>
            <span>Drag & drop или кнопки вверх/вниз</span>
          </div>

          <div className="position-list">
            {positions.map((position, index) => {
              const isActive = position.id === selectedId;
              return (
                <div
                  key={position.id}
                  className={[
                    'position-card',
                    isActive ? 'position-card-active' : '',
                    draggedListId === position.id ? 'position-card-dragging' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  draggable
                  onDragStart={() => setDraggedListId(position.id)}
                  onDragEnd={() => setDraggedListId(null)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => handleListDrop(position.id)}
                >
                  <button
                    type="button"
                    className="position-select"
                    onClick={() => setSelectedId(position.id)}
                  >
                    <span className="position-index">{index + 1}</span>
                    <span className="position-lines">
                      <strong>{position.turn === 'w' ? 'Ход белых' : 'Ход черных'}</strong>
                      <span>{position.placement}</span>
                    </span>
                  </button>

                  <div className="sort-buttons">
                    <button
                      type="button"
                      className="sort-btn"
                      onClick={() => {
                        setSelectedId(position.id);
                        if (index > 0) {
                          setPositions((current) => moveItem(current, index, index - 1));
                        }
                      }}
                      aria-label="Переместить выше"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="sort-btn"
                      onClick={() => {
                        setSelectedId(position.id);
                        if (index < positions.length - 1) {
                          setPositions((current) => moveItem(current, index, index + 1));
                        }
                      }}
                      aria-label="Переместить ниже"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {dragState ? (
        <div
          className="piece-drag-overlay"
          style={{
            width: `${dragState.width}px`,
            height: `${dragState.height}px`,
            transform: `translate(${dragState.x - dragState.offsetX}px, ${dragState.y - dragState.offsetY}px)`,
          }}
        >
          <img src={PIECE_META[dragState.piece].asset} alt="" />
        </div>
      ) : null}
    </div>
  );
}
