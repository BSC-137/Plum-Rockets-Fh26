import { useEffect, useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useWorldStore, type HistoryEntry } from '../store';

function StatsGrid({ latestEntry }: { latestEntry: HistoryEntry | undefined }) {
  const cards = [
    {
      label: 'Shannon_Coefficient',
      value: latestEntry ? latestEntry.shannonEntropyCoefficient.toFixed(6) : 'N/A',
      detail: 'Entropy coherence constant derived from current frame.',
    },
    {
      label: 'Volatility_Index',
      value: latestEntry ? latestEntry.volatilityIndex.toFixed(6) : 'N/A',
      detail: 'Variance signal across the rolling 10-tick entropy window.',
    },
    {
      label: 'Saturation_Velocity',
      value: latestEntry ? `${latestEntry.saturationVelocity.toFixed(6)} vox/tick` : 'N/A',
      detail: latestEntry ? `Per-tick anomaly ingress: ${latestEntry.newAnomalyCount.toFixed(6)}` : 'No anomaly delta available.',
    },
    {
      label: 'Entropy_Slope',
      value: latestEntry ? latestEntry.entropySlope.toFixed(6) : 'N/A',
      detail: 'Delta H trajectory for structural uncertainty propagation.',
    },
  ];

  return (
    <div className="forensic-stats-grid">
      {cards.map((card) => (
        <article key={card.label} className="forensic-stat-card">
          <div className="forensic-stat-label">{card.label}</div>
          <div className="forensic-stat-value">{card.value}</div>
          <code className="forensic-stat-detail">{card.detail}</code>
        </article>
      ))}
    </div>
  );
}

function renderInlineMarkdown(text: string, keyPrefix: string) {
  const chunks: React.ReactNode[] = [];
  const inlinePattern = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let cursor = 0;
  let match: RegExpExecArray | null = inlinePattern.exec(text);

  while (match) {
    if (match.index > cursor) {
      chunks.push(text.slice(cursor, match.index));
    }
    const token = match[0];
    if (token.startsWith('`')) {
      chunks.push(<code key={`${keyPrefix}-code-${match.index}`}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      chunks.push(<strong key={`${keyPrefix}-strong-${match.index}`}>{token.slice(2, -2)}</strong>);
    }
    cursor = match.index + token.length;
    match = inlinePattern.exec(text);
  }

  if (cursor < text.length) {
    chunks.push(text.slice(cursor));
  }

  return chunks;
}

function renderMarkdownReport(text: string) {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) {
      i += 1;
      continue;
    }

    const heading = line.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      nodes.push(<h4 key={`h-${i}`}>{renderInlineMarkdown(heading[1], `h-${i}`)}</h4>);
      i += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      nodes.push(
        <ol key={`ol-${i}`}>
          {items.map((item, index) => (
            <li key={`ol-${i}-${index}`}>{renderInlineMarkdown(item, `ol-${i}-${index}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''));
        i += 1;
      }
      nodes.push(
        <ul key={`ul-${i}`}>
          {items.map((item, index) => (
            <li key={`ul-${i}-${index}`}>{renderInlineMarkdown(item, `ul-${i}-${index}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    nodes.push(<p key={`p-${i}`}>{renderInlineMarkdown(rawLine, `p-${i}`)}</p>);
    i += 1;
  }

  return nodes;
}

export function AuditReport() {
  const history = useWorldStore((state) => state.history);
  const toggleReport = useWorldStore((state) => state.toggleReport);
  const analysis = useWorldStore((state) => state.reportAnalysis);
  const loading = useWorldStore((state) => state.reportLoading);
  const generateAuditReport = useWorldStore((state) => state.generateAuditReport);

  const latestEntry = history[history.length - 1];

  const integrityTrendData = useMemo(() => history, [history]);
  const entropyVarianceData = useMemo(
    () => history.map((entry) => ({ tick: entry.tick, meanEntropy: Number(entry.meanEntropy.toFixed(6)) })),
    [history],
  );
  const anomalyDensityData = useMemo(
    () =>
      history.map((entry) => ({
        tick: entry.tick,
        anomalyDensity: Number(entry.anomalyDensity.toFixed(6)),
      })),
    [history],
  );
  const volatilityPulseData = useMemo(
    () =>
      history.map((entry, index) => {
        const previous = history[index - 1];
        const tickDelta = previous ? Math.max(1, entry.tick - previous.tick) : 1;
        const entropySlopeDelta = previous ? entry.entropySlope - previous.entropySlope : 0;
        return {
          tick: entry.tick,
          entropySlope: Number(entry.entropySlope.toFixed(6)),
          slopeRate: Number((entropySlopeDelta / tickDelta).toFixed(6)),
        };
      }),
    [history],
  );
  const sectorHeatmapData = useMemo(() => {
    if (!latestEntry || latestEntry.volatileVoxels.length === 0) {
      return [
        { axis: 'X', anomalyDensity: 0 },
        { axis: 'Y', anomalyDensity: 0 },
        { axis: 'Z', anomalyDensity: 0 },
      ];
    }

    const aggregate = latestEntry.volatileVoxels.reduce(
      (acc, voxel) => {
        acc.x += Math.abs(voxel.x) + 1;
        acc.y += Math.abs(voxel.y) + 1;
        acc.z += Math.abs(voxel.z) + 1;
        return acc;
      },
      { x: 0, y: 0, z: 0 },
    );
    const total = aggregate.x + aggregate.y + aggregate.z || 1;
    const scale = latestEntry.anomalyDensity;

    return [
      { axis: 'X', anomalyDensity: Number(((aggregate.x / total) * scale).toFixed(6)) },
      { axis: 'Y', anomalyDensity: Number(((aggregate.y / total) * scale).toFixed(6)) },
      { axis: 'Z', anomalyDensity: Number(((aggregate.z / total) * scale).toFixed(6)) },
    ];
  }, [latestEntry]);

  const manifestRows = useMemo(
    () =>
      (latestEntry?.volatileVoxels ?? []).map((voxel) => ({
        ...voxel,
        score: Number(voxel.volatilityScore.toFixed(5)),
      })),
    [latestEntry],
  );
  const estimatedTicksToFailure = useMemo(() => {
    if (!latestEntry) return 'N/A';
    if (latestEntry.entropySlope <= 0) return 'Infinity';
    return (1 / latestEntry.entropySlope).toFixed(2);
  }, [latestEntry]);

  useEffect(() => {
    void generateAuditReport();
  }, [generateAuditReport, latestEntry?.tick]);

  return (
    <div className="report-overlay" role="dialog" aria-modal="true" aria-label="Audit report">
      <div className="report-content">
        <header className="report-header engine-panel">
          <div>
            <strong>PLUM ENGINE AUDIT REPORT</strong>
            <small>Spatiotemporal Structural Intelligence</small>
          </div>
          <div className="report-actions">
            <button type="button" className="print-pdf-button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              SCROLL_TO_TOP
            </button>
            <button type="button" className="print-pdf-button" onClick={() => window.print()}>
              PRINT_PDF
            </button>
            <button type="button" className="report-close-button" onClick={() => toggleReport(false)}>
              CLOSE_REPORT
            </button>
          </div>
        </header>

        <section className="report-row report-graphs-row">
          <article className="report-panel engine-panel">
            <div className="report-panel-title">Structural_Integrity_Trend</div>
            <div className="chart-shell">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={integrityTrendData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--report-grid-stroke)" strokeDasharray="3 3" />
                  <XAxis dataKey="tick" stroke="#ffb38a" tick={{ fill: '#ffb38a', fontSize: 11 }} />
                  <YAxis stroke="#ffb38a" tick={{ fill: '#ffb38a', fontSize: 11 }} domain={[0, 1]} />
                  <Tooltip contentStyle={{ background: 'rgba(8,4,8,0.92)', border: '1px solid rgba(255,179,138,0.4)', color: '#ffb38a' }} />
                  <Line type="monotone" dataKey="integrity" stroke="#ffb38a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="report-panel engine-panel">
            <div className="report-panel-title">Entropy_Variance</div>
            <div className="chart-shell">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={entropyVarianceData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--report-grid-stroke)" strokeDasharray="3 3" />
                  <XAxis dataKey="tick" stroke="#ffb38a" tick={{ fill: '#ffb38a', fontSize: 11 }} />
                  <YAxis stroke="#ffb38a" tick={{ fill: '#ffb38a', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'rgba(8,4,8,0.92)', border: '1px solid rgba(255,179,138,0.4)', color: '#ffb38a' }} />
                  <Bar dataKey="meanEntropy" fill="#ffb38a" fillOpacity={0.72} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="report-panel engine-panel">
            <div className="report-panel-title">Anomaly_Density_vs_Time</div>
            <div className="chart-shell">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--report-grid-stroke)" strokeDasharray="3 3" />
                  <XAxis type="number" dataKey="tick" stroke="#ffb38a" tick={{ fill: '#ffb38a', fontSize: 11 }} />
                  <YAxis type="number" dataKey="anomalyDensity" stroke="#ffb38a" tick={{ fill: '#ffb38a', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'rgba(8,4,8,0.92)', border: '1px solid rgba(255,179,138,0.4)', color: '#ffb38a' }} />
                  <Scatter data={anomalyDensityData} fill="#ffb38a" />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="report-panel engine-panel">
            <div className="report-panel-title">Volatility_Pulse</div>
            <div className="chart-shell">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={volatilityPulseData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--report-grid-stroke)" strokeDasharray="3 3" />
                  <XAxis dataKey="tick" stroke="#ffb38a" tick={{ fill: '#ffb38a', fontSize: 11 }} />
                  <YAxis stroke="#ffb38a" tick={{ fill: '#ffb38a', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'rgba(8,4,8,0.92)', border: '1px solid rgba(255,179,138,0.4)', color: '#ffb38a' }} />
                  <Line type="monotone" dataKey="slopeRate" stroke="#ffb38a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </article>

          <article className="report-panel engine-panel">
            <div className="report-panel-title">Sector_Heatmap</div>
            <div className="chart-shell">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sectorHeatmapData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="var(--report-grid-stroke)" strokeDasharray="3 3" />
                  <XAxis dataKey="axis" stroke="#ffb38a" tick={{ fill: '#ffb38a', fontSize: 11 }} />
                  <YAxis stroke="#ffb38a" tick={{ fill: '#ffb38a', fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'rgba(8,4,8,0.92)', border: '1px solid rgba(255,179,138,0.4)', color: '#ffb38a' }} />
                  <Bar dataKey="anomalyDensity" fill="#ffb38a" fillOpacity={0.78} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </article>
        </section>

        <section className="report-row report-math-row engine-panel">
          <div className="report-panel-title">FORENSIC_MATH_CONSOLE</div>
          <StatsGrid latestEntry={latestEntry} />
        </section>

        <section className="report-row report-ai-row engine-panel">
          <div className="report-panel-title">FORENSIC_DATA_INTERPRETATION</div>
          <div className="forensic-text-container ai-text report-ai-scroll">
            {loading ? 'GENERATING_REPORT...' : renderMarkdownReport(analysis)}
          </div>
        </section>

        <section className="report-row report-manifest-row engine-panel">
          <div className="report-panel-title">ANOMALY_MANIFEST</div>
          <div className="manifest-failure-line">
            Estimated Ticks to Failure: <code>{estimatedTicksToFailure}</code>
          </div>
          <div className="report-manifest-scroll">
            <table className="report-manifest-table">
              <thead>
                <tr>
                  <th>Voxel_ID</th>
                  <th>Coordinates</th>
                  <th>Entropy</th>
                  <th>Volatility</th>
                  <th>Sector</th>
                </tr>
              </thead>
              <tbody>
                {manifestRows.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No volatile anomalies in current frame.</td>
                  </tr>
                ) : (
                  manifestRows.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <code>{row.key}</code>
                      </td>
                      <td>
                        <code>{`(${row.x}, ${row.y}, ${row.z})`}</code>
                      </td>
                      <td>
                        <code>{row.entropy.toFixed(5)}</code>
                      </td>
                      <td>
                        <code>{row.score.toFixed(5)}</code>
                      </td>
                      <td>{row.sector}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
