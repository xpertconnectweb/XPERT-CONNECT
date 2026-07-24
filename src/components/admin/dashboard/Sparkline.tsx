/**
 * Dependency-free SVG sparkline (area + line). Used inside KPI tiles — lighter
 * than mounting a recharts instance per tile. Non-interactive/decorative.
 */
export function Sparkline({
  data,
  stroke = '#1a2a4a',
  fill = 'rgba(26,42,74,0.08)',
  width = 104,
  height = 34,
  className,
}: {
  data: number[]
  stroke?: string
  fill?: string
  width?: number
  height?: number
  className?: string
}) {
  if (data.length < 2) return null

  const max = Math.max(...data)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const stepX = width / (data.length - 1)
  const pad = 2 // keep the stroke off the top/bottom edges

  const pts = data.map((d, i) => {
    const x = i * stepX
    const y = height - pad - ((d - min) / range) * (height - pad * 2)
    return [x, y] as const
  })

  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={stroke} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
