export interface ZoomPanState {
  startIndex: number;
  endIndex: number;
  isDragging: boolean;
  dragStartX: number;
  dragStartStart: number;
  dragStartEnd: number;
}

export function createInitialZoomState(barCount: number, visibleBars: number = 200): ZoomPanState {
  const end = barCount - 1;
  const start = Math.max(0, end - visibleBars);
  return {
    startIndex: start,
    endIndex: end,
    isDragging: false,
    dragStartX: 0,
    dragStartStart: 0,
    dragStartEnd: 0,
  };
}

export function handleWheel(
  state: ZoomPanState,
  deltaY: number,
  mouseX: number,
  chartLeft: number,
  chartWidth: number,
  barCount: number,
): ZoomPanState {
  const { startIndex, endIndex } = state;
  const range = endIndex - startIndex;
  const minRange = 10;
  const maxRange = barCount;

  // Mouse position as fraction of chart width
  const frac = Math.max(0, Math.min(1, (mouseX - chartLeft) / chartWidth));

  const zoomFactor = deltaY > 0 ? 1.15 : 0.87;
  let newRange = range * zoomFactor;
  newRange = Math.max(minRange, Math.min(maxRange, newRange));

  const delta = newRange - range;
  let newStart = startIndex - delta * frac;
  let newEnd = newStart + newRange;

  // Clamp
  if (newStart < 0) { newStart = 0; newEnd = newRange; }
  if (newEnd > barCount - 1) { newEnd = barCount - 1; newStart = newEnd - newRange; }
  if (newStart < 0) newStart = 0;

  return { ...state, startIndex: newStart, endIndex: newEnd };
}

export function handleDragStart(
  state: ZoomPanState,
  mouseX: number,
): ZoomPanState {
  return {
    ...state,
    isDragging: true,
    dragStartX: mouseX,
    dragStartStart: state.startIndex,
    dragStartEnd: state.endIndex,
  };
}

export function handleDragMove(
  state: ZoomPanState,
  mouseX: number,
  chartWidth: number,
  barCount: number,
): ZoomPanState {
  if (!state.isDragging) return state;
  const range = state.dragStartEnd - state.dragStartStart;
  const dx = mouseX - state.dragStartX;
  const indexDelta = -(dx / chartWidth) * range;

  let newStart = state.dragStartStart + indexDelta;
  let newEnd = state.dragStartEnd + indexDelta;

  if (newStart < 0) { newStart = 0; newEnd = range; }
  if (newEnd > barCount - 1) { newEnd = barCount - 1; newStart = newEnd - range; }
  if (newStart < 0) newStart = 0;

  return { ...state, startIndex: newStart, endIndex: newEnd };
}

export function handleDragEnd(state: ZoomPanState): ZoomPanState {
  return { ...state, isDragging: false };
}
