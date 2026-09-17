import { useDuoViewer } from '../hooks/useDuoViewer.js';
import ViewerCanvas from './ViewerCanvas.jsx';
import Controls from './Controls.jsx';

export default function ProductViewer({ initialFold }) {
  const {
    containerRef, hitAreaRef, status, message, targetProgress,
    setFold, reset, handleKeyDown, disabled,
  } = useDuoViewer(initialFold);
  return (
    <section className="product-viewer" aria-labelledby="viewer-title">
      <div className="heading">
        <p>换个角度，大有不同。</p>
        <h1 id="viewer-title">展开，精彩的另一面。</h1>
      </div>
      <ViewerCanvas
        containerRef={containerRef}
        hitAreaRef={hitAreaRef}
        status={status}
        message={message}
        onReset={reset}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      />
      <Controls targetProgress={targetProgress} onSetFold={setFold} disabled={disabled} />
    </section>
  );
}
