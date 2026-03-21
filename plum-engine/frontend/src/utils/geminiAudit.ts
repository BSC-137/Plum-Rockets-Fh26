import type { HistoryEntry } from '../store';

const GEMINI_MODEL = 'gemini-pro';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const FALLBACK_REPORT = `EXECUTIVE SUMMARY
Gemini API key unavailable. Structural telemetry was captured, but AI interpretation is offline.

SPATIOTEMPORAL ANALYSIS
Shannon entropy quantifies uncertainty in occupancy states over time. Lower entropy and negative slope indicate stabilization.

ANOMALY DISRUPTION
Review anomaly distribution and local entropy spikes to isolate noisy sectors.

PREDICTIVE OUTLOOK
If entropy slope remains negative, integrity should continue converging. Positive slope suggests drift risk.`;

export async function generateGeminiAudit(entry: HistoryEntry): Promise<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  if (!apiKey) {
    return FALLBACK_REPORT;
  }

  const prompt = [
    'You are the Plum Engine Structural Intelligence AI.',
    'Produce an industrial-grade mathematical audit report.',
    'Use professional infrastructure language such as structural drift and stochastic noise.',
    'Output exactly these sections and headings:',
    '1. EXECUTIVE SUMMARY',
    '2. SPATIOTEMPORAL ANALYSIS (Explain the Shannon Entropy)',
    '3. ANOMALY DISRUPTION',
    '4. PREDICTIVE OUTLOOK',
    'Base your analysis on this latest spatiotemporal sample:',
    JSON.stringify(entry),
    'State whether the structure appears stabilizing (negative entropy slope) or failing (positive entropy slope).',
    'Keep the response concise, high-signal, and operational.',
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
        maxOutputTokens: 800,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('\n').trim();

  if (!text) {
    throw new Error('Gemini returned an empty audit report');
  }

  return text;
}
