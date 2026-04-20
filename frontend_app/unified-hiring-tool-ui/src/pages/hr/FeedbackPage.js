// src/pages/hr/FeedbackPage.js

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Radar } from 'react-chartjs-2';
import { Button, Table, Spinner } from 'react-bootstrap';
import { FaEye, FaDownload, FaTimes, FaFileAlt, FaEdit, FaPaperPlane } from 'react-icons/fa';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './FeedbackPage.css';

const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';
const axiosConfig = { headers: { 'ngrok-skip-browser-warning': 'true' } };

// ── COMPANY CONSTANTS ────────────────────────────────────────────────────
const COMPANY = {
  name: 'Mirafra Technology',
  addressLine1: 'Mirafra Technologies Pvt. Ltd.',
  addressLine2: 'Bangalore, Karnataka, India',
  email: 'hr@mirafra.com',
  website: 'www.mirafra.com',
};

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

function getAllRounds(candidates) {
  const rounds = new Set();
  candidates.forEach(c =>
    (c.interviews || []).forEach(i => rounds.add(i.round))
  );
  return [...rounds].sort((a, b) => a - b);
}

function getOverallAvg(interviews = []) {
  if (!interviews.length) return null;
  let total = 0, count = 0;
  interviews.forEach(i => {
    Object.values(i.ratings || {}).forEach(v => { total += v; count++; });
  });
  return count > 0 ? (total / count).toFixed(2) : null;
}

// ── Format currency in Indian format ─────────────────────────────────────
const formatINR = (n) => {
  if (!n && n !== 0) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(n));
};

// ── Build the offer letter body text from the form data ─────────────────
const buildOfferLetter = (data) => {
  const fixed = Number(data.fixedCTC) || 0;
  const variable = Number(data.variableCTC) || 0;
  const total = fixed + variable;
  const joinDate = data.joiningDate
    ? new Date(data.joiningDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';
  const issueDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

  return `Date: ${issueDate}

To,
${data.candidateName}
${data.candidateAddress || 'Address on file'}

Dear ${data.candidateName?.split(' ')[0] || 'Candidate'},

Subject: Offer of Employment — ${data.designation}

We are pleased to offer you the position of ${data.designation} at ${COMPANY.name}, reporting to ${data.reportingManager || '—'} at our ${data.workLocation || '—'} office. We were impressed by your candidature during the interview process and believe you will be a valuable addition to our team.

The terms of your employment are as follows:

1. Position & Joining
   Designation         : ${data.designation}
   Department          : ${data.department || '—'}
   Work Location       : ${data.workLocation || '—'}
   Reporting Manager   : ${data.reportingManager || '—'}
   Date of Joining     : ${joinDate}
   Employment Type     : ${data.employmentType || 'Full-time'}

2. Compensation (Annual)
   Fixed CTC           : ${formatINR(fixed)}
   Variable Pay        : ${formatINR(variable)}
   Total CTC           : ${formatINR(total)}

3. Probation & Notice
   Probation Period    : ${data.probationPeriod || '6 months'}
   Notice Period       : ${data.noticePeriod || '60 days'}

4. Benefits
   ${data.benefits || 'As per company policy — health insurance, paid leave, and applicable statutory benefits.'}

${data.additionalComments ? `5. Additional Notes\n   ${data.additionalComments}\n\n` : ''}This offer is contingent upon successful completion of background verification and submission of the required documents prior to your joining date. Your employment will be governed by the standard terms and policies of ${COMPANY.name}.

To accept this offer, please sign and return a copy of this letter by email to ${COMPANY.email}.

We look forward to welcoming you to the team.

Warm regards,

HR Team
${COMPANY.name}
${COMPANY.email} | ${COMPANY.website}`;
};

// ── Default form values ──────────────────────────────────────────────────
const emptyOfferForm = {
  candidateName: '',
  candidateEmail: '',
  candidateAddress: '',
  designation: '',
  department: '',
  workLocation: 'Bangalore, Karnataka',
  reportingManager: '',
  joiningDate: '',
  employmentType: 'Full-time',
  fixedCTC: '',
  variableCTC: '',
  probationPeriod: '6 months',
  noticePeriod: '60 days',
  benefits: '',
  additionalComments: '',
};

export default function FeedbackPage() {
  const [roles, setRoles]                     = useState([]);
  const [selectedRole, setSelectedRole]       = useState('');
  const [candidates, setCandidates]           = useState([]);
  const [loading, setLoading]                 = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [aggregate, setAggregate]             = useState(null);
  const [showModal, setShowModal]             = useState(false);
  const [fetchingAggregate, setFetchingAggregate] = useState(false);
  const [candidateVerdicts, setCandidateVerdicts] = useState({});

  // ── Offer letter state ────────────────────────────────────────────────
  const [offerStage, setOfferStage] = useState('closed');
  const [offerCandidate, setOfferCandidate] = useState(null);
  const [offerForm, setOfferForm] = useState(emptyOfferForm);
  const [editedLetter, setEditedLetter] = useState('');
  const [isEditingLetter, setIsEditingLetter] = useState(false);
  const [sendStatus, setSendStatus] = useState('');
  const [sendMessage, setSendMessage] = useState('');

  // ── Fetch roles ───────────────────────────────────────────────────────
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

  // ── Fetch candidates + pre-fetch verdicts for offer button visibility ─
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

      const verdictMap = {};
      await Promise.all(filtered.map(async (c) => {
        try {
          const agg = await axios.get(
            `${BASE_URL}/aggregate-interviews/${c.candidate_id}?fresh=${Date.now()}`,
            axiosConfig
          );
          verdictMap[c.candidate_id] = agg.data?.verdict || null;
        } catch {
          verdictMap[c.candidate_id] = null;
        }
      }));
      setCandidateVerdicts(verdictMap);
    } catch (err) {
      console.error('Failed to fetch candidates:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── View aggregate modal ──────────────────────────────────────────────
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

  // ── PDF export of feedback report ─────────────────────────────────────
  const handleDownloadPDF = () => {
    if (!aggregate || !selectedCandidate) return;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Candidate Feedback Report', 14, 15);
    doc.setFontSize(11);
    doc.text(`Candidate: ${selectedCandidate.name} (${selectedCandidate.candidate_id})`, 14, 25);
    doc.text(`Verdict: ${aggregate.verdict}`, 14, 35);

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

    const interviews = selectedCandidate.interviews || [];
    const sortedRounds = [...interviews].sort((a, b) => a.round - b.round);
    if (sortedRounds.length > 0) {
      let y = doc.lastAutoTable.finalY + 10;
      doc.setFontSize(11);
      doc.text('Per-Round Scores:', 14, y);
      autoTable(doc, {
        startY: y + 5,
        head: [['Round', 'Communication', 'Domain Knowledge', 'Problem Solving', 'Avg']],
        body: sortedRounds.map(i => [
          `L${i.round}`,
          i.ratings?.communication ?? '-',
          i.ratings?.domain_knowledge ?? '-',
          i.ratings?.problem_solving ?? '-',
          getRoundAvg(interviews, i.round),
        ]),
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

  const closeModal = () => {
    setShowModal(false);
    setSelectedCandidate(null);
    setAggregate(null);
  };

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.keyCode === 27) {
        if (offerStage !== 'closed') closeOfferFlow();
        else closeModal();
      }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [offerStage]); // eslint-disable-line

  // ── OFFER LETTER FLOW ─────────────────────────────────────────────────
  const openOfferFlow = (candidate) => {
    const roleName = roles.find(r => String(r.role_id) === String(candidate.applied_role_id))?.role || candidate.applied_role || '';
    setOfferCandidate(candidate);
    setOfferForm({
      ...emptyOfferForm,
      candidateName: candidate.name || '',
      candidateEmail: candidate.email || '',
      candidateAddress: candidate.location || '',
      designation: roleName,
    });
    setEditedLetter('');
    setIsEditingLetter(false);
    setSendStatus('');
    setSendMessage('');
    setOfferStage('form');
  };

  const closeOfferFlow = () => {
    setOfferStage('closed');
    setOfferCandidate(null);
    setOfferForm(emptyOfferForm);
    setEditedLetter('');
    setIsEditingLetter(false);
    setSendStatus('');
    setSendMessage('');
  };

  const handleOfferFormSubmit = (e) => {
    e.preventDefault();
    if (!offerForm.candidateEmail || !offerForm.designation || !offerForm.joiningDate || !offerForm.fixedCTC) {
      alert('Please fill in Candidate Email, Designation, Joining Date, and Fixed CTC (required fields).');
      return;
    }
    setEditedLetter(buildOfferLetter(offerForm));
    setOfferStage('preview');
  };

  // ── Download offer letter as PDF ──────────────────────────────────────
  const handleDownloadOffer = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(30, 58, 138);
    doc.text(COMPANY.name, pageWidth / 2, 20, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(COMPANY.addressLine2, pageWidth / 2, 27, { align: 'center' });
    doc.text(`${COMPANY.email}  |  ${COMPANY.website}`, pageWidth / 2, 33, { align: 'center' });

    doc.setDrawColor(30, 58, 138);
    doc.setLineWidth(0.5);
    doc.line(14, 38, pageWidth - 14, 38);

    doc.setFont('times', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    const bodyText = isEditingLetter ? editedLetter : buildOfferLetter(offerForm);
    const lines = doc.splitTextToSize(bodyText, pageWidth - 28);
    doc.text(lines, 14, 48);

    const safeName = (offerForm.candidateName || 'Candidate').replace(/\s+/g, '_');
    doc.save(`Offer_Letter_${safeName}.pdf`);
  };

  // ── Send via backend SMTP endpoint ────────────────────────────────────
  const handleSendOffer = async () => {
    setOfferStage('sending');
    setSendStatus('sending');
    setSendMessage('Sending offer letter...');

    try {
      const letterBody = isEditingLetter ? editedLetter : buildOfferLetter(offerForm);
      const payload = {
        candidate_id: offerCandidate.candidate_id,
        candidate_name: offerForm.candidateName,
        candidate_email: offerForm.candidateEmail,
        designation: offerForm.designation,
        company_name: COMPANY.name,
        letter_body: letterBody,
      };

      const res = await axios.post(`${BASE_URL}/send-offer-letter/`, payload, axiosConfig);

      if (res.data?.success) {
        setSendStatus('success');
        setSendMessage(`Offer letter sent successfully to ${offerForm.candidateEmail}`);
        setTimeout(() => closeOfferFlow(), 3000);
      } else {
        setSendStatus('error');
        setSendMessage(res.data?.message || 'Failed to send offer letter.');
        setOfferStage('preview');
      }
    } catch (err) {
      console.error('Failed to send offer:', err);
      setSendStatus('error');
      setSendMessage(
        err.response?.data?.detail ||
        err.response?.data?.message ||
        'Failed to send offer letter. Please check backend SMTP configuration.'
      );
      setOfferStage('preview');
    }
  };

  const allRounds = getAllRounds(candidates);

  const canGenerateOffer = (candidate) => {
    const v = candidateVerdicts[candidate.candidate_id];
    return v === 'Hire' || v === 'Strong Hire';
  };

  return (
    <div className="container feedback-page mt-4">
      <h2 className="mb-4">Interview Feedback Summary</h2>

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
                  {allRounds.map(r => (
                    <th key={r}>L{r} Avg</th>
                  ))}
                  <th>Overall Avg</th>
                  <th>Resume</th>
                  <th>Aggregate</th>
                  <th>Offer</th>
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
                        {overall ? <strong>{overall} / 5</strong> : '-'}
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
                          <FaEye /> View Aggregate
                        </Button>
                      </td>
                      <td>
                        {canGenerateOffer(c) ? (
                          <Button
                            size="sm"
                            className="btn-generate-offer"
                            onClick={() => openOfferFlow(c)}
                          >
                            <FaFileAlt /> Generate Offer
                          </Button>
                        ) : (
                          <span className="text-muted" style={{ fontSize: '0.78rem' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </>
      )}

      {/* ─── AGGREGATE VIEW MODAL (existing) ─────────────────────────── */}
      {showModal && (
        <div className="custom-modal-overlay" onClick={closeModal}>
          <div className="custom-modal-container" onClick={e => e.stopPropagation()}>
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
                {aggregate && <span className="verdict-badge">{aggregate.verdict}</span>}
              </div>
              <button className="close-button" onClick={closeModal}><FaTimes /></button>
            </div>

            <div className="custom-modal-body">
              {fetchingAggregate ? (
                <div className="loading-container">
                  <Spinner animation="border" size="lg" />
                  <p>Fetching aggregate data...</p>
                </div>
              ) : aggregate ? (
                <div className="aggregate-content">
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
                              const avg = getRoundAvg(selectedCandidate.interviews, interview.round);
                              return (
                                <tr key={idx}>
                                  <td><span className="round-pill">L{interview.round}</span></td>
                                  <td>{interview.ratings?.communication ?? '-'}</td>
                                  <td>{interview.ratings?.domain_knowledge ?? '-'}</td>
                                  <td>{interview.ratings?.problem_solving ?? '-'}</td>
                                  <td><strong>{avg}</strong></td>
                                  <td className="comment-cell">{interview.comments || '—'}</td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}

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
                              r: { min: 0, max: 5,
                                ticks: { stepSize: 1, font: { size: 14, weight: 'bold' }, color: '#64748b' },
                                grid: { color: '#e2e8f0' },
                                angleLines: { color: '#e2e8f0' }
                              },
                            },
                            plugins: {
                              legend: { display: true, position: 'bottom',
                                labels: { font: { size: 16, weight: 'bold' }, color: '#1e293b', padding: 25 } }
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

      {/* ─── OFFER: STEP 1 — FORM ─────────────────────────────────────── */}
      {offerStage === 'form' && offerCandidate && (
        <div className="custom-modal-overlay" onClick={closeOfferFlow}>
          <div className="offer-modal" onClick={e => e.stopPropagation()}>
            <div className="offer-modal-header">
              <div>
                <h2>Generate Offer Letter</h2>
                <p className="offer-sub">For <strong>{offerCandidate.name}</strong> ({offerCandidate.candidate_id}) · {COMPANY.name}</p>
              </div>
              <button className="close-button" onClick={closeOfferFlow}><FaTimes /></button>
            </div>

            <form className="offer-form" onSubmit={handleOfferFormSubmit}>
              <div className="offer-form-section">
                <h4>👤 Candidate Details</h4>
                <div className="offer-grid">
                  <div className="offer-field">
                    <label>Candidate Name *</label>
                    <input type="text" required
                      value={offerForm.candidateName}
                      onChange={e => setOfferForm({ ...offerForm, candidateName: e.target.value })} />
                  </div>
                  <div className="offer-field">
                    <label>Candidate Email *</label>
                    <input type="email" required
                      value={offerForm.candidateEmail}
                      onChange={e => setOfferForm({ ...offerForm, candidateEmail: e.target.value })}
                      placeholder="candidate@example.com" />
                  </div>
                  <div className="offer-field offer-field-full">
                    <label>Address</label>
                    <input type="text"
                      value={offerForm.candidateAddress}
                      onChange={e => setOfferForm({ ...offerForm, candidateAddress: e.target.value })}
                      placeholder="City, State" />
                  </div>
                </div>
              </div>

              <div className="offer-form-section">
                <h4>💼 Position Details</h4>
                <div className="offer-grid">
                  <div className="offer-field">
                    <label>Designation *</label>
                    <input type="text" required
                      value={offerForm.designation}
                      onChange={e => setOfferForm({ ...offerForm, designation: e.target.value })} />
                  </div>
                  <div className="offer-field">
                    <label>Department</label>
                    <input type="text"
                      value={offerForm.department}
                      onChange={e => setOfferForm({ ...offerForm, department: e.target.value })}
                      placeholder="e.g. Engineering" />
                  </div>
                  <div className="offer-field">
                    <label>Work Location</label>
                    <input type="text"
                      value={offerForm.workLocation}
                      onChange={e => setOfferForm({ ...offerForm, workLocation: e.target.value })} />
                  </div>
                  <div className="offer-field">
                    <label>Reporting Manager</label>
                    <input type="text"
                      value={offerForm.reportingManager}
                      onChange={e => setOfferForm({ ...offerForm, reportingManager: e.target.value })} />
                  </div>
                  <div className="offer-field">
                    <label>Joining Date *</label>
                    <input type="date" required
                      value={offerForm.joiningDate}
                      onChange={e => setOfferForm({ ...offerForm, joiningDate: e.target.value })} />
                  </div>
                  <div className="offer-field">
                    <label>Employment Type</label>
                    <select
                      value={offerForm.employmentType}
                      onChange={e => setOfferForm({ ...offerForm, employmentType: e.target.value })}>
                      <option>Full-time</option>
                      <option>Contract</option>
                      <option>Intern</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="offer-form-section">
                <h4>💰 Compensation (Annual, INR)</h4>
                <div className="offer-grid">
                  <div className="offer-field">
                    <label>Fixed CTC *</label>
                    <input type="number" required min="0"
                      value={offerForm.fixedCTC}
                      onChange={e => setOfferForm({ ...offerForm, fixedCTC: e.target.value })}
                      placeholder="e.g. 800000" />
                  </div>
                  <div className="offer-field">
                    <label>Variable Pay</label>
                    <input type="number" min="0"
                      value={offerForm.variableCTC}
                      onChange={e => setOfferForm({ ...offerForm, variableCTC: e.target.value })}
                      placeholder="e.g. 100000" />
                  </div>
                  <div className="offer-field">
                    <label>Total CTC (auto)</label>
                    <input type="text" disabled
                      value={formatINR((Number(offerForm.fixedCTC) || 0) + (Number(offerForm.variableCTC) || 0))} />
                  </div>
                </div>
              </div>

              <div className="offer-form-section">
                <h4>📋 Terms</h4>
                <div className="offer-grid">
                  <div className="offer-field">
                    <label>Probation Period</label>
                    <input type="text"
                      value={offerForm.probationPeriod}
                      onChange={e => setOfferForm({ ...offerForm, probationPeriod: e.target.value })} />
                  </div>
                  <div className="offer-field">
                    <label>Notice Period</label>
                    <input type="text"
                      value={offerForm.noticePeriod}
                      onChange={e => setOfferForm({ ...offerForm, noticePeriod: e.target.value })} />
                  </div>
                  <div className="offer-field offer-field-full">
                    <label>Benefits</label>
                    <textarea rows="2"
                      value={offerForm.benefits}
                      onChange={e => setOfferForm({ ...offerForm, benefits: e.target.value })}
                      placeholder="Health insurance, paid leave, etc. Leave blank for standard policy." />
                  </div>
                  <div className="offer-field offer-field-full">
                    <label>Additional Comments</label>
                    <textarea rows="2"
                      value={offerForm.additionalComments}
                      onChange={e => setOfferForm({ ...offerForm, additionalComments: e.target.value })}
                      placeholder="Any special notes or clauses…" />
                  </div>
                </div>
              </div>

              <div className="offer-form-actions">
                <button type="button" className="btn-offer-cancel" onClick={closeOfferFlow}>
                  Cancel
                </button>
                <button type="submit" className="btn-offer-primary">
                  Generate Preview →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── OFFER: STEP 2 — PREVIEW ──────────────────────────────────── */}
      {offerStage === 'preview' && offerCandidate && (
        <div className="custom-modal-overlay" onClick={closeOfferFlow}>
          <div className="offer-modal offer-preview-modal" onClick={e => e.stopPropagation()}>
            <div className="offer-modal-header">
              <div>
                <h2>Offer Letter Preview</h2>
                <p className="offer-sub">Review before sending to <strong>{offerForm.candidateEmail || offerCandidate.name}</strong></p>
              </div>
              <button className="close-button" onClick={closeOfferFlow}><FaTimes /></button>
            </div>

            {sendStatus === 'error' && sendMessage && (
              <div className="offer-alert offer-alert-error">{sendMessage}</div>
            )}

            <div className="offer-preview-wrap">
              <div className="offer-letter-header-pdf">
                <div className="offer-company-name">{COMPANY.name}</div>
                <div className="offer-company-meta">{COMPANY.addressLine2}</div>
                <div className="offer-company-meta">{COMPANY.email} · {COMPANY.website}</div>
              </div>
              {isEditingLetter ? (
                <textarea
                  className="offer-letter-editor"
                  value={editedLetter}
                  onChange={e => setEditedLetter(e.target.value)}
                />
              ) : (
                <pre className="offer-letter-preview">{editedLetter || buildOfferLetter(offerForm)}</pre>
              )}
            </div>

            <div className="offer-preview-actions">
              <button className="btn-offer-secondary" onClick={() => {
                setIsEditingLetter(false);
                setOfferStage('form');
              }}>
                ← Back to Form
              </button>
              {!isEditingLetter ? (
                <button className="btn-offer-secondary" onClick={() => {
                  setEditedLetter(editedLetter || buildOfferLetter(offerForm));
                  setIsEditingLetter(true);
                }}>
                  <FaEdit /> Edit Letter
                </button>
              ) : (
                <button className="btn-offer-secondary" onClick={() => setIsEditingLetter(false)}>
                  Done Editing
                </button>
              )}
              <button className="btn-offer-download" onClick={handleDownloadOffer}>
                <FaDownload /> Download PDF
              </button>
              <button className="btn-offer-send" onClick={() => setOfferStage('confirm-send')}>
                <FaPaperPlane /> Send to Candidate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── OFFER: STEP 3 — CONFIRM SEND ─────────────────────────────── */}
      {offerStage === 'confirm-send' && offerCandidate && (
        <div className="custom-modal-overlay" onClick={() => setOfferStage('preview')}>
          <div className="offer-confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="offer-confirm-icon">📧</div>
            <h3>Send Offer Letter?</h3>
            <p>
              Do you want to send the offer letter to candidate <strong>{offerForm.candidateName}</strong>?
            </p>
            <p className="offer-confirm-email">
              📨 It will be emailed to: <strong>{offerForm.candidateEmail}</strong>
            </p>
            <div className="offer-confirm-actions">
              <button className="btn-offer-cancel" onClick={() => setOfferStage('preview')}>
                No, go back
              </button>
              <button className="btn-offer-send" onClick={handleSendOffer}>
                Yes, Send Offer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── OFFER: STEP 4 — SENDING / SUCCESS ────────────────────────── */}
      {offerStage === 'sending' && (
        <div className="custom-modal-overlay">
          <div className="offer-confirm-modal">
            {sendStatus === 'sending' && (
              <>
                <Spinner animation="border" />
                <h3 style={{ marginTop: '1rem' }}>Sending offer letter…</h3>
                <p>{sendMessage}</p>
              </>
            )}
            {sendStatus === 'success' && (
              <>
                <div className="offer-confirm-icon" style={{ color: '#059669' }}>✓</div>
                <h3>Sent Successfully!</h3>
                <p>{sendMessage}</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}