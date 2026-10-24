/** A minute of download (filled) and upload (dashed line) speed. SVG ignores the page direction, so time runs left to right in both languages. */
export function Sparkline({ down, up, active, width = 320, height = 56 }: { down: number[]; up: number[]; active: boolean; width?: number; height?: number }) {
  const n = 60;
  const max = Math.max(1024, ...down, ...up);
  const path = (vals: number[]) =>
    vals
      .map((v, i) => {
        const x = width - (vals.length - 1 - i) * (width / (n - 1));
        const y = height - 2 - (v / max) * (height - 6);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  const line = path(down);
  const firstX = down.length ? width - (down.length - 1) * (width / (n - 1)) : width;
  return (
    <svg className={`spark${active ? '' : ' idle'}`} viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1={height - 1} x2={width} y2={height - 1} className="spark-base" />
      {down.length > 1 && (
        <>
          <path d={`${line} L${width},${height - 1} L${firstX.toFixed(1)},${height - 1} Z`} className="spark-fill" />
          <path d={line} className="spark-down" />
          <path d={path(up)} className="spark-up" />
        </>
      )}
    </svg>
  );
}
