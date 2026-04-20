// src/pages/interviewer/InterviewPage.js
import React, { useState, useEffect } from "react";
import axios from "axios";
import "./InterviewPage.css";

const BASE_URL = "https://unwithering-unattentively-herbert.ngrok-free.dev";
const axiosConfig = { headers: { "ngrok-skip-browser-warning": "true" } };

function getHireLabel(avg) {
  if (avg >= 4)   return { label: "Strong Hire", cls: "hire-strong" };
  if (avg >= 3)   return { label: "Hire",        cls: "hire-yes"    };
  if (avg >= 2.5) return { label: "Weak Hire",   cls: "hire-weak"   };
  return                 { label: "No Hire",     cls: "hire-no"     };
}

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

function getRoundAvg(interviews = [], round) {
  const r = interviews.filter(i => i.round === round);
  if (r.length === 0) return null;
  const total = r.reduce((s, i) => {
    const rt = i.ratings || {};
    return s + (rt.communication || 0) + (rt.domain_knowledge || 0) + (rt.problem_solving || 0);
  }, 0);
  return (total / (r.length * 3)).toFixed(1);
}

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
  // ── Use the interviewer's email to fetch assigned candidates ─────────────
  const interviewerEmail = parsedUser?.email || "";

  const [roles, setRoles] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [pendingCandidates, setPendingCandidates] = useState([]);
  const [completedCandidates, setCompletedCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [modal, setModal] = useState({
    open: false,
    mode: "add",
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
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!interviewerEmail) setErrorMsg("Interviewer email not found. Please log in again.");
  }, [interviewerEmail]);

  // ── Fetch all open roles (for the dropdown filter) ────────────────────────
  useEffect(() => {
    axios.get(`${BASE_URL}/get-roles/`, axiosConfig)
      .then(res => {
        const list = Array.isArray(res.data) ? res.data : res.data.roles || [];
        setRoles(list.filter(r => r.status === "open"));
      })
      .catch(() => setErrorMsg("Failed to load roles."));
  }, []);

  // ── Fetch candidates assigned to this interviewer, then filter by role ───
  const fetchCandidates = async (roleId) => {
    if (!interviewerEmail) return;
    setLoading(true);
    setErrorMsg("");
    try {
      // Only gets candidates scheduled for THIS interviewer's email
      const res = await axios.get(
        `${BASE_URL}/get-interviewer-candidates/${encodeURIComponent(interviewerEmail)}`,
        axiosConfig
      );
      const all = Array.isArray(res.data) ? res.data : [];
      const role = all.filter(c => String(c.applied_role_id) === String(roleId));

      setPendingCandidates(role.filter(c => !(c.interview_completed === true)));
      setCompletedCandidates(role.filter(c =>   c.interview_completed === true));
    } catch {
      setErrorMsg("Failed to load candidates.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedRoleId) fetchCandidates(selectedRoleId);
  }, [selectedRoleId]); // eslint-disable-line

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

  const openAddModal = (candidate) => {
    const interviews = candidate.interviews || [];
    const usedRounds = interviews.map(i => i.round);
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

  const handleSubmit = async () => {
    const { communication, domain_knowledge, problem_solving, comments, date } = form;
    const c = Number(communication), d = Number(domain_knowledge), p = Number(problem_solving);
    if (!c || !d || !p || !comments.trim()) {
      setFormError("Please fill all rating fields and add comments.");
      return;
    }
    if ([c, d, p].some(v => v < 1 || v > 5)) {
      setFormError("All ratings must be between 1 and 5.");
      return;
    }

    setSubmitting(true);
    setFormError("");

    try {
      const fd = new FormData();
      fd.append("candidate_id", modal.candidate.candidate_id);
      fd.append("round_num", form.round);
      fd.append("interviewer_id", interviewerId);
      fd.append("communication", c);
      fd.append("domain_knowledge", d);
      fd.append("problem_solving", p);
      fd.append("comments", comments.trim());

      if (modal.mode === "edit") {
        // Patch existing round
        await axios.put(
          `${BASE_URL}/update-candidate/${modal.candidate.candidate_id}`,
          {
            interviews: modal.candidate.interviews.map(iv =>
              iv.round === modal.roundNum
                ? { ...iv, ratings: { communication: c, domain_knowledge: d, problem_solving: p }, comments: comments.trim(), datetime: date }
                : iv
            )
          },
          axiosConfig
        );
      } else {
        await axios.post(`${BASE_URL}/add-interview/`, fd, axiosConfig);
      }

      showSuccess("Feedback submitted successfully!");
      closeModal();
      fetchCandidates(selectedRoleId);
    } catch (err) {
      setFormError(err.response?.data?.detail || "Failed to submit feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  // ── Round badges component ─────────────────────────────────────────────
  function RoundBadges({ candidate, editable }) {
    const interviews = candidate.interviews || [];
    if (!interviews.length) return <span className="no-rounds">No rounds yet</span>;
    return (
      <div className="round-badges">
        {interviews.map(iv => (
          <button
            key={iv.round}
            className={`round-badge ${editable ? 'clickable' : ''}`}
            onClick={() => editable ? openEditModal(candidate, iv.round) : openViewModal(candidate, iv.round)}
            title={`Round ${iv.round} avg: ${getRoundAvg(interviews, iv.round)}`}
          >
            L{iv.round} · {getRoundAvg(interviews, iv.round) ?? '—'}
          </button>
        ))}
        {editable && (
          <button
            className="round-badge add-round"
            onClick={() => openAddModal(candidate)}
            title="Add new round"
          >
            + Round
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="interview-page">
      <h2 className="page-title">Interview Feedback</h2>

      {errorMsg  && <div className="banner banner-error">{errorMsg}</div>}
      {successMsg && <div className="banner banner-success">{successMsg}</div>}

      {/* Role selector */}
      <div className="role-selector">
        <label className="field-label">Filter by Role</label>
        <select
          className="role-select"
          value={selectedRoleId}
          onChange={e => setSelectedRoleId(e.target.value)}
        >
          <option value="">— Select a role —</option>
          {roles.map(r => (
            <option key={r.role_id} value={r.role_id}>
              {r.role} ({r.role_id})
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="loading-bar">Loading candidates…</div>}

      {selectedRoleId && !loading && (
        <>
          {/* ── PENDING SECTION ─────────────────────────────────────────── */}
          <section className="section-card">
            <div className="section-header pending-header">
              <span className="section-icon">⏳</span>
              <h3>Pending Interviews</h3>
              <span className="count-badge">{pendingCandidates.length}</span>
            </div>

            <table className="candidate-table">
              <thead>
                <tr>
                  <th>Candidate</th>
                  <th>Scheduled By (HR)</th>
                  <th>Date & Time</th>
                  <th>Meeting Link</th>
                  <th>Resume</th>
                  <th>Rounds</th>
                  <th>Mark Complete</th>
                </tr>
              </thead>
              <tbody>
                {pendingCandidates.length === 0 ? (
                  <tr><td colSpan="7" className="empty-row">No pending candidates assigned to you.</td></tr>
                ) : (
                  pendingCandidates.map(c => (
                    <tr key={c.candidate_id}>
                      <td>
                        <div className="cand-name">{c.name}</div>
                        <div className="cand-id">{c.candidate_id}</div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: '#5c5cff' }}>
                          👤 {c.interview_details?.scheduled_by_hr_name || c.interview_details?.scheduled_by_hr_id || '—'}
                        </span>
                      </td>
                      <td>
                        {c.interview_details?.scheduled_datetime
                          ? new Date(c.interview_details.scheduled_datetime).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td>
                        {c.interview_details?.meeting_link ? (
                          <a href={c.interview_details.meeting_link} target="_blank" rel="noopener noreferrer"
                            style={{ color: '#00b894', fontWeight: 600, textDecoration: 'none' }}>
                            Join 🔗
                          </a>
                        ) : '—'}
                      </td>
                      <td>
                        <a
                          href={`${BASE_URL}/get-resume/${c.candidate_id}`}
                          target="_blank" rel="noopener noreferrer"
                          className="link-btn"
                        >
                          View PDF
                        </a>
                      </td>
                      <td><RoundBadges candidate={c} editable={true} /></td>
                      <td>
                        <button className="btn-complete" onClick={() => markCompleted(c)}>
                          ✓ Complete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          {/* ── COMPLETED SECTION ───────────────────────────────────────── */}
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
                            target="_blank" rel="noopener noreferrer"
                            className="link-btn"
                          >
                            View PDF
                          </a>
                        </td>
                        <td><RoundBadges candidate={c} editable={false} /></td>
                        <td>
                          {avg !== null ? <span className="avg-score">{avg.toFixed(2)} / 5</span> : "—"}
                        </td>
                        <td>
                          {hire ? <span className={`hire-badge ${hire.cls}`}>{hire.label}</span> : "—"}
                        </td>
                        <td>
                          <button className="btn-reopen" onClick={() => moveToPending(c)}>↩ Reopen</button>
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

      {/* ── MODAL ──────────────────────────────────────────────────────── */}
      {modal.open && modal.candidate && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
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

            <div className="field-group">
              <label className="field-label">Interview Date</label>
              <input
                type="date"
                value={form.date}
                disabled={modal.mode === "view"}
                onChange={e => setForm({ ...form, date: e.target.value })}
              />
            </div>

            <div className="ratings-grid">
              {[
                ["communication", "Communication"],
                ["domain_knowledge", "Domain Knowledge"],
                ["problem_solving", "Problem Solving"],
              ].map(([field, label]) => (
                <div className="field-group" key={field}>
                  <label className="field-label">{label} <span className="scale-hint">(1–5)</span></label>
                  <select
                    value={form[field]}
                    disabled={modal.mode === "view"}
                    onChange={e => setForm({ ...form, [field]: e.target.value })}
                  >
                    <option value="">Select rating</option>
                    {[[1,"1 — Poor"],[2,"2 — Below Average"],[3,"3 — Average"],[4,"4 — Good"],[5,"5 — Excellent"]].map(([v,l]) =>
                      <option key={v} value={v}>{l}</option>
                    )}
                  </select>
                </div>
              ))}
            </div>

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

            <div className="modal-actions">
              {modal.mode !== "view" && (
                <button className="btn-submit" onClick={handleSubmit} disabled={submitting}>
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