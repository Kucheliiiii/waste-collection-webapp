import { useEffect, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

function CountUpNumber({ value, formatter = (next) => String(next) }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const target = Number(value || 0);
    const duration = 700;
    const startedAt = performance.now();
    let animationFrame;

    const animate = (timestamp) => {
      const progress = Math.min(1, (timestamp - startedAt) / duration);
      const eased = 1 - ((1 - progress) ** 3);
      setDisplayValue(target * eased);
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [value]);

  return formatter(displayValue);
}

function ResidentMetricCard({
  title,
  value,
  subtitle,
  breakdown,
  colors,
  trendText,
  tooltipText,
  formatter,
}) {
  const chartData = useMemo(() => {
    const safeBreakdown = Array.isArray(breakdown) ? breakdown : [];
    const usedTotal = safeBreakdown.reduce((sum, entry) => sum + Number(entry.value || 0), 0);
    if (usedTotal <= 0) {
      return [{ name: 'No data', value: 1, color: '#d4d4d4' }];
    }

    return safeBreakdown.map((entry, index) => ({
      name: entry.name,
      value: Number(entry.value || 0),
      color: colors?.[index] || '#0f766e',
    }));
  }, [breakdown, colors]);

  return (
    <div className="resident-metric-card" title={tooltipText || title}>
      <h3>{title}</h3>
      <div className="resident-card-chart-wrap">
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={56}
              outerRadius={86}
              stroke="#ffffff"
              strokeWidth={2}
              isAnimationActive
              animationDuration={500}
            >
              {chartData.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip formatter={(next, name) => [`${Number(next)}`, String(name)]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="resident-metric-value">
        <CountUpNumber value={value} formatter={formatter || ((next) => Math.round(next).toString())} />
      </div>
      <p className="resident-metric-subtitle">{subtitle}</p>
      {trendText ? <p className="resident-trend">\u2191 {trendText}</p> : null}
    </div>
  );
}

export default ResidentMetricCard;
