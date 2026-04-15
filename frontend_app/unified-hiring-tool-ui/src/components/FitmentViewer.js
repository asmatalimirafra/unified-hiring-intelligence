// src/components/FitmentViewer.js
import React, { useRef } from 'react';
import './FitmentViewer.css';
import GaugeChart from 'react-gauge-chart';
import { Oval } from 'react-loader-spinner';
import html2pdf from 'html2pdf.js/dist/html2pdf.bundle.min.js';
import { FiExternalLink } from 'react-icons/fi';

function FitmentViewer({ fitmentData, onClose, loading, candidateName }) {
  const contentRef = useRef();

  const handleDownload = () => {
    if (!contentRef.current) return;
    const candidateId = fitmentData?.candidate_id || 'candidate';
    html2pdf()
      .from(contentRef.current)
      .set({
        margin:     0.5,
        filename:   `fitment-${candidateId}.pdf`,
        image:      { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF:      { unit: 'in', format: 'letter', orientation: 'portrait' }
      })
      .save();
  };

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fv-backdrop">
        <div className="fv-modal fv-center">
          <Oval
            height={60} width={60}
            color="#2563eb"
            secondaryColor="#bfdbfe"
            strokeWidth={3}
            strokeWidthSecondary={3}
            visible={true}
            ariaLabel="loading"
          />
          <p className="fv-loading-text">Analysing fitment…</p>
          <p className="fv-loading-sub">Running semantic + skill gap analysis</p>
        </div>
      </div>
    );
  }

  // Guard: fitmentData must exist before accessing .error
  if (!fitmentData) return null;

  // ── Error state ──────────────────────────────────────────────────────────
  if (fitmentData.error) {
    return (
      <div className="fv-backdrop">
        <div className="fv-modal fv-center">
          <span className="fv-error-icon">⚠️</span>
          <h3 className="fv-error-title">Analysis Failed</h3>
          <p className="fv-error-msg">{fitmentData.error}</p>
          <button className="fv-btn-close" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  // ── Destructure with safe defaults ───────────────────────────────────────
  const {
    fitment_score      = 0,
    semantic_similarity = 0,
    gap_analysis       = {},
    suggestions        = {},
    matched_skills     = [],
    cosine_component,
    llm_component,
  } = fitmentData;

  const minor          = gap_analysis?.minor  || [];
  const major          = gap_analysis?.major  || [];
  const skillsToAdd    = suggestions?.skills_to_add       || [];
  const resources      = suggestions?.learning_resources  || [];

  // Split resume_improvements into individual sentences for a clean list
  const improvements = suggestions?.resume_improvements
    ? suggestions.resume_improvements
        .split(/(?<=[.!?])\s+/)
        .map(s => s.trim())
        .filter(Boolean)
    : [];

  // Score label for the fitment band
  const fitmentLabel =
    fitment_score >= 75 ? { text: 'Strong Fit',   cls: 'label-high' } :
    fitment_score >= 50 ? { text: 'Moderate Fit', cls: 'label-mid'  } :
                          { text: 'Weak Fit',      cls: 'label-low'  };

  return (
    <div className="fv-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fv-modal fv-large">

        {/* Header */}
        <div className="fv-header">
          <div>
            <h3 className="fv-title">Fitment Analysis</h3>
            {(candidateName || fitmentData.candidate_id) && (
              <p className="fv-subtitle">
                {candidateName
                  ? `${candidateName} (${fitmentData.candidate_id})`
                  : fitmentData.candidate_id}
              </p>
            )}
          </div>
          <div className="fv-header-actions">
            <button className="fv-btn-download" onClick={handleDownload}>⬇ Download PDF</button>
            <button className="fv-btn-x" onClick={onClose}>×</button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="fv-body" ref={contentRef}>

          {/* ── Gauges ───────────────────────────────────────────────────── */}
          <div className="fv-gauges">
            <div className="fv-gauge-item">
              <GaugeChart
                id="gauge-fitment"
                nrOfLevels={20}
                percent={Math.min(fitment_score / 100, 1)}
                textColor="#0f172a"
                needleColor="#334155"
                colors={['#ef4444', '#f59e0b', '#22c55e']}
                arcPadding={0.02}
                animate
                formatTextValue={() => `${fitment_score.toFixed(1)}%`}
              />
              <p className="fv-gauge-label">Fitment Score</p>
              <span className={`fv-fit-label ${fitmentLabel.cls}`}>{fitmentLabel.text}</span>
            </div>

            <div className="fv-gauge-item">
              <GaugeChart
                id="gauge-semantic"
                nrOfLevels={20}
                percent={Math.min(Math.max(semantic_similarity, 0), 1)}
                textColor="#0f172a"
                needleColor="#334155"
                colors={['#ef4444', '#f59e0b', '#22c55e']}
                arcPadding={0.02}
                animate
                formatTextValue={() => `${Math.round(semantic_similarity * 100)}%`}
              />
              <p className="fv-gauge-label">Semantic Similarity</p>
            </div>
          </div>

          {/* Score breakdown pill (debug info, shown subtly) */}
          {(cosine_component !== undefined && llm_component !== undefined) && (
            <div className="fv-score-breakdown">
              <span className="fv-breakdown-pill">
                Cosine component: <strong>{cosine_component.toFixed(1)}</strong>
              </span>
              <span className="fv-breakdown-pill">
                Skill analysis component: <strong>{llm_component.toFixed(1)}</strong>
              </span>
            </div>
          )}

          {/* ── Matched Skills ───────────────────────────────────────────── */}
          <div className="fv-section">
            <h4 className="fv-section-title">
              <span className="fv-section-dot dot-green" />
              Matched Skills
              <span className="fv-count">{matched_skills.length}</span>
            </h4>
            {matched_skills.length > 0 ? (
              <div className="fv-tags">
                {matched_skills.map((s, i) => (
                  <span key={i} className="fv-tag tag-green">{s}</span>
                ))}
              </div>
            ) : (
              <p className="fv-empty-note">No matched skills identified.</p>
            )}
          </div>

          {/* ── Minor Gaps ───────────────────────────────────────────────── */}
          <div className="fv-section">
            <h4 className="fv-section-title">
              <span className="fv-section-dot dot-yellow" />
              Minor Gaps
              <span className="fv-count">{minor.length}</span>
            </h4>
            {minor.length > 0 ? (
              <div className="fv-tags">
                {minor.map((s, i) => (
                  <span key={i} className="fv-tag tag-yellow">{s}</span>
                ))}
              </div>
            ) : (
              <p className="fv-empty-note">No minor gaps identified.</p>
            )}
          </div>

          {/* ── Major Gaps ───────────────────────────────────────────────── */}
          <div className="fv-section">
            <h4 className="fv-section-title">
              <span className="fv-section-dot dot-red" />
              Major Gaps
              <span className="fv-count">{major.length}</span>
            </h4>
            {major.length > 0 ? (
              <div className="fv-tags">
                {major.map((s, i) => (
                  <span key={i} className="fv-tag tag-red">{s}</span>
                ))}
              </div>
            ) : (
              <p className="fv-empty-note">No major gaps identified.</p>
            )}
          </div>

          {/* ── Resume Improvement Suggestions ───────────────────────────── */}
          <div className="fv-section">
            <h4 className="fv-section-title">
              <span className="fv-section-dot dot-blue" />
              Resume Improvement Suggestions
            </h4>
            {improvements.length > 0 ? (
              <ul className="fv-suggestion-list">
                {improvements.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            ) : (
              <p className="fv-empty-note">No suggestions available.</p>
            )}
          </div>

          {/* ── Skills to Add ─────────────────────────────────────────────── */}
          {skillsToAdd.length > 0 && (
            <div className="fv-section">
              <h4 className="fv-section-title">
                <span className="fv-section-dot dot-blue" />
                Skills to Add
              </h4>
              <div className="fv-tags">
                {skillsToAdd.map((s, i) => (
                  <span key={i} className="fv-tag tag-blue">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* ── Learning Resources ────────────────────────────────────────── */}
          <div className="fv-section">
            <h4 className="fv-section-title">
              <span className="fv-section-dot dot-purple" />
              Learning Resources
            </h4>
            {resources.length > 0 ? (
              <ul className="fv-resource-list">
                {resources.map((res, i) => {
                  const domain = res.resource
                    ?.replace(/^https?:\/\//, '')
                    .split('/')[0];
                  return (
                    <li key={i} className="fv-resource-item">
                      {res.resource ? (
                        <a
                          href={res.resource}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="fv-resource-link"
                        >
                          {res.skill}
                          <FiExternalLink className="fv-ext-icon" />
                        </a>
                      ) : (
                        <span className="fv-resource-nolink">{res.skill || 'Resource unavailable'}</span>
                      )}
                      {domain && (
                        <span className="fv-resource-domain">{domain}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="fv-empty-note">No resources available.</p>
            )}
          </div>

        </div>{/* /fv-body */}
      </div>
    </div>
  );
}

export default FitmentViewer;