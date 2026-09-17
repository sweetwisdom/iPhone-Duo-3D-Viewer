import LoadingOverlay from './LoadingOverlay.jsx';

export default function ViewerCanvas({ containerRef, hitAreaRef, status, message, onReset, onKeyDown, disabled }) {
  const toggleDragging = on => () => hitAreaRef.current.classList.toggle('dragging', on);
  return (
    <div className="viewer-wrapper">
      <div className="product-viewer-canvas" ref={containerRef}></div>
      <div
        className="viewer-hit-area"
        ref={hitAreaRef}
        tabIndex={0}
        role="group"
        aria-label="iPhone Duo 三维展示，拖动旋转，左右方向键折叠，R 键复位"
        onKeyDown={onKeyDown}
        onPointerDown={toggleDragging(true)}
        onPointerUp={toggleDragging(false)}
        onPointerCancel={toggleDragging(false)}
        onLostPointerCapture={toggleDragging(false)}
      ></div>
      <LoadingOverlay status={status} message={message} />
      <button className="reset" aria-label="重置视角" title="重置视角" onClick={onReset} disabled={disabled}>↺</button>
    </div>
  );
}
