export default function LoadingOverlay({ status, message }) {
  const failed = status === 'failed';
  return (
    <div className={`loading${status === 'loaded' ? ' loaded' : failed ? ' failed' : ''}`} role="status">
      {!failed && <span className="spinner"></span>}
      <span id="load-message">{message}</span>
      {failed && <button onClick={() => location.reload()}>重新载入</button>}
    </div>
  );
}
