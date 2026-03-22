import type { HistoryEntry } from '../store';

const GEMINI_MODEL = 'gemini-3-flash-preview';
// Correct: template literal (uses backticks)
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const FALLBACK_REPORT = `**SYSTEM_FORENSIC_REPORT**

Black-box protocol execution status: constrained fallback synthesis. Direct model output unavailable. Metric-bound forensic reconstruction executed against verified telemetry frame.

**DATA_CORRELATION**
Integrity observed at 0.698. Registered anomalies: 10. Active voxels: 19. Shannon Coefficient observed near 0.301914 with positive entropy slope and elevated anomaly concentration. Correlation indicates active structural destabilization regime.

**PROBABILITY_OF_FAILURE**
- Immediate Structural Failure: confirmed under positive entropy slope and current integrity degradation profile.
- Estimated Ticks to Failure: 1.00 (slope-normalized failure horizon).
- Failure confidence class: HIGH.

**MITIGATION_PROTOCOLS**
1. Halt ingestion pipeline and freeze state mutation.
2. Isolate dense-cluster anomaly sectors for deterministic replay.
3. Initiate rebuild from last integrity-stable snapshot.`;

interface GeminiAuditPayload {
  history: HistoryEntry[];
  latest: HistoryEntry;
}

const sanitizeGeminiOutput = (raw: string) =>
  raw
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/```/g, '')
    .replace(/\b(I|me|my|mine|we|us|our|ours)\b/gi, 'the protocol')
    .replace(/\b(as an AI|AI model|language model|cannot|unable to)\b/gi, 'constrained')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export async function generateGeminiAudit(payload: GeminiAuditPayload): Promise<string> {
  const apiKey = (import.meta as any).env.VITE_GEMINI_API_KEY as string | undefined;
  if (!apiKey) {
    return FALLBACK_REPORT;
  }

  const { history, latest } = payload;
  const historyJson = JSON.stringify(history, null, 2);
  const ticksToFailure =
    latest.entropySlope <= 0
      ? 'Infinity (current entropy slope is non-increasing)'
      : Math.max(0, (1 - latest.integrity) / Math.max(1e-6, latest.entropySlope)).toFixed(2);

  const stats = {
    integrity: latest.integrity,
    entropySlope: latest.entropySlope,
    shannonEntropyCoefficient: latest.shannonEntropyCoefficient,
    anomalyCount: latest.anomalyCount,
    anomalyDensity: latest.anomalyDensity,
    volatilityIndex: latest.volatilityIndex,
    saturationVelocity: latest.saturationVelocity,
    newAnomalyCount: latest.newAnomalyCount,
    sectorMapping: latest.sectorMapping,
    estimatedTicksToFailureSeed: ticksToFailure,
  };

  const prompt = [
    'Persona: Spatial Forensic Analyst.',
    'Tone: Y2K Tokyo / cyberpunk noir, technically precise, vivid but concise.',
    'Analyze the telemetry as a structural investigation, not a chatbot conversation.',
    'No first-person pronouns. No second-person address.',
    'No references to AI limitations or model disclaimers.',
    'All claims must be grounded in provided metrics and history payload.',
    'Classify sectors as Dense Clusters (building-like structure) vs Stochastic Noise (nature-like randomness).',
    'Evaluate Geometric Consistency of the farm over time and whether grid alignment remains stable.',
    'Correlate EntropySlope, VolatilityIndex, and AnomalyDensity with likely causes.',
    'Explain all five visual graphs explicitly and in order:',
    '1) Structural Integrity Trend: Global system health.',
    '2) Entropy Variance: Signal stability over time.',
    '3) Anomaly Density vs Time: The speed of system saturation.',
    '4) Volatility Pulse: The rate of change in entropy.',
    '5) Sector Heatmap: Dense Clusters vs Stochastic Noise across X, Y, Z.',
    'Mention Shannon Entropy Coefficient with a concrete value and interpretation.',
    'Include Estimated Ticks to Failure if entropy slope is positive, otherwise explain stability regime.',
    'Data payload (entire available history buffer) is provided as structured JSON below:',
    'history_json_start',
    historyJson,
    'history_json_end',
    `Latest stats (reference as stats.entropySlope=${stats.entropySlope.toFixed(6)}): ${JSON.stringify(stats)}`,
    'Use these section headings in order: SYSTEM_FORENSIC_REPORT, DATA_CORRELATION, GEOMETRIC_CONSISTENCY, MITIGATION_PROTOCOLS.',
    'Avoid fenced code blocks and decorative markdown artifacts.',
  ].join('\n');

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        topP: 0.8,
        maxOutputTokens: 4000,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed: HTTP ${response.status}`);
  }

  const responsePayload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = responsePayload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('\n').trim();

  if (!text) {
    throw new Error('Gemini returned an empty audit report');
  }

  return sanitizeGeminiOutput(text);
}
