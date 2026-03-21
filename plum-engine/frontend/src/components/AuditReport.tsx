import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useWorldStore, type HistoryEntry } from '../store';
import { generateGeminiAudit } from '../utils/geminiAudit';

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 120,
  display: 'grid',
  placeItems: 'center',
  padding: '1.25rem',
  background: 'rgba(8, 4, 8, 0.72)',
  backdropFilter: 'blur(9px)',
  WebkitBackdropFilter: 'blur(9px)',
};

const scanlineStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  opacity: 0.08,
  background:
    'repeating-linear-gradient(180deg, rgba(255, 179, 138, 0.2) 0, rgba(255, 179, 138, 0.2) 1px, transparent 1px, transparent 4px)',
  mixBlendMode: 'screen',
};

const modalStyle: React.CSSProperties = {
  position: 'relative',
  width: 'min(1100px, 100%)',
  maxHeight: 'min(88vh, 900px)',
  display: 'grid',
  gridTemplateRows: 'auto 1fr auto',
  gap: '0.9rem',
  padding: '1.1rem',
  border: '1px solid #ffb38a',
  borderRadius: '6px',
  background:
    'linear-gradient(180deg, rgba(255, 179, 138, 0.07), rgba(255, 179, 138, 0.02)), rgba(8, 4, 8, 0.9)',
  boxShadow: 'inset 0 1px 0 rgba(255, 214, 197, 0.12), 0 28px 90px rgba(0, 0, 0, 0.55)',
  fontFamily: 'JetBrains Mono, monospace',
  textTransform: 'uppercase',
  color: '#ffb38a',
  overflow: 'hidden',
};

const chartsGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '0.9rem',
  minHeight: 0,
};

const panelStyle: React.CSSProperties = {
  border: '1px solid rgba(255, 179, 138, 0.3)',
  borderRadius: '4px',
  background: 'rgba(8, 4, 8, 0.75)',
  padding: '0.8rem',
  minHeight: 260,
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  gap: '0.6rem',
};

const reportPanelStyle: React.CSSProperties = {
  ...panelStyle,
  minHeight: 200,
};

const closeButtonStyle: React.CSSProperties = {
  border: '1px solid rgba(255, 179, 138, 0.4)',
  background: 'linear-gradient(180deg, rgba(255, 179, 138, 0.22), rgba(255, 179, 138, 0.08))',
  color: '#ffb38a',
  borderRadius: '4px',
  padding: '0.7rem 0.9rem',
  fontFamily: 'JetBrains Mono, monospace',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
};

export function AuditReport() {
  const history = useWorldStore((state) => state.history) as HistoryEntry[];
  const toggleReport = useWorldStore((state) => state.toggleReport);

  const [analysis, setAnalysis] = useState('Awaiting Gemini structural interpretation...');
  const [loading, setLoading] = useState(false);

  const latestEntry = history[history.length - 1];

  const entropyVarianceData = useMemo(
    () => history.map((entry) => ({ tick: entry.tick, meanEntropy: Number(entry.meanEntropy.toFixed(6)) })),
    [history],
  );

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!latestEntry) {
        setAnalysis('No telemetry history is available yet.');
        return;
      }

      setLoading(true);
      try {
        const result = await generateGeminiAudit(latestEntry);
        if (!cancelled) setAnalysis(result);
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'Unknown Gemini error';
          setAnalysis(`EXECUTIVE SUMMARY\nGemini analysis failed: ${message}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [latestEntry]);

  return (
    <div className="report-overlay" style={overlayStyle} role="dialog" aria-modal="true" aria-label="Audit report">
      <div style={scanlineStyle} />
      <section className="engine-panel" style={modalStyle}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'grid', gap: '0.25rem' }}>
            <strong style={{ color: '#ffe7dc', fontSize: '0.9rem' }}>Plum Engine Audit Report</strong>
            <small style={{ color: 'rgba(255, 179, 138, 0.78)' }}>Spatiotemporal Structural Intelligence</small>
          </div>
          <button type="button" style={closeButtonStyle} onClick={() => toggleReport(false)}>
            CLOSE_REPORT
          </button>
        </header>

        <div style={{ display: 'grid', gridTemplateRows: '1fr auto', gap: '0.9rem', minHeight: 0 }}>
          <div style={chartsGridStyle}>
            <section style={panelStyle}>
              <div style={{ color: 'rgba(255, 179, 138, 0.8)', fontSize: '0.7rem' }}>Structural_Integrity_Trend</div>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,179,138,0.12)" strokeDasharray="3 3" />
                  <XAxis dataKey="tick" stroke="rgba(255,179,138,0.65)" tick={{ fill: '#ffb38a', fontSize: 11 }} />
                  <YAxis stroke="rgba(255,179,138,0.65)" tick={{ fill: '#ffb38a', fontSize: 11 }} domain={[0, 1]} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(8,4,8,0.92)',
                      border: '1px solid rgba(255,179,138,0.4)',
                      color: '#ffb38a',
                    }}
                  />
                  <Line type="monotone" dataKey="integrity" stroke="#ffb38a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </section>

            <section style={panelStyle}>
              <div style={{ color: 'rgba(255, 179, 138, 0.8)', fontSize: '0.7rem' }}>Entropy_Variance</div>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={entropyVarianceData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(255,179,138,0.12)" strokeDasharray="3 3" />
                  <XAxis dataKey="tick" stroke="rgba(255,179,138,0.65)" tick={{ fill: '#ffb38a', fontSize: 11 }} />
                  <YAxis stroke="rgba(255,179,138,0.65)" tick={{ fill: '#ffb38a', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(8,4,8,0.92)',
                      border: '1px solid rgba(255,179,138,0.4)',
                      color: '#ffb38a',
                    }}
                  />
                  <Bar dataKey="meanEntropy" fill="#ffb38a" fillOpacity={0.72} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </section>
          </div>

          <section style={reportPanelStyle}>
            <div style={{ color: 'rgba(255, 179, 138, 0.8)', fontSize: '0.7rem' }}>AI_Structural_Insights</div>
            <div
              style={{
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                border: '1px solid rgba(255, 179, 138, 0.25)',
                borderRadius: '4px',
                padding: '0.8rem',
                fontSize: '0.72rem',
                lineHeight: 1.5,
                color: '#ffd9c8',
                background: 'rgba(8,4,8,0.72)',
              }}
            >
              {loading ? 'GENERATING_REPORT...' : analysis}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
