// src/pages/hr/FeedbackPage.js

import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Radar } from 'react-chartjs-2';
import { Button, Table, Spinner, Tabs, Tab } from 'react-bootstrap';
import { FaEye, FaDownload, FaTimes, FaFileAlt, FaUndo, FaCheck, FaUserTimes } from 'react-icons/fa';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import OfferLetterModal from '../../components/OfferLetterModal';
import './FeedbackPage.css';

const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';
const axiosConfig = { headers: { 'ngrok-skip-browser-warning': 'true' } };

// ── Toast Component ───────────────────────────────────────────────────────────
function Toast({ toasts }) {
  return (
    <div className="fp-toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`fp-toast fp-toast--${t.type}`}>
          <span className="fp-toast-icon">{t.type === 'success' ? '✓' : '✕'}</span>
          <span className="fp-toast-msg">{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ── Confirmation Dialog ───────────────────────────────────────────────────────
function ConfirmDialog({ config, onConfirm, onCancel }) {
  if (!config) return null;
  return (
    <div className="fp-confirm-overlay" onClick={onCancel}>
      <div className="fp-confirm-box" onClick={e => e.stopPropagation()}>
        <div className="fp-confirm-icon">{config.icon || '❓'}</div>
        <h4 className="fp-confirm-title">{config.title}</h4>
        <p className="fp-confirm-msg">{config.message}</p>
        <div className="fp-confirm-actions">
          <button className="fp-confirm-btn fp-confirm-btn--cancel" onClick={onCancel}>
            Cancel
          </button>
          <button
            className={`fp-confirm-btn fp-confirm-btn--ok fp-confirm-btn--${config.variant || 'success'}`}
            onClick={onConfirm}
          >
            {config.confirmLabel || 'Yes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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
  candidates.forEach(c => (c.interviews || []).forEach(i => rounds.add(i.round)));
  return [...rounds].sort((a, b) => a - b);
}

function getOverallAvg(interviews = []) {
  if (!interviews.length) return null;
  let total = 0, count = 0;
  interviews.forEach(i => { Object.values(i.ratings || {}).forEach(v => { total += v; count++; }); });
  return count > 0 ? (total / count).toFixed(2) : null;
}

function getSection(c) {
  if (c.candidate_joined)     return 'joined';
  if (c.candidate_not_joined) return 'not_joined';
  if (c.candidate_rejected)   return 'rejected';
  if (c.candidate_selected)   return 'selected';
  return null;
}

export default function FeedbackPage() {
  const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
  const hrId = storedUser.user_id || null;

  const [roles, setRoles]                         = useState([]);
  const [selectedRole, setSelectedRole]           = useState('');
  const [candidates, setCandidates]               = useState([]);
  const [loading, setLoading]                     = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [aggregate, setAggregate]                 = useState(null);
  const [showModal, setShowModal]                 = useState(false);
  const [fetchingAggregate, setFetchingAggregate] = useState(false);
  const [activeTab, setActiveTab]                 = useState('selected');
  const [offerCandidate, setOfferCandidate]       = useState(null);

  // ── Toast state ──────────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([]);

  const showToast = (msg, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, msg, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  };

  // ── Confirm dialog state ─────────────────────────────────────────────────────
  const [confirmConfig,   setConfirmConfig]   = useState(null);
  const [confirmCallback, setConfirmCallback] = useState(null);

  const askConfirm = (config) =>
    new Promise((resolve) => {
      setConfirmConfig(config);
      setConfirmCallback(() => resolve);
    });

  const handleConfirmYes = () => {
    setConfirmConfig(null);
    confirmCallback && confirmCallback(true);
    setConfirmCallback(null);
  };

  const handleConfirmNo = () => {
    setConfirmConfig(null);
    confirmCallback && confirmCallback(false);
    setConfirmCallback(null);
  };

  // ── Mark offer generated ──────────────────────────────────────────────────────
  const markOfferGenerated = async (candidateId, offerDetails) => {
    try {
      await axios.post(
        `${BASE_URL}/mark-offer-generated/${candidateId}`,
        { offer_details: offerDetails },
        axiosConfig
      );
      setCandidates(prev =>
        prev.map(c => c.candidate_id === candidateId
          ? { ...c, offer_generated: true, offer_details: offerDetails }
          : c)
      );
      showToast('Offer letter generated successfully.');
    } catch (err) {
      console.error('Failed to mark offer generated:', err);
      showToast('Failed to save offer details.', 'error');
    }
  };

  // ── Fetch roles ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const params = hrId ? { hr_id: hrId } : {};
    axios.get(`${BASE_URL}/get-roles/`, { ...axiosConfig, params })
      .then(res => {
        const openRoles = Array.isArray(res.data)
          ? res.data.filter(r => r.status?.toLowerCase().trim() === 'open')
          : [];
        setRoles(openRoles);
      })
      .catch(err => {
        console.error('Failed to fetch roles:', err);
        showToast('Failed to fetch roles.', 'error');
      });
  }, []); // eslint-disable-line

  const fetchCandidates = async (roleId) => {
    setLoading(true);
    try {
      const params = hrId ? { hr_id: hrId } : {};
      const res = await axios.get(`${BASE_URL}/get-candidates/`, { ...axiosConfig, params });
      const filtered = Array.isArray(res.data)
        ? res.data.filter(
            c => String(c.applied_role_id) === String(roleId) && (
              c.candidate_selected   === true ||
              c.candidate_rejected   === true ||
              c.candidate_joined     === true ||
              c.candidate_not_joined === true
            )
          )
        : [];
      setCandidates(filtered);
    } catch (err) {
      console.error('Failed to fetch candidates:', err);
      showToast('Failed to fetch candidates.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const refresh = () => { if (selectedRole) fetchCandidates(selectedRole); };

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
      showToast('Failed to fetch interview aggregate.', 'error');
    } finally {
      setFetchingAggregate(false);
    }
  };

  // ── Joined / Not Joined / Undo handlers ──────────────────────────────────────
  const handleMarkJoined = async (candidate) => {
    const yes = await askConfirm({
      icon: '✅',
      title: `Mark "${candidate.name}" as Joined?`,
      message: 'This will record that the candidate accepted the offer and has joined the company.',
      confirmLabel: 'Yes, Mark Joined',
      variant: 'success'
    });
    if (!yes) return;
    try {
      await axios.post(`${BASE_URL}/mark-joined/${candidate.candidate_id}`, {}, axiosConfig);
      refresh();
      showToast(`${candidate.name} marked as Joined.`);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Please try again.';
      showToast(`Failed: ${msg}`, 'error');
    }
  };

  const handleMarkNotJoined = async (candidate) => {
    const yes = await askConfirm({
      icon: '🚪',
      title: `Mark "${candidate.name}" as Not Joined?`,
      message: 'This will record that the candidate declined or did not join after receiving the offer.',
      confirmLabel: 'Yes, Mark Not Joined',
      variant: 'warning'
    });
    if (!yes) return;
    try {
      await axios.post(`${BASE_URL}/mark-not-joined/${candidate.candidate_id}`, {}, axiosConfig);
      refresh();
      showToast(`${candidate.name} marked as Not Joined.`);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Please try again.';
      showToast(`Failed: ${msg}`, 'error');
    }
  };

  const handleUndoJoinedStatus = async (candidate) => {
    const yes = await askConfirm({
      icon: '↩️',
      title: `Move "${candidate.name}" back to Selected?`,
      message: 'The Joined / Not Joined status will be cleared. The offer letter will remain on record.',
      confirmLabel: 'Yes, Undo',
      variant: 'warning'
    });
    if (!yes) return;
    try {
      await axios.post(`${BASE_URL}/undo-joined-status/${candidate.candidate_id}`, {}, axiosConfig);
      refresh();
      showToast(`${candidate.name} moved back to Selected.`);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Please try again.';
      showToast(`Failed: ${msg}`, 'error');
    }
  };

  const handleUndoRejected = async (candidate) => {
    const yes = await askConfirm({
      icon: '↩️',
      title: `Move "${candidate.name}" back to Pending?`,
      message: 'The rejected verdict will be cleared. They will reappear on the Schedule page for further interviews.',
      confirmLabel: 'Yes, Undo',
      variant: 'warning'
    });
    if (!yes) return;
    try {
      await axios.post(`${BASE_URL}/undo-candidate-verdict/${candidate.candidate_id}`, {}, axiosConfig);
      refresh();
      showToast(`${candidate.name} moved back to Pending.`);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Please try again.';
      showToast(`Failed: ${msg}`, 'error');
    }
  };

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
        ['Communication',    aggregate.average_scores.communication],
        ['Problem Solving',  aggregate.average_scores.problem_solving],
        ['Domain Knowledge', aggregate.average_scores.domain_knowledge],
        ['Overall Average',  aggregate.average_scores.overall_average],
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
        body: sortedRounds.map(i => {
          const avg = getRoundAvg(interviews, i.round);
          return [`L${i.round}`, i.ratings?.communication ?? '-', i.ratings?.domain_knowledge ?? '-', i.ratings?.problem_solving ?? '-', avg];
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
    showToast('PDF report downloaded.');
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedCandidate(null);
    setAggregate(null);
  };

  useEffect(() => {
    const handleEsc = (e) => { if (e.keyCode === 27) closeModal(); };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, []); // eslint-disable-line

  // ── Partition candidates ──────────────────────────────────────────────────────
  const selectedList  = candidates.filter(c => getSection(c) === 'selected');
  const joinedList    = candidates.filter(c => getSection(c) === 'joined');
  const notJoinedList = candidates.filter(c => getSection(c) === 'not_joined');
  const rejectedList  = candidates.filter(c => getSection(c) === 'rejected');

  const allRounds = getAllRounds(candidates);
  const selectedRoleName = roles.find(r => String(r.role_id) === String(selectedRole))?.role || '';

  // ── Shared row renderer ───────────────────────────────────────────────────────
  const renderRow = (c, sectionKey) => {
    const overall = getOverallAvg(c.interviews || []);
    const overallNum = parseFloat(overall);
    const canGenerateOffer = c.candidate_selected === true && overallNum >= 3;
    const inSelected = sectionKey === 'selected';
    const offerOut   = c.offer_generated === true;
    const canMarkPostOffer = inSelected && offerOut;

    return (
      <tr key={c.candidate_id}>
        <td>{c.candidate_id}</td>
        <td>{c.name}</td>
        {allRounds.map(r => <td key={r}>{getRoundAvg(c.interviews || [], r)}</td>)}
        <td>{overall ? <strong>{overall} / 5</strong> : '-'}</td>

        {/* Resume */}
        <td>
          <Button
            variant="outline-primary" size="sm"
            onClick={() => window.open(
              `${BASE_URL}/get-resume/${c.candidate_id}?ngrok-skip-browser-warning=true`,
              '_blank', 'noopener,noreferrer'
            )}
          >
            View Resume
          </Button>
        </td>

        {/* View Aggregate */}
        <td>
          <Button variant="success" size="sm" onClick={() => handleViewAggregate(c)}>
            <FaEye /> View Aggregate
          </Button>
        </td>

        {/* Offer generated badge */}
        <td style={{ textAlign: 'center' }}>
          {c.offer_generated
            ? <span className="badge bg-success">✓ Yes</span>
            : <span className="badge bg-secondary">No</span>}
        </td>

        {/* Offer button */}
        <td>
          {sectionKey === 'rejected' ? (
            <Button variant="secondary" size="sm" disabled title="Not available for rejected candidates">
              <FaFileAlt /> Generate Offer
            </Button>
          ) : c.offer_generated ? (
            <Button
              variant="success" size="sm"
              title="Preview or edit the generated offer letter"
              onClick={() => setOfferCandidate({ ...c, _mode: 'preview' })}
            >
              <FaFileAlt /> Preview Offer
            </Button>
          ) : (
            <Button
              variant={canGenerateOffer ? 'primary' : 'secondary'}
              size="sm"
              disabled={!canGenerateOffer}
              title={
                !c.candidate_selected
                  ? 'Only available for Selected candidates'
                  : overallNum < 3
                    ? 'Avg score must be ≥ 3 to generate offer'
                    : 'Generate Offer Letter'
              }
              onClick={() => canGenerateOffer && setOfferCandidate(c)}
            >
              <FaFileAlt /> Generate Offer
            </Button>
          )}
        </td>

        {/* Joined button */}
        <td>
          <Button
            variant={canMarkPostOffer ? 'success' : 'secondary'}
            size="sm"
            disabled={!canMarkPostOffer}
            title={
              sectionKey === 'rejected' ? 'Not available for rejected candidates' :
              !inSelected               ? 'Already in Joined / Not Joined section' :
              !offerOut                 ? 'Generate offer letter first' :
                                          'Mark this candidate as Joined'
            }
            onClick={() => canMarkPostOffer && handleMarkJoined(c)}
          >
            <FaCheck /> Joined
          </Button>
        </td>

        {/* Not Joined button */}
        <td>
          <Button
            variant={canMarkPostOffer ? 'warning' : 'secondary'}
            size="sm"
            disabled={!canMarkPostOffer}
            title={
              sectionKey === 'rejected' ? 'Not available for rejected candidates' :
              !inSelected               ? 'Already in Joined / Not Joined section' :
              !offerOut                 ? 'Generate offer letter first' :
                                          'Mark this candidate as Not Joined'
            }
            onClick={() => canMarkPostOffer && handleMarkNotJoined(c)}
          >
            <FaUserTimes /> Not Joined
          </Button>
        </td>

        {/* Undo */}
        <td>
          {sectionKey === 'selected' ? (
            <span className="text-muted">—</span>
          ) : sectionKey === 'rejected' ? (
            <Button
              variant="outline-secondary" size="sm"
              title="Move back to Pending (will reappear on Schedule page)"
              onClick={() => handleUndoRejected(c)}
            >
              <FaUndo /> Undo
            </Button>
          ) : (
            <Button
              variant="outline-secondary" size="sm"
              title="Move back to Selected section"
              onClick={() => handleUndoJoinedStatus(c)}
            >
              <FaUndo /> Undo
            </Button>
          )}
        </td>
      </tr>
    );
  };

  // ── Section table renderer ────────────────────────────────────────────────────
  const renderSection = (title, icon, list, sectionKey, emptyMessage) => (
    <div className="candidate-section" style={{ marginTop: '1rem' }}>
      {list.length === 0 ? (
        <p className="text-muted">{emptyMessage}</p>
      ) : (
        <Table bordered hover responsive className="feedback-table">
          <thead className="table-light">
            <tr>
              <th>Candidate ID</th>
              <th>Name</th>
              {allRounds.map(r => <th key={r}>L{r} Avg</th>)}
              <th>Overall Avg</th>
              <th>Resume</th>
              <th>Aggregate</th>
              <th>Offer Generated</th>
              <th>Offer</th>
              <th>Joined</th>
              <th>Not Joined</th>
              <th>Undo</th>
            </tr>
          </thead>
          <tbody>
            {list.map(c => renderRow(c, sectionKey))}
          </tbody>
        </Table>
      )}
    </div>
  );

  return (
    <div className="page-wrapper feedback-page">

      {/* ── Toast notifications (top-right) ──────────────────────────────── */}
      <Toast toasts={toasts} />

      {/* ── Confirmation dialog ───────────────────────────────────────────── */}
      <ConfirmDialog
        config={confirmConfig}
        onConfirm={handleConfirmYes}
        onCancel={handleConfirmNo}
      />

      <h2 className="mb-4">Interview Feedback Summary</h2>

      <div className="mb-4">
        <label className="form-label">Select Role</label>
        <select
          className="form-select"
          value={selectedRole}
          onChange={(e) => {
            setSelectedRole(e.target.value);
            setActiveTab('selected');
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
            <p className="text-muted">
              No candidates with a final verdict yet for this role.
              Press "Select" or "Reject" on the Schedule page first.
            </p>
          ) : (
            <Tabs
              activeKey={activeTab}
              onSelect={(k) => setActiveTab(k || 'selected')}
              className="feedback-tabs mb-3"
              mountOnEnter
              unmountOnExit
            >
              <Tab
                eventKey="selected"
                title={<span>🏆 Selected <span className="badge bg-secondary ms-1">{selectedList.length}</span></span>}
              >
                {renderSection('Selected', '🏆', selectedList, 'selected', 'No candidates currently in Selected.')}
              </Tab>

              <Tab
                eventKey="joined"
                title={<span>✅ Joined <span className="badge bg-secondary ms-1">{joinedList.length}</span></span>}
              >
                {renderSection('Joined', '✅', joinedList, 'joined', 'No candidates have joined yet.')}
              </Tab>

              <Tab
                eventKey="not_joined"
                title={<span>🚪 Not Joined <span className="badge bg-secondary ms-1">{notJoinedList.length}</span></span>}
              >
                {renderSection('Not Joined', '🚪', notJoinedList, 'not_joined', 'No candidates marked as not joined.')}
              </Tab>

              <Tab
                eventKey="rejected"
                title={<span>❌ Rejected <span className="badge bg-secondary ms-1">{rejectedList.length}</span></span>}
              >
                {renderSection('Rejected', '❌', rejectedList, 'rejected', 'No rejected candidates.')}
              </Tab>
            </Tabs>
          )}
        </>
      )}

      {/* ── Aggregate Modal ───────────────────────────────────────────────── */}
      {showModal && (
        <div className="custom-modal-overlay" onClick={closeModal}>
          <div className="custom-modal-container" onClick={e => e.stopPropagation()}>
            <div className={`custom-modal-header ${
              aggregate?.verdict === 'No Hire'     ? 'header-nohire'     :
              aggregate?.verdict === 'Weak Hire'   ? 'header-weakhire'   :
              aggregate?.verdict === 'Hire'        ? 'header-hire'       :
              aggregate?.verdict === 'Strong Hire' ? 'header-stronghire' :
                                                     'header-stronghire'
            }`}>
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
                            <th>Round</th><th>Communication</th><th>Domain Knowledge</th>
                            <th>Problem Solving</th><th>Avg</th><th>Comments</th>
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
                            responsive: true, maintainAspectRatio: false,
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
                            className={`progress-bar-fill ${aggregate.average_scores.overall_average >= 3 ? 'progress-success' : 'progress-danger'}`}
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
                          ? aggregate.strengths.map((s, i) => <span className="strength-tag" key={i}>{s}</span>)
                          : <span className="no-data">No specific strengths noted</span>}
                      </div>
                    </div>
                    <div className="weaknesses-container">
                      <h3>⚠️ Areas for Improvement</h3>
                      <div className="tags-wrapper">
                        {(aggregate.weaknesses || []).length > 0
                          ? aggregate.weaknesses.map((w, i) => <span className="weakness-tag" key={i}>{w}</span>)
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

      {/* ── Offer Letter Modal ────────────────────────────────────────────── */}
      {offerCandidate && (
        <OfferLetterModal
          candidate={offerCandidate}
          roleName={selectedRoleName}
          mode={offerCandidate._mode || 'generate'}
          savedDetails={offerCandidate.offer_details || null}
          onClose={() => setOfferCandidate(null)}
          onOfferGenerated={markOfferGenerated}
        />
      )}
    </div>
  );
}
