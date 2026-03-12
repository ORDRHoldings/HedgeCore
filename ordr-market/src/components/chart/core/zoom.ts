/**
 * zoom.ts -- Smooth zoom/pan animation system
 *
 * Lerp-based animation with momentum (inertia) on drag release.
 * All state transitions are pure functions; the render loop calls
 * tickAnimation() each frame to converge current toward target.
 */

export interface ZoomPanState {
  // Current (rendered) values
  startIndex: number;
  endIndex: number;
  // Animation targets
  targetStart: number;
  targetEnd: number;
  // Drag state
  isDragging: boolean;
  dragStartX: number;
  dragStartStart: number;
  dragStartEnd: number;
  // Momentum (horizontal)
  velocityX: number;
  lastDragX: number;
  lastDragTime: number;
  // Vertical panning
  priceOffset: number;    // Vertical price shift in price units
  priceVelocity: number;  // Vertical momentum
  lastDragY: number;      // Last pointer Y for velocity tracking
  dragStartY: number;     // Pointer Y at drag start
  // Animation flag
  isAnimating: boolean;
}

const LERP_ZOOM = 0.22;      // Zoom smoothing (higher = snappier)
const LERP_MOMENTUM = 0.15;  // Momentum smoothing
const VELOCITY_DECAY = 0.92;  // Friction (lower = stops sooner)
const VELOCITY_MIN = 0.05;    // Stop threshold (higher = stops earlier, less float)
const EPSILON = 0.01;         // Animation complete threshold
const RIGHT_MARGIN = 1.0;    // Allow scrolling 100% past last bar (full screen of future space like TradingView)

export function createInitialZoomState(barCount: number, visibleBars = 200): ZoomPanState {
  const end = Math.max(0, barCount - 1);
  const start = Math.max(0, end - visibleBars);
  return {
    startIndex: start, endIndex: end,
    targetStart: start, targetEnd: end,
    isDragging: false, dragStartX: 0, dragStartStart: 0, dragStartEnd: 0,
    velocityX: 0, lastDragX: 0, lastDragTime: 0,
    priceOffset: 0, priceVelocity: 0, lastDragY: 0, dragStartY: 0,
    isAnimating: false,
  };
}

export function tickAnimation(state: ZoomPanState, barCount: number): ZoomPanState {
  let { startIndex, endIndex, targetStart, targetEnd, velocityX, isDragging } = state;
  let { priceOffset, priceVelocity } = state;

  if (isDragging) return state; // Don't animate during drag

  // Apply horizontal momentum
  if (Math.abs(velocityX) > VELOCITY_MIN) {
    const range = targetEnd - targetStart;
    const maxEnd = barCount - 1 + range * RIGHT_MARGIN;
    targetStart += velocityX;
    targetEnd += velocityX;
    velocityX *= VELOCITY_DECAY;

    // Clamp targets (allow future space past last bar)
    if (targetStart < 0) { targetStart = 0; targetEnd = range; velocityX = 0; }
    if (targetEnd > maxEnd) { targetEnd = maxEnd; targetStart = targetEnd - range; velocityX = 0; }
    if (targetStart < 0) targetStart = 0;
  } else {
    velocityX = 0;
  }

  // Apply vertical momentum
  if (Math.abs(priceVelocity) > VELOCITY_MIN * 0.0001) {
    priceOffset += priceVelocity;
    priceVelocity *= VELOCITY_DECAY;
  } else {
    priceVelocity = 0;
  }

  // Lerp toward targets
  const factor = Math.abs(velocityX) > VELOCITY_MIN ? LERP_MOMENTUM : LERP_ZOOM;
  const newStart = startIndex + (targetStart - startIndex) * factor;
  const newEnd = endIndex + (targetEnd - endIndex) * factor;

  const deltaStart = Math.abs(newStart - targetStart);
  const deltaEnd = Math.abs(newEnd - targetEnd);
  const stillAnimating = deltaStart > EPSILON || deltaEnd > EPSILON
    || Math.abs(velocityX) > VELOCITY_MIN
    || Math.abs(priceVelocity) > VELOCITY_MIN * 0.0001;

  return {
    ...state,
    startIndex: stillAnimating ? newStart : targetStart,
    endIndex: stillAnimating ? newEnd : targetEnd,
    targetStart, targetEnd,
    velocityX,
    priceOffset,
    priceVelocity,
    isAnimating: stillAnimating,
  };
}

export function handleWheel(
  state: ZoomPanState, deltaY: number, mouseX: number,
  chartLeft: number, chartWidth: number, barCount: number,
): ZoomPanState {
  const { targetStart, targetEnd } = state;
  const range = targetEnd - targetStart;
  const minRange = 10;
  const maxRange = barCount;
  const frac = Math.max(0, Math.min(1, (mouseX - chartLeft) / chartWidth));
  const maxEnd = barCount - 1 + range * RIGHT_MARGIN; // Allow future space

  const zoomFactor = deltaY > 0 ? 1.12 : 0.89;
  let newRange = range * zoomFactor;
  newRange = Math.max(minRange, Math.min(maxRange, newRange));

  const delta = newRange - range;
  let newStart = targetStart - delta * frac;
  let newEnd = newStart + newRange;

  if (newStart < 0) { newStart = 0; newEnd = newRange; }
  if (newEnd > maxEnd) { newEnd = maxEnd; newStart = newEnd - newRange; }
  if (newStart < 0) newStart = 0;

  return { ...state, targetStart: newStart, targetEnd: newEnd, isAnimating: true, velocityX: 0 };
}

export function handleDragStart(state: ZoomPanState, mouseX: number, mouseY = 0): ZoomPanState {
  return {
    ...state,
    isDragging: true,
    dragStartX: mouseX,
    dragStartY: mouseY,
    dragStartStart: state.startIndex,
    dragStartEnd: state.endIndex,
    lastDragX: mouseX,
    lastDragY: mouseY,
    lastDragTime: performance.now(),
    velocityX: 0,
    priceVelocity: 0,
  };
}

export function handleDragMove(
  state: ZoomPanState, mouseX: number, chartWidth: number, barCount: number,
  mouseY = 0, mainHeight = 0, priceRange = 0,
): ZoomPanState {
  if (!state.isDragging) return state;
  const range = state.dragStartEnd - state.dragStartStart;
  const maxEnd = barCount - 1 + range * RIGHT_MARGIN; // Allow future space
  const dx = mouseX - state.dragStartX;
  const indexDelta = -(dx / chartWidth) * range;

  let newStart = state.dragStartStart + indexDelta;
  let newEnd = state.dragStartEnd + indexDelta;
  if (newStart < 0) { newStart = 0; newEnd = range; }
  if (newEnd > maxEnd) { newEnd = maxEnd; newStart = newEnd - range; }
  if (newStart < 0) newStart = 0;

  // Track velocity for momentum after release
  const now = performance.now();
  const dt = now - state.lastDragTime;
  // Only track velocity if enough time has passed (avoid spikes from fast events)
  const vel = dt > 2 ? ((mouseX - state.lastDragX) / chartWidth) * range * (-16 / Math.max(dt, 8)) : state.velocityX;

  // Vertical panning: convert dy pixels to price offset
  let newPriceOffset = state.priceOffset;
  let pVel = state.priceVelocity;
  if (mainHeight > 0 && priceRange > 0) {
    const dy = mouseY - state.lastDragY;
    const priceShift = (dy / mainHeight) * priceRange;
    newPriceOffset += priceShift;
    // Track vertical velocity
    pVel = dt > 2 ? ((mouseY - state.lastDragY) / mainHeight) * priceRange * (16 / Math.max(dt, 8)) : state.priceVelocity;
    pVel = pVel * 0.25 + state.priceVelocity * 0.75;
  }

  return {
    ...state,
    startIndex: newStart, endIndex: newEnd,
    targetStart: newStart, targetEnd: newEnd,
    lastDragX: mouseX, lastDragY: mouseY, lastDragTime: now,
    velocityX: vel * 0.25 + state.velocityX * 0.75, // Gentle velocity tracking
    priceOffset: newPriceOffset,
    priceVelocity: pVel,
  };
}

export function handleDragEnd(state: ZoomPanState): ZoomPanState {
  return {
    ...state,
    isDragging: false,
    isAnimating: Math.abs(state.velocityX) > VELOCITY_MIN || Math.abs(state.priceVelocity) > VELOCITY_MIN * 0.0001,
  };
}

export function fitToVisibleBars(state: ZoomPanState, barCount: number, visibleBars = 200): ZoomPanState {
  const end = Math.max(0, barCount - 1);
  const start = Math.max(0, end - visibleBars);
  return {
    ...state,
    startIndex: start, endIndex: end,
    targetStart: start, targetEnd: end,
    velocityX: 0, priceOffset: 0, priceVelocity: 0,
    isAnimating: false,
    isDragging: false,
  };
}
