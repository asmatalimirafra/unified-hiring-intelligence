// src/pages/hr/FeedbackPage.js

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Radar } from 'react-chartjs-2';
import { Button, Table, Spinner } from 'react-bootstrap';
import { FaEye, FaDownload, FaTimes, FaFileAlt } from 'react-icons/fa'; // Added FaFileAlt
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './FeedbackPage.css';

const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';
const axiosConfig = { headers: { 'ngrok-skip-browser-warning': 'true' } };

// ── Helper: avg score for a single round ─────────────────────────────────
function getRoundAvg(interviews = [], round) {
  const r = interviews.find(i => i.round === round);
  if (!r?.ratings) {
    const maxRound = Math.max(...interviews.map(i => i.round), 0);
    return round > maxRound ? 'No Need' : '-';
  }
  const vals = Object.values(r.ratings);
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1);
}

// ── Helper: all unique sorted round numbers across a candidate list ───────
function getAllRounds(candidates) {
  const rounds = new Set();
  candidates.forEach(c =>
    (c.interviews || []).forEach(i => rounds.add(i.round))
  );
  return [...rounds].sort((a, b) => a - b);
}

// ── Helper: overall avg across ALL rounds ────────────────────────────────
function getOverallAvg(interviews = []) {
  if (!interviews.length) return null;
  let total = 0, count = 0;
  interviews.forEach(i => {
    Object.values(i.ratings || {}).forEach(v => { total += v; count++; });
  });
  return count > 0 ? (total / count).toFixed(2) : null;
}

export default function FeedbackPage() {
  const [roles, setRoles]                     = useState([]);
  const [selectedRole, setSelectedRole]       = useState('');
  const [candidates, setCandidates]           = useState([]);
  const [loading, setLoading]                 = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [aggregate, setAggregate]             = useState(null);
  const [showModal, setShowModal]             = useState(false);
  const [fetchingAggregate, setFetchingAggregate] = useState(false);

  // ── Fetch roles ──────────────────────────────────────────────────────────
  useEffect(() => {
    axios.get(`${BASE_URL}/get-roles/`, axiosConfig)
      .then(res => {
        const openRoles = Array.isArray(res.data)
          ? res.data.filter(r => r.status?.toLowerCase().trim() === 'open')
          : [];
        setRoles(openRoles);
      })
      .catch(err => console.error('Failed to fetch roles:', err));
  }, []);

  // ── Fetch candidates — only interview_completed ones ─────────────────────
  const fetchCandidates = async (roleId) => {
    setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/get-candidates/`, axiosConfig);
      const filtered = Array.isArray(res.data)
        ? res.data.filter(
            c => String(c.applied_role_id) === String(roleId) &&
                 c.interview_completed === true
          )
        : [];
      setCandidates(filtered);
    } catch (err) {
      console.error('Failed to fetch candidates:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── View aggregate modal ─────────────────────────────────────────────────
  const handleViewAggregate = async (candidate) => {
    setSelectedCandidate(candidate);
    setAggregate(null);
    setFetchingAggregate(true);
    setShowModal(true);
    try {
      const res = await axios.get(
        `${BASE_URL}/aggregate-interviews/${candidate.candidate_id}?fresh=${Date.now()}`,
        axiosConfig
      );
      setAggregate(res.data);
    } catch (err) {
      console.error('Failed to fetch aggregate:', err);
    } finally {
      setFetchingAggregate(false);
    }
  };

  // ── PDF export — Feedback Report ─────────────────────────────────────────
  const handleDownloadPDF = () => {
    if (!aggregate || !selectedCandidate) return;
    const doc = new jsPDF();

    doc.setFontSize(14);
    doc.text('Candidate Feedback Report', 14, 15);
    doc.setFontSize(11);
    doc.text(
      `Candidate: ${selectedCandidate.name} (${selectedCandidate.candidate_id})`,
      14, 25
    );
    doc.text(`Verdict: ${aggregate.verdict}`, 14, 35);

    // Average scores table
    autoTable(doc, {
      startY: 45,
      head: [['Metric', 'Score']],
      body: [
        ['Communication',   aggregate.average_scores.communication],
        ['Problem Solving', aggregate.average_scores.problem_solving],
        ['Domain Knowledge',aggregate.average_scores.domain_knowledge],
        ['Overall Average', aggregate.average_scores.overall_average],
      ],
    });

    // Per-round breakdown
    const interviews = selectedCandidate.interviews || [];
    const sortedRounds = [...interviews].sort((a, b) => a.round - b.round);
    if (sortedRounds.length > 0) {
      let y = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(11);
      doc.text('Per-Round Scores:', 14, y);
      autoTable(doc, {
        startY: y + 5,
        head: [['Round', 'Communication', 'Domain Knowledge', 'Problem Solving', 'Avg']],
        body: sortedRounds.map(i => {
          const avg = getRoundAvg(interviews, i.round);
          return [
            `L${i.round}`,
            i.ratings?.communication ?? '-',
            i.ratings?.domain_knowledge ?? '-',
            i.ratings?.problem_solving ?? '-',
            avg,
          ];
        }),
      });
    }

    let finalY = doc.lastAutoTable.finalY || 70;
    doc.setFontSize(11);
    doc.text(`Strengths: ${(aggregate.strengths || []).join(', ') || 'None'}`, 14, finalY + 12);
    doc.text(`Weaknesses: ${(aggregate.weaknesses || []).join(', ') || 'None'}`, 14, finalY + 22);
    doc.text('Comments:', 14, finalY + 36);
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    doc.text(aggregate.combined_comments || '', 14, finalY + 46, { maxWidth: 180 });

    doc.save(`${selectedCandidate.name}_Feedback.pdf`);
  };

  // ── NEW: Generate Offer Letter PDF ───────────────────────────────────────
  const handleGenerateOffer = (candidate) => {
    const doc = new jsPDF();
    const today = new Date().toLocaleDateString();
    
    // Find the actual role name from the roles state based on selectedRole ID
    const roleName = roles.find(r => String(r.role_id) === String(selectedRole))?.role || 'the specified role';

    // Letterhead
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Mirafra Technologies', 105, 25, { align: 'center' });
    
    doc.setFontSize(14);
    doc.text('OFFER OF EMPLOYMENT', 105, 40, { align: 'center' });

    // Date & Salutation
    doc.setFontSize(12);
    doc.setFont('times', 'normal');
    doc.text(`Date: ${today}`, 15, 60);
    doc.text(`Dear ${candidate.name},`, 15, 75);

    // Body Text
    const bodyText = `We are delighted to offer you the position of ${roleName} at Mirafra Technologies.\n\nFollowing your recent interviews, our team was highly impressed by your technical expertise, problem-solving skills, and the strong cultural fit you bring to our organization. We are confident that you will be a valuable addition to our team and will thrive in our fast-paced environment.\n\nYour compensation package, benefits details, and onboarding schedule will be shared in a follow-up email. Please review this preliminary offer letter and sign below to indicate your acceptance.\n\nWe look forward to welcoming you to Mirafra Technologies!`;

    doc.text(bodyText, 15, 90, { maxWidth: 180, lineHeightFactor: 1.5 });

    // Signatures
    doc.setFont('helvetica', 'bold');
    doc.text('Sincerely,', 15, 170);
    doc.setFont('times', 'normal');
    doc.text('Human Resources', 15, 180);
    doc.text('Mirafra Technologies', 15, 186);

    // Acceptance Section
    doc.setFont('helvetica', 'bold');
    doc.text('Accepted By:', 130, 170);
    doc.line(130, 182, 185, 182); // Signature Line
    doc.setFont('times', 'normal');
    doc.text('Signature & Date', 130, 188);

    // Download PDF
    doc.save(`${candidate.name}_Offer_Letter.pdf`);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedCandidate(null);
    setAggregate(null);
  };

  // ESC key closes modal
  useEffect(() => {
    const handleEsc = (e) => { if (e.keyCode === 27) closeModal(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []);

  // Dynamic round columns for the table
  const allRounds = getAllRounds(candidates);

  return (
    <div className="page-wrapper feedback-page">
      <h2 className="mb-4">Interview Feedback Summary</h2>

      {/* Role Selection */}
      <div className="mb-4">
        <label className="form-label">Select Role</label>
        <select
          className="form-select"
          value={selectedRole}
          onChange={(e) => {
            setSelectedRole(e.target.value);
            fetchCandidates(e.target.value);
          }}
        >
          <option value="">-- Select a Role --</option>
          {roles.map(r => (
            <option key={r.role_id} value={r.role_id}>
              {r.role} ({r.role_id})
            </option>
          ))}
        </select>
      </div>

      {/* Candidate Table */}
      {loading ? (
        <div className="text-center py-4">
          <Spinner animation="border" />
          <p>Loading candidates...</p>
        </div>
      ) : selectedRole && (
        <>
          {candidates.length === 0 ? (
            <p className="text-muted">No completed candidates found for this role.</p>
          ) : (
            <Table bordered hover responsive className="feedback-table">
              <thead className="table-light">
                <tr>
                  <th>Candidate ID</th>
                  <th>Name</th>
                  {/* Dynamic round columns */}
                  {allRounds.map(r => (
                    <th key={r}>L{r} Avg</th>
                  ))}
                  <th>Overall Avg</th>
                  <th>Resume</th>
                  <th>Aggregate</th>
                  <th>Offer</th> {/* NEW COLUMN HEADER */}
                </tr>
              </thead>
              <tbody>
                {candidates.map(c => {
                  const overall = getOverallAvg(c.interviews || []);
                  return (
                    <tr key={c.candidate_id}>
                      <td>{c.candidate_id}</td>
                      <td>{c.name}</td>
                      {allRounds.map(r => (
                        <td key={r}>{getRoundAvg(c.interviews || [], r)}</td>
                      ))}
                      <td>
                        {overall ? (
                          <strong>{overall} / 5</strong>
                        ) : '-'}
                      </td>
                      <td>
                        <Button
                          variant="outline-primary"
                          size="sm"
                          onClick={() =>
                            window.open(
                              `${BASE_URL}/get-resume/${c.candidate_id}?ngrok-skip-browser-warning=true`,
                              '_blank',
                              'noopener,noreferrer'
                            )
                          }
                        >
                          View Resume
                        </Button>
                      </td>
                      <td>
                        <Button variant="success" size="sm" onClick={() => handleViewAggregate(c)}>
                          <FaEye /> Check Verdict
                        </Button>
                      </td>
                      {/* NEW BUTTON COLUMN */}
                      <td>
                        <Button variant="primary" size="sm" onClick={() => handleGenerateOffer(c)}>
                          <FaFileAlt /> Generate Offer
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </>
      )}

      {/* Full-Screen Modal — unchanged styling */}
      {showModal && (
        <div className="custom-modal-overlay" onClick={closeModal}>
          <div className="custom-modal-container" onClick={e => e.stopPropagation()}>

            {/* Modal Header */}
            <div
              className={`custom-modal-header ${
                aggregate?.verdict === 'No Hire'     ? 'header-nohire'     :
                aggregate?.verdict === 'Weak Hire'   ? 'header-weakhire'   :
                aggregate?.verdict === 'Hire'        ? 'header-hire'       :
                aggregate?.verdict === 'Strong Hire' ? 'header-stronghire' :
                                                       'header-stronghire'
              }`}
            >
              <div className="header-content">
                <h2>
                  {selectedCandidate?.name}
                  <span className="candidate-id-badge">({selectedCandidate?.candidate_id})</span>
                </h2>
                {aggregate && (
                  <span className="verdict-badge">{aggregate.verdict}</span>
                )}
              </div>
              <button className="close-button" onClick={closeModal}><FaTimes /></button>
            </div>

            {/* Modal Body */}
            <div className="custom-modal-body">
              {fetchingAggregate ? (
                <div className="loading-container">
                  <Spinner animation="border" size="lg" />
                  <p>Fetching aggregate data...</p>
                </div>
              ) : aggregate ? (
                <div className="aggregate-content">

                  {/* Per-round breakdown table */}
                  {(selectedCandidate?.interviews || []).length > 0 && (
                    <div className="rounds-breakdown-section">
                      <h3>📋 Round-by-Round Breakdown</h3>
                      <table className="rounds-table">
                        <thead>
                          <tr>
                            <th>Round</th>
                            <th>Communication</th>
                            <th>Domain Knowledge</th>
                            <th>Problem Solving</th>
                            <th>Avg</th>
                            <th>Comments</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...(selectedCandidate.interviews || [])]
                            .sort((a, b) => a.round - b.round)
                            .map((interview, idx) => {
                              const avg = getRoundAvg(
                                selectedCandidate.interviews, interview.round
                              );
                              return (
                                <tr key={idx}>
                                  <td><span className="round-pill">L{interview.round}</span></td>
                                  <td>{interview.ratings?.communication ?? '-'}</td>
                                  <td>{interview.ratings?.domain_knowledge ?? '-'}</td>
                                  <td>{interview.ratings?.problem_solving ?? '-'}</td>
                                  <td><strong>{avg}</strong></td>
                                  <td className="comment-cell">
                                    {interview.comments || '—'}
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Chart and Score Section */}
                  <div className="chart-score-section">
                    <div className="chart-container">
                      <h3>Skills Assessment</h3>
                      <div className="radar-chart">
                        <Radar
                          data={{
                            labels: ['Communication', 'Problem Solving', 'Domain Knowledge'],
                            datasets: [{
                              label: 'Average Scores',
                              data: [
                                aggregate.average_scores.communication,
                                aggregate.average_scores.problem_solving,
                                aggregate.average_scores.domain_knowledge,
                              ],
                              backgroundColor: 'rgba(59, 130, 246, 0.3)',
                              borderColor: 'rgba(59, 130, 246, 1)',
                              borderWidth: 3,
                              pointBackgroundColor: 'rgba(59, 130, 246, 1)',
                              pointBorderColor: '#fff',
                              pointBorderWidth: 3,
                              pointRadius: 8,
                            }],
                          }}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            scales: {
                              r: {
                                min: 0, max: 5,
                                ticks: { stepSize: 1, font: { size: 14, weight: 'bold' }, color: '#64748b' },
                                grid: { color: '#e2e8f0' },
                                angleLines: { color: '#e2e8f0' }
                              },
                            },
                            plugins: {
                              legend: {
                                display: true, position: 'bottom',
                                labels: { font: { size: 16, weight: 'bold' }, color: '#1e293b', padding: 25 }
                              }
                            }
                          }}
                        />
                      </div>
                    </div>

                    <div className="score-container">
                      <div className="overall-score-display">
                        <div className="score-number">{aggregate.average_scores.overall_average}</div>
                        <div className="score-label">Overall Average</div>
                        <div className="score-out-of">/5.0</div>
                      </div>
                      <div className="progress-bar-container">
                        <div className="progress-bar-bg">
                          <div
                            className={`progress-bar-fill ${
                              aggregate.average_scores.overall_average >= 3
                                ? 'progress-success' : 'progress-danger'
                            }`}
                            style={{ width: `${(aggregate.average_scores.overall_average / 5) * 100}%` }}
                          />
                        </div>
                      </div>
                      <button className="download-report-btn" onClick={handleDownloadPDF}>
                        <FaDownload /> Download Report
                      </button>
                    </div>
                  </div>

                  {/* Strengths & Weaknesses */}
                  <div className="strengths-weaknesses-section">
                    <div className="strengths-container">
                      <h3>💪 Strengths</h3>
                      <div className="tags-wrapper">
                        {(aggregate.strengths || []).length > 0
                          ? aggregate.strengths.map((s, i) => (
                              <span className="strength-tag" key={i}>{s}</span>
                            ))
                          : <span className="no-data">No specific strengths noted</span>}
                      </div>
                    </div>
                    <div className="weaknesses-container">
                      <h3>⚠️ Areas for Improvement</h3>
                      <div className="tags-wrapper">
                        {(aggregate.weaknesses || []).length > 0
                          ? aggregate.weaknesses.map((w, i) => (
                              <span className="weakness-tag" key={i}>{w}</span>
                            ))
                          : <span className="no-data">No specific weaknesses noted</span>}
                      </div>
                    </div>
                  </div>

                  {/* Combined Comments */}
                  <div className="comments-section">
                    <h3>📝 Detailed Feedback</h3>
                    <div className="comments-content">
                      {aggregate.combined_comments || 'No detailed comments available.'}
                    </div>
                  </div>

                </div>
              ) : (
                <div className="no-data-container">
                  <p>No aggregate data available for this candidate.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}