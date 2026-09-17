const PRESETS = [
  { fold: 0, label: '合拢' },
  { fold: .3333, label: '可折叠设计' },
  { fold: 1, label: '完全展开' },
];

export default function Controls({ targetProgress, onSetFold, disabled }) {
  return (
    <div className="controls">
      <p className="interaction-hint">拖动旋转，滑动开合。</p>
      <div className="fold-control">
        <button data-fold="0" onClick={() => onSetFold(0)} disabled={disabled}>合上</button>
        <input
          id="fold"
          type="range"
          min="0"
          max="1"
          step="0.001"
          value={targetProgress}
          aria-label="展开程度"
          aria-valuetext={`展开 ${Math.round(targetProgress * 100)}%`}
          style={{ '--progress': `${targetProgress * 100}%` }}
          onChange={e => onSetFold(Number(e.target.value), true)}
          disabled={disabled}
        />
        <button data-fold="1" onClick={() => onSetFold(1)} disabled={disabled}>展开</button>
      </div>
      <div className="presets" aria-label="折叠姿态">
        {PRESETS.map(({ fold, label }) => (
          <button
            key={fold}
            data-fold={fold}
            aria-pressed={String(Math.abs(fold - targetProgress) < .02)}
            onClick={() => onSetFold(fold)}
            disabled={disabled}
          >{label}</button>
        ))}
      </div>
    </div>
  );
}
