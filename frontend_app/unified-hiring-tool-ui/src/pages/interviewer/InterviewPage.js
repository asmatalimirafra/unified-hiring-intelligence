// src/pages/interviewer/InterviewPage.js
import React, { useState, useEffect } from "react";
import axios from "axios";
import "./InterviewPage.css";

// const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";
const BASE_URL = "https://unwithering-unattentively-herbert.ngrok-free.dev";
const axiosConfig = { headers: { "ngrok-skip-browser-warning": "true" } };

// ── Hire recommendation based on overall average ──────────────────────────
function getHireLabel(avg) {
  if (avg >= 4)    return { label: "Strong Hire", cls: "hire-strong" };
  if (avg >= 3)    return { label: "Hire",        cls: "hire-yes"    };
  if (avg >= 2.5)  return { label: "Weak Hire",   cls: "hire-weak"   };
  return                  { label: "No Hire",     cls: "hire-no"     };
}

// ── Overall average across all rounds ────────────────────────────────────
function getOverallAvg(interviews = []) {
  if (interviews.length === 0) return null;
  let total = 0, count = 0;
  interviews.forEach(i => {
    const r = i.ratings || {};
    total += (r.communication || 0) + (r.domain_knowledge || 0) + (r.problem_solving || 0);
    count += 3;
  });
  return count > 0 ? total / count : null;
}

// ── Average for a single round ────────────────────────────────────────────
function getRoundAvg(interviews = [], round) {
  const r = interviews.filter(i => i.round === round);
  if (r.length === 0) return null;
  const total = r.reduce((s, i) => {
    const rt = i.ratings || {};
    return s + (rt.communication || 0) + (rt.domain_knowledge || 0) + (rt.problem_solving || 0);
  }, 0);
  return (total / (r.length * 3)).toFixed(1);
}

// ── Format date ───────────────────────────────────────────────────────────
function formatDate(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric"
  });
}

function InterviewPage() {
  const storedUser = localStorage.getItem("user");
  const parsedUser = storedUser ? JSON.parse(storedUser) : null;
  const interviewerId = parsedUser?.user_id || "";

  const [roles, setRoles]                 = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [pendingCandidates, setPendingCandidates]     = useState([]);
  const [completedCandidates, setCompletedCandidates] = useState([]);
  const [loading, setLoading]             = useState(false);
  const [errorMsg, setErrorMsg]           = useState("");
  const [successMsg, setSuccessMsg]       = useState("");

  // Feedback modal
  const [modal, setModal] = useState({
    open: false,
    mode: "add",        // "add" | "edit" | "view"
    candidate: null,
    roundNum: null,
  });

  const [form, setForm] = useState({
    round: "",
    date: new Date().toISOString().split("T")[0],
    communication: "",
    domain_knowledge: "",
    problem_solving: "",
    comments: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState("");

  // ── Auth check ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!interviewerId) setErrorMsg("Interviewer not logged in properly.");
  }, [interviewerId]);

  // ── Fetch roles ─────────────────────────────────────────────────────────
  useEffect(() => {
    axios.get(`${BASE_URL}/get-roles/`, axiosConfig)
      .then(res => {
        const list = Array.isArray(res.data) ? res.data : res.data.roles || [];
        setRoles(list.filter(r => r.status === "open"));
      })
      .catch(() => setErrorMsg("Failed to load roles."));
  }, []);

  // ── Fetch & split candidates ────────────────────────────────────────────
  const fetchCandidates = async (roleId) => {
    setLoading(true);
    setErrorMsg("");
    try {
      const res = await axios.get(`${BASE_URL}/get-candidates/`, axiosConfig);
      const all = Array.isArray(res.data) ? res.data : res.data.candidates || [];
      const role = all.filter(c => String(c.applied_role_id) === String(roleId));

      const pending   = role.filter(c => !(c.interview_completed === true));
      const completed = role.filter(c =>   c.interview_completed === true);

      setPendingCandidates(pending);
      setCompletedCandidates(completed);
    } catch {
      setErrorMsg("Failed to load candidates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedRoleId) fetchCandidates(selectedRoleId);
  }, [selectedRoleId]); // eslint-disable-line

  // ── Mark interview complete ──────────────────────────────────────────────
  const markCompleted = async (candidate) => {
    try {
      await axios.put(
        `${BASE_URL}/update-candidate/${candidate.candidate_id}`,
        { interview_completed: true },
        axiosConfig
      );
      showSuccess(`${candidate.name} moved to Completed.`);
      fetchCandidates(selectedRoleId);
    } catch {
      setErrorMsg("Failed to update candidate status.");
    }
  };

  // ── Move back to pending ─────────────────────────────────────────────────
  const moveToPending = async (candidate) => {
    try {
      await axios.put(
        `${BASE_URL}/update-candidate/${candidate.candidate_id}`,
        { interview_completed: false },
        axiosConfig
      );
      showSuccess(`${candidate.name} moved back to Pending.`);
      fetchCandidates(selectedRoleId);
    } catch {
      setErrorMsg("Failed to update candidate status.");
    }
  };

  // ── Open modal helpers ───────────────────────────────────────────────────
  const openAddModal = (candidate) => {
    const interviews = candidate.interviews || [];
    const usedRounds = interviews.map(i => i.round);
    // Next round = smallest number 1..10 not yet used
    let nextRound = 1;
    while (usedRounds.includes(nextRound) && nextRound <= 10) nextRound++;
    if (nextRound > 10) { setErrorMsg("Max 10 rounds reached."); return; }

    setForm({
      round: nextRound,
      date: new Date().toISOString().split("T")[0],
      communication: "",
      domain_knowledge: "",
      problem_solving: "",
      comments: "",
    });
    setFormError("");
    setModal({ open: true, mode: "add", candidate, roundNum: nextRound });
  };

  const openEditModal = (candidate, roundNum) => {
    const interview = (candidate.interviews || []).find(i => i.round === roundNum);
    if (!interview) return;
    const dt = interview.datetime
      ? new Date(interview.datetime).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];
    setForm({
      round: roundNum,
      date: dt,
      communication: interview.ratings?.communication || "",
      domain_knowledge: interview.ratings?.domain_knowledge || "",
      problem_solving: interview.ratings?.problem_solving || "",
      comments: interview.comments || "",
    });
    setFormError("");
    setModal({ open: true, mode: "edit", candidate, roundNum });
  };

  const openViewModal = (candidate, roundNum) => {
    const interview = (candidate.interviews || []).find(i => i.round === roundNum);
    if (!interview) return;
    const dt = interview.datetime
      ? new Date(interview.datetime).toISOString().split("T")[0]
      : "";
    setForm({
      round: roundNum,
      date: dt,
      communication: interview.ratings?.communication || "",
      domain_knowledge: interview.ratings?.domain_knowledge || "",
      problem_solving: interview.ratings?.problem_solving || "",
      comments: interview.comments || "",
    });
    setFormError("");
    setModal({ open: true, mode: "view", candidate, roundNum });
  };

  const closeModal = () => setModal({ open: false, mode: "add", candidate: null, roundNum: null });

  // ── Submit feedback ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const { communication, domain_knowledge, problem_solving, comments, date } = form;
    if (!communication || !domain_knowledge || !problem_solving) {
      setFormError("Please fill in all three rating fields.");
      return;
    }
    if (!comments.trim()) {
      setFormError("Please add a comment before submitting.");
      return;
    }

    setSubmitting(true);
    setFormError("");

    const payload = new FormData();
    payload.append("candidate_id", modal.candidate.candidate_id);
    payload.append("round_num", form.round);
    payload.append("interviewer_id", interviewerId);
    payload.append("communication", communication);
    payload.append("domain_knowledge", domain_knowledge);
    payload.append("problem_solving", problem_solving);
    payload.append("comments", comments);
    // Store date as part of comments if backend doesn't support it directly
    if (date) payload.append("interview_date", date);

    try {
      await axios.post(`${BASE_URL}/add-interview/`, payload, axiosConfig);
      showSuccess("Feedback submitted successfully!");
      closeModal();
      fetchCandidates(selectedRoleId);
    } catch (err) {
      setFormError(err.response?.data?.detail || "Failed to submit feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Toast helper ─────────────────────────────────────────────────────────
  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3500);
  };

  // ── Round badges for a candidate ─────────────────────────────────────────
  const RoundBadges = ({ candidate, editable = false }) => {
    const interviews = candidate.interviews || [];
    const usedRounds = interviews.map(i => i.round).sort((a, b) => a - b);
    if (usedRounds.length === 0) return <span className="no-rounds">—</span>;
    return (
      <div className="round-badges">
        {usedRounds.map(r => {
          const avg = getRoundAvg(interviews, r);
          return (
            <div key={r} className="round-badge-group">
              <span className="round-badge">L{r}: {avg}/5</span>
              {editable && (
                <>
                  <button
                    className="icon-btn edit-btn"
                    title={`Edit L${r}`}
                    onClick={() => openEditModal(candidate, r)}
                  >✏️</button>
                  <button
                    className="icon-btn view-btn"
                    title={`View L${r}`}
                    onClick={() => openViewModal(candidate, r)}
                  >👁️</button>
                </>
              )}
              {!editable && (
                <button
                  className="icon-btn view-btn"
                  title={`View L${r}`}
                  onClick={() => openViewModal(candidate, r)}
                >👁️</button>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ── Pending status badge ──────────────────────────────────────────────────
  const pendingStatus = (c) => {
    const rounds = (c.interviews || []).map(i => i.round);
    if (rounds.length === 0) return <span className="status-badge status-l1">Pending L1</span>;
    const next = Math.max(...rounds) + 1;
    return <span className="status-badge status-ln">Pending L{next}</span>;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="interview-page">
      <h2 className="page-title">Interview Management</h2>

      {errorMsg && <div className="banner banner-error">{errorMsg}</div>}
      {successMsg && <div className="banner banner-success">{successMsg}</div>}

      <label className="field-label">Select Role</label>
      <select
        className="dropdown"
        value={selectedRoleId}
        onChange={e => { setSelectedRoleId(e.target.value); }}
      >
        <option value="">-- Choose a Role --</option>
        {roles.map(r => (
          <option key={r.role_id} value={r.role_id}>{r.role}</option>
        ))}
      </select>

      {loading && (
        <div className="loading-state">
          <div className="spinner" /> Loading candidates…
        </div>
      )}

      {selectedRoleId && !loading && (
        <>
          {/* ── PENDING SECTION ─────────────────────────────────────── */}
          <section className="section-card">
            <div className="section-header pending-header">
              <span className="section-icon">🕐</span>
              <h3>Interviews Pending</h3>
              <span className="count-badge">{pendingCandidates.length}</span>
            </div>

            <table className="candidate-table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Status</th>
                  <th>Resume</th>
                  <th>Rounds</th>
                  <th>Give Feedback</th>
                  <th>Mark Complete</th>
                </tr>
              </thead>
              <tbody>
                {pendingCandidates.length === 0 ? (
                  <tr><td colSpan="6" className="empty-row">No pending candidates.</td></tr>
                ) : (
                  pendingCandidates.map(c => {
                    const usedRounds = (c.interviews || []).map(i => i.round);
                    const canAddMore = usedRounds.length < 10;
                    return (
                      <tr key={c.candidate_id}>
                        <td>
                          <div className="cand-name">{c.name}</div>
                          <div className="cand-id">{c.candidate_id}</div>
                        </td>
                        <td>{pendingStatus(c)}</td>
                        <td>
                          <a
                            href={`${BASE_URL}/get-resume/${c.candidate_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="link-btn"
                          >
                            View PDF
                          </a>
                        </td>
                        <td>
                          <RoundBadges candidate={c} editable={true} />
                        </td>
                        <td>
                          <button
                            className="btn-feedback"
                            disabled={!canAddMore}
                            onClick={() => openAddModal(c)}
                          >
                            Add Interview and Give Feedback
                          </button>
                        </td>
                        <td>
                          <button
                            className="btn-complete"
                            disabled={(c.interviews || []).length < 2}
                            title={(c.interviews || []).length < 2 ? "At least one interview round required" : ""}
                            onClick={() => markCompleted(c)}
                          >
                            ✓ Complete
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </section>

          {/* ── COMPLETED SECTION ───────────────────────────────────── */}
          <section className="section-card" style={{ marginTop: "2rem" }}>
            <div className="section-header completed-header">
              <span className="section-icon">✅</span>
              <h3>Interviews Completed</h3>
              <span className="count-badge">{completedCandidates.length}</span>
            </div>

            <table className="candidate-table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Resume</th>
                  <th>Rounds</th>
                  <th>Overall Avg</th>
                  <th>Recommendation</th>
                  <th>Move to Pending</th>
                </tr>
              </thead>
              <tbody>
                {completedCandidates.length === 0 ? (
                  <tr><td colSpan="6" className="empty-row">No completed interviews yet.</td></tr>
                ) : (
                  completedCandidates.map(c => {
                    const avg = getOverallAvg(c.interviews || []);
                    const hire = avg !== null ? getHireLabel(avg) : null;
                    return (
                      <tr key={c.candidate_id}>
                        <td>
                          <div className="cand-name">{c.name}</div>
                          <div className="cand-id">{c.candidate_id}</div>
                        </td>
                        <td>
                          <a
                            href={`${BASE_URL}/get-resume/${c.candidate_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="link-btn"
                          >
                            View PDF
                          </a>
                        </td>
                        <td>
                          <RoundBadges candidate={c} editable={false} />
                        </td>
                        <td>
                          {avg !== null ? (
                            <span className="avg-score">{avg.toFixed(2)} / 5</span>
                          ) : "—"}
                        </td>
                        <td>
                          {hire ? (
                            <span className={`hire-badge ${hire.cls}`}>{hire.label}</span>
                          ) : "—"}
                        </td>
                        <td>
                          <button
                            className="btn-reopen"
                            onClick={() => moveToPending(c)}
                          >
                            ↩ Reopen
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </section>
        </>
      )}

      {/* ── MODAL ─────────────────────────────────────────────────────── */}
      {modal.open && modal.candidate && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="modal-header">
              <div>
                <h3>
                  {modal.mode === "view" ? "View Feedback" :
                   modal.mode === "edit" ? "Edit Feedback" :
                   "Give Feedback"}
                </h3>
                <p className="modal-subtitle">
                  {modal.candidate.name} &nbsp;·&nbsp;
                  <span className="round-label">Round L{form.round}</span>
                </p>
              </div>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>

            {formError && <div className="banner banner-error">{formError}</div>}

            {/* Date */}
            <div className="field-group">
              <label className="field-label">Interview Date</label>
              <input
                type="date"
                value={form.date}
                disabled={modal.mode === "view"}
                onChange={e => setForm({ ...form, date: e.target.value })}
              />
            </div>

            {/* Ratings */}
            <div className="ratings-grid">
              <div className="field-group">
                <label className="field-label">Communication <span className="scale-hint">(1–5)</span></label>
                <select
                  value={form.communication}
                  disabled={modal.mode === "view"}
                  onChange={e => setForm({ ...form, communication: e.target.value })}
                >
                  <option value="">Select rating</option>
                  {[
                    [1, "1 — Poor"],
                    [2, "2 — Below Average"],
                    [3, "3 — Average"],
                    [4, "4 — Good"],
                    [5, "5 — Excellent"],
                  ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>

              <div className="field-group">
                <label className="field-label">Domain Knowledge <span className="scale-hint">(1–5)</span></label>
                <select
                  value={form.domain_knowledge}
                  disabled={modal.mode === "view"}
                  onChange={e => setForm({ ...form, domain_knowledge: e.target.value })}
                >
                  <option value="">Select rating</option>
                  {[
                    [1, "1 — Poor"],
                    [2, "2 — Below Average"],
                    [3, "3 — Average"],
                    [4, "4 — Good"],
                    [5, "5 — Excellent"],
                  ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>

              <div className="field-group">
                <label className="field-label">Problem Solving <span className="scale-hint">(1–5)</span></label>
                <select
                  value={form.problem_solving}
                  disabled={modal.mode === "view"}
                  onChange={e => setForm({ ...form, problem_solving: e.target.value })}
                >
                  <option value="">Select rating</option>
                  {[
                    [1, "1 — Poor"],
                    [2, "2 — Below Average"],
                    [3, "3 — Average"],
                    [4, "4 — Good"],
                    [5, "5 — Excellent"],
                  ].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>

            {/* Comments */}
            <div className="field-group">
              <label className="field-label">Comments</label>
              <textarea
                placeholder="Write your observations about the candidate…"
                value={form.comments}
                disabled={modal.mode === "view"}
                rows={4}
                onChange={e => setForm({ ...form, comments: e.target.value })}
              />
            </div>

            {/* Actions */}
            <div className="modal-actions">
              {modal.mode !== "view" && (
                <button
                  className="btn-submit"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? "Submitting…" : "Submit Feedback"}
                </button>
              )}
              <button className="btn-cancel" onClick={closeModal}>
                {modal.mode === "view" ? "Close" : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default InterviewPage;