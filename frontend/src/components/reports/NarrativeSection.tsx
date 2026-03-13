"use client";

import React from 'react';
import type { NarrativeParagraph } from '../../utils/reportNarratives';

interface NarrativeSectionProps {
  paragraphs: NarrativeParagraph[];
}

const typeStyles: Record<string, { borderColor: string; label: string }> = {
  OVERVIEW: { borderColor: 'var(--accent-cyan)', label: '' },
  ANALYSIS: { borderColor: 'var(--accent-indigo)', label: '' },
  FINDING: { borderColor: 'var(--accent-amber)', label: 'KEY FINDING' },
  METHODOLOGY: { borderColor: 'var(--border-soft)', label: 'METHODOLOGY' },
  RECOMMENDATION: { borderColor: 'var(--accent-green)', label: 'RECOMMENDATION' },
  DISCLAIMER: { borderColor: 'var(--accent-red)', label: 'DISCLAIMER' },
};

const NarrativeSection: React.FC<NarrativeSectionProps> = ({ paragraphs }) => {
  if (paragraphs.length === 0) return null;

  return (
    <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border-soft)', paddingTop: '1.5rem' }}>
      <div style={{
        fontSize: '13px',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: 'var(--text-secondary)',
        marginBottom: '1rem',
        fontWeight: 600,
      }}>
        Detailed Analysis
      </div>
      {paragraphs.map((p, i) => {
        const style = typeStyles[p.type] || typeStyles.OVERVIEW;
        return (
          <div key={i} style={{
            borderLeft: `3px solid ${style.borderColor}`,
            paddingLeft: '1rem',
            marginBottom: '1.25rem',
          }}>
            {(p.heading || style.label) && (
              <div style={{
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                color: style.borderColor,
                marginBottom: '0.5rem',
              }}>
                {p.heading || style.label}
              </div>
            )}
            <p style={{
              fontSize: '13px',
              color: 'var(--text-secondary)',
              lineHeight: '1.75',
              margin: 0,
            }}>
              {p.text}
            </p>
          </div>
        );
      })}
    </div>
  );
};

export default NarrativeSection;
