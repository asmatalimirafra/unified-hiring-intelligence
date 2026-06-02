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
  if (!interviews.length) return null;
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
  if (!r.length) return null;
  const total = r.reduce((s, i) => {
    const rt = i.ratings || {};
    return s + (rt.communication || 0) + (rt.domain_knowledge || 0) + (rt.problem_solving || 0);
  }, 0);
  return (total / (r.length * 3)).toFixed(1);
}

function formatDateTime(dt) {
  if (!dt) return "—";
  try {
    return new Date(dt).toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit"
    });
  } catch { return "—"; }
}

function StatusPill({ completed }) {
  return completed
    ? <span className="ip-status ip-status--done">✓ Completed</span>
    : <span className="ip-status ip-status--pending">● Pending</span>;
}

// ── Main component ────────────────────────────────────────────────────────────
function InterviewPage() {
  const storedUser       = JSON.parse(localStorage.getItem("user") || "{}");
  const interviewerId    = storedUser?.user_id || "";
  const interviewerEmail = storedUser?.email   || "";

  const [roles,               setRoles]               = useState([]);
  const [selectedRoleId,      setSelectedRoleId]      = useState("");
  const [pendingCandidates,   setPendingCandidates]   = useState([]);
  const [completedCandidates, setCompletedCandidates] = useState([]);
  const [loading,             setLoading]             = useState(false);
  const [errorMsg,            setErrorMsg]            = useState("");

  // ── Tabs, search, toast ───────────────────────────────────────────────────
  const [activeTab,   setActiveTab]   = useState("pending"); // 'pending' | 'completed'
  const [searchQuery, setSearchQuery] = useState("");
  const [toast,       setToast]       = useState(null);

  // ── HR name lookup map (hr_id → name) — covers all records, including
  //    completed interviews where interview_details has been unset. ─────────
  const [hrMap, setHrMap] = useState({});

  // ── Feedback modal (for + Round) ──────────────────────────────────────────
  const [modal,     setModal]     = useState({ open: false, mode: "add", candidate: null, roundNum: null });
  const [form,      setForm]      = useState({
    round: "", date: new Date().toISOString().split("T")[0],
    communication: "", domain_knowledge: "", problem_solving: "", comments: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError,  setFormError]  = useState("");

  // ── Notes modal ───────────────────────────────────────────────────────────
  const [notesModal,  setNotesModal]  = useState({ open: false, candidate: null });
  const [notesText,   setNotesText]   = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved,  setNotesSaved]  = useState(false);

  // ── Fetch all assigned candidates once, derive roles from them ───────────
  const [allAssignedCandidates, setAllAssignedCandidates] = useState([]);

  useEffect(() => {
    if (!interviewerEmail) { setErrorMsg("Interviewer email not found. Please log in again."); return; }
    setLoading(true);
    axios.get(`${BASE_URL}/get-interviewer-candidates/${encodeURIComponent(interviewerEmail)}`, axiosConfig)
      .then(res => {
        const all = Array.isArray(res.data) ? res.data : [];
        setAllAssignedCandidates(all);
        const roleMap = {};
        all.forEach(c => {
          if (c.applied_role_id && c.applied_role) {
            roleMap[String(c.applied_role_id)] = c.applied_role;
          }
        });
        setRoles(Object.entries(roleMap).map(([role_id, role]) => ({ role_id, role })));
      })
      .catch(() => setErrorMsg("Failed to load candidates."))
      .finally(() => setLoading(false));
  }, [interviewerEmail]); // eslint-disable-line

  // ── Fetch all users to build HR name map (non-critical, fail silently) ──
  useEffect(() => {
    axios.get(`${BASE_URL}/get-users/`, axiosConfig)
      .then(res => {
        const map = {};
        (res.data || []).forEach(u => {
          if (u.role === "HR") map[u.user_id] = u.name;
        });
        setHrMap(map);
      })
      .catch(() => {});
  }, []);

  // ── Filter from cached list when role changes, and after feedback submit ──
  const fetchCandidates = (roleId) => {
    const role = allAssignedCandidates.filter(c => String(c.applied_role_id) === String(roleId));

    // Pending = currently scheduled FOR this interviewer and round not yet done.
    // Check: status is "Scheduled" AND the scheduled round has no feedback entry yet.
    setPendingCandidates(role.filter(c => {
      if (c.status !== "Scheduled") return false;
      // Confirm it's scheduled for THIS interviewer
      if (c.interview_details?.interviewer_email !== interviewerEmail) return false;
      // Confirm the scheduled round hasn't been submitted yet
      const scheduledRound =
        c.interview_details?.scheduled_round ?? ((c.interviews || []).length + 1);
      const feedbackDone = (c.interviews || []).some(i => i.round === scheduledRound);
      return !feedbackDone;
    }));

    // Completed = this interviewer has at least one round in the interviews[] array.
    // Does NOT depend on status or feedback_given — works even after status is cleared.
    setCompletedCandidates(role.filter(c => {
      const myRounds = (c.interviews || []).filter(
        i => String(i.interviewer_id) === String(interviewerId)
      );
      return myRounds.length > 0;
    }));
  };

  useEffect(() => {
    if (selectedRoleId) fetchCandidates(selectedRoleId);
  }, [selectedRoleId, allAssignedCandidates]); // eslint-disable-line

  // ── Feedback modal helpers ────────────────────────────────────────────────
  const openAddModal = (candidate) => {
    const usedRounds = (candidate.interviews || []).map(i => i.round);
    let nextRound = 1;
    while (usedRounds.includes(nextRound) && nextRound <= 10) nextRound++;
    if (nextRound > 10) { showToast("Maximum 10 rounds reached.", "error"); return; }
    setForm({
      round: nextRound,
      date: new Date().toISOString().split("T")[0],
      communication: "", domain_knowledge: "", problem_solving: "", comments: ""
    });
    setFormError("");
    setModal({ open: true, mode: "add", candidate, roundNum: nextRound });
  };

  const openEditModal = (candidate, roundNum) => {
    const iv = (candidate.interviews || []).find(i => i.round === roundNum);
    if (!iv) return;
    setForm({
      round: roundNum,
      date: iv.datetime ? new Date(iv.datetime).toISOString().split("T")[0] : new Date().toISOString().split("T")[0],
      communication:    iv.ratings?.communication    || "",
      domain_knowledge: iv.ratings?.domain_knowledge || "",
      problem_solving:  iv.ratings?.problem_solving  || "",
      comments: iv.comments || "",
    });
    setFormError("");
    setModal({ open: true, mode: "edit", candidate, roundNum });
  };


  // Opens the modal in read-only mode — for rounds conducted by other interviewers
  const openViewModal = (candidate, roundNum) => {
    const iv = (candidate.interviews || []).find(i => i.round === roundNum);
    if (!iv) return;
    setForm({
      round: roundNum,
      date: iv.datetime ? new Date(iv.datetime).toISOString().split("T")[0] : "",
      communication:    iv.ratings?.communication    || "",
      domain_knowledge: iv.ratings?.domain_knowledge || "",
      problem_solving:  iv.ratings?.problem_solving  || "",
      comments: iv.comments || "",
    });
    setFormError("");
    setModal({ open: true, mode: "view", candidate, roundNum });
  };

  const closeModal = () => setModal({ open: false, mode: "add", candidate: null, roundNum: null });

  // ── Notes modal helpers ───────────────────────────────────────────────────
  const openNotesModal = (candidate) => {
    setNotesModal({ open: true, candidate });
    setNotesText(candidate.interviewer_notes || "");
    setNotesSaved(false);
  };

  const closeNotesModal = () => setNotesModal({ open: false, candidate: null });

  const saveNotes = async () => {
    if (!notesModal.candidate) return;
    setNotesSaving(true);
    try {
      await axios.put(
        `${BASE_URL}/update-candidate/${notesModal.candidate.candidate_id}`,
        { interviewer_notes: notesText },
        axiosConfig
      );
      setNotesSaved(true);
      // Reflect saved notes in local state so dot indicator updates instantly
      setPendingCandidates(prev =>
        prev.map(c =>
          c.candidate_id === notesModal.candidate.candidate_id
            ? { ...c, interviewer_notes: notesText }
            : c
        )
      );
      setTimeout(() => setNotesSaved(false), 2500);
    } catch {
      // non-critical — fail silently
    } finally {
      setNotesSaving(false);
    }
  };

  // ── Submit feedback (Give Feedback — always adds, then marks complete) ─────
  const handleSubmit = async () => {
    const c = Number(form.communication);
    const d = Number(form.domain_knowledge);
    const p = Number(form.problem_solving);
    if (!c || !d || !p || !form.comments.trim()) {
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
      if (modal.mode === "edit") {
        // Edit existing feedback (from Completed section)
        const updatedInterviews = (modal.candidate.interviews || []).map(iv =>
          iv.round === modal.roundNum
            ? { ...iv, ratings: { communication: c, domain_knowledge: d, problem_solving: p }, comments: form.comments.trim(), datetime: form.date }
            : iv
        );
        await axios.put(
          `${BASE_URL}/update-candidate/${modal.candidate.candidate_id}`,
          { interviews: updatedInterviews },
          axiosConfig
        );
        showSuccess("Feedback updated successfully!");
      } else {
        // Give Feedback — submit and immediately mark as completed
        const fd = new FormData();
        fd.append("candidate_id",     modal.candidate.candidate_id);
        fd.append("round_num",        form.round);
        fd.append("interviewer_id",   interviewerId);
        fd.append("communication",    c);
        fd.append("domain_knowledge", d);
        fd.append("problem_solving",  p);
        fd.append("comments",         form.comments.trim());
        await axios.post(`${BASE_URL}/add-interview/`, fd, axiosConfig);
        // No need to set feedback_given — completed section is now derived from
        // the interviews[] array directly (checks interviewer_id per round).
        showSuccess(`✅ Feedback for Round L${form.round} submitted! Candidate moved to Completed.`);
      }
      closeModal();
      // Re-fetch from backend to refresh allAssignedCandidates
      const res = await axios.get(
        `${BASE_URL}/get-interviewer-candidates/${encodeURIComponent(interviewerEmail)}`,
        axiosConfig
      );
      const all = Array.isArray(res.data) ? res.data : [];
      setAllAssignedCandidates(all);
    } catch (err) {
      setFormError(err.response?.data?.detail || "Failed to submit feedback.");
    } finally {
      setSubmitting(false);
    }
  };



  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };
  const showSuccess = (msg) => showToast(msg, "success");

  // ── Search filter (name or candidate ID) applied to the active tab ────────
  const filterBySearch = (list) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;
    return list.filter(c =>
      (c.name || "").toLowerCase().includes(q) ||
      String(c.candidate_id || "").toLowerCase().includes(q)
    );
  };
  const pendingFiltered   = filterBySearch(pendingCandidates);
  const completedFiltered = filterBySearch(completedCandidates);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="interview-page">
      <h2 className="page-title">My Interviews</h2>

      {errorMsg && <div className="banner banner-error">{errorMsg}</div>}

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
            <option key={r.role_id} value={r.role_id}>{r.role} ({r.role_id})</option>
          ))}
        </select>
      </div>

      {loading && <div className="loading-bar">Loading candidates…</div>}

      {selectedRoleId && !loading && (
        <>
          {/* ── Tabs ──────────────────────────────────────────────────── */}
          <div className="ip-tabs">
            <button
              className={`ip-tab ${activeTab === "pending" ? "active" : ""}`}
              onClick={() => setActiveTab("pending")}
            >
              Pending Interview
              <span className="ip-tab-count">{pendingCandidates.length}</span>
            </button>
            <button
              className={`ip-tab ${activeTab === "completed" ? "active" : ""}`}
              onClick={() => setActiveTab("completed")}
            >
              Completed Interview
              <span className="ip-tab-count">{completedCandidates.length}</span>
            </button>
          </div>

          {/* ── Search ────────────────────────────────────────────────── */}
          <div className="ip-search-wrap">
            <span className="ip-search-icon">🔍</span>
            <input
              type="text"
              className="ip-search-input"
              placeholder="Search by name or candidate ID…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="ip-search-clear" onClick={() => setSearchQuery("")} title="Clear">✕</button>
            )}
          </div>

          {/* ── PENDING ────────────────────────────────────────────────── */}
          {activeTab === "pending" && (
          <section className="section-card">
            <div className="section-header pending-header">
              <span className="section-icon">⏳</span>
              <h3>Pending Interviews</h3>
              <span className="count-badge">{pendingCandidates.length}</span>
            </div>

            <div className="table-scroll">
              <table className="candidate-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Interview Status</th>
                    <th>Round</th>
                    <th>Assigned By (HR)</th>
                    <th>Date & Time</th>
                    <th>Meeting Link</th>
                    <th>Resume</th>
                    <th>Notes</th>
                    <th>Give Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingFiltered.length === 0 ? (
                    <tr>
                      <td colSpan="9" className="empty-row">
                        {searchQuery
                          ? `No pending candidates match “${searchQuery}”.`
                          : "No pending candidates assigned to you."}
                      </td>
                    </tr>
                  ) : (
                    pendingFiltered.map(c => {
                      const hasNotes = !!c.interviewer_notes?.trim();
                      return (
                        <tr key={c.candidate_id}>

                          {/* Candidate name + id */}
                          <td>
                            <div className="cand-name">{c.name}</div>
                            <div className="cand-id">{c.candidate_id}</div>
                          </td>

                          {/* Interview status */}
                          <td><StatusPill completed={false} /></td>

                          {/* ✅ Current round being interviewed */}
                          <td>
                            {(() => {
                              const completedRounds = (c.interviews || []).length;
                              const nextRound = completedRounds + 1;
                              return (
                                <span className="round-label">
                                  L{nextRound}
                                  {completedRounds > 0 &&
                                    <span className="rounds-done-hint"> ({completedRounds} done)</span>
                                  }
                                </span>
                              );
                            })()}
                          </td>

                          {/* HR who scheduled */}
                          <td>
                            {(() => {
                              // After feedback, interview_details is cleared.
                              // Fallback order: backend-preserved field in interviews[],
                              // then hrMap lookup by root-level hr_id (works for all records).
                              const lastRound = [...(c.interviews || [])].sort((a, b) => b.round - a.round)[0];
                              const hrName = c.interview_details?.scheduled_by_hr_name
                                || c.last_interview_info?.scheduled_by_hr_name
                                || lastRound?.scheduled_by_hr_name
                                || hrMap[c.hr_id]
                                || c.hr_id
                                || "—";
                              return <span className="hr-tag">👤 {hrName}</span>;
                            })()}
                          </td>

                          {/* Scheduled date & time */}
                          <td className="datetime-cell">
                            {(() => {
                              const lastRound = [...(c.interviews || [])].sort((a, b) => b.round - a.round)[0];
                              const rawDt = c.interview_details?.scheduled_datetime
                                || c.interview_details?.scheduled_date
                                || c.last_interview_info?.scheduled_datetime
                                || lastRound?.scheduled_datetime
                                || lastRound?.datetime;
                              return formatDateTime(rawDt);
                            })()}
                          </td>

                          {/* Meeting link */}
                          <td>
                            {c.interview_details?.meeting_link ? (
                              <a
                                href={c.interview_details.meeting_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="meeting-link-btn"
                              >
                                🔗 Join
                              </a>
                            ) : "—"}
                          </td>

                          {/* Resume */}
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

                          {/* 📓 Notes button */}
                          <td>
                            <button
                              className="btn-notes"
                              onClick={() => openNotesModal(c)}
                              title={hasNotes ? "View / edit notes" : "Add notes"}
                            >
                              📓
                              {hasNotes
                                ? <span className="notes-dot" title="Notes saved" />
                                : null}
                            </button>
                          </td>

                          {/* Give Feedback — opens modal, submitting moves to Completed */}
                          <td>
                            <button
                              className="btn-feedback"
                              onClick={() => openAddModal(c)}
                              title="Give feedback for this candidate"
                            >
                              ✍️ Give Feedback
                            </button>
                          </td>

                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
          )}

          {/* ── COMPLETED ──────────────────────────────────────────────── */}
          {activeTab === "completed" && (
          <section className="section-card">
            <div className="section-header completed-header">
              <span className="section-icon">✅</span>
              <h3>Interviews Completed</h3>
              <span className="count-badge">{completedCandidates.length}</span>
            </div>

            <div className="table-scroll">
              <table className="candidate-table">
                <thead>
                  <tr>
                    <th>Candidate</th>
                    <th>Interview Status</th>
                    <th>Assigned By (HR)</th>
                    <th>Resume</th>
                    <th>Rounds Done</th>
                    <th>Overall Score</th>
                    <th>Recommendation</th>
                    <th>Round Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  {completedFiltered.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="empty-row">
                        {searchQuery
                          ? `No completed interviews match “${searchQuery}”.`
                          : "No completed interviews yet."}
                      </td>
                    </tr>
                  ) : (
                    completedFiltered.map(c => {
                      const avg       = getOverallAvg(c.interviews || []);
                      const hire      = avg !== null ? getHireLabel(avg) : null;
                      const interviews = [...(c.interviews || [])].sort((a, b) => a.round - b.round);
                      return (
                        <tr key={c.candidate_id}>
                          <td>
                            <div className="cand-name">{c.name}</div>
                            <div className="cand-id">{c.candidate_id}</div>
                          </td>
                          <td><StatusPill completed={true} /></td>
                          <td>
                            {(() => {
                              const lastRound = [...(c.interviews || [])].sort((a, b) => b.round - a.round)[0];
                              const hrName = c.interview_details?.scheduled_by_hr_name
                                || c.last_interview_info?.scheduled_by_hr_name
                                || lastRound?.scheduled_by_hr_name
                                || hrMap[c.hr_id]
                                || c.hr_id
                                || "—";
                              return <span className="hr-tag">👤 {hrName}</span>;
                            })()}
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
                          {/* ✅ Show count of completed rounds */}
                          <td>
                            {interviews.length > 0
                              ? interviews.map(i => (
                                  <span key={i.round} className="round-pill" style={{ marginRight: 4 }}>
                                    L{i.round}: {getRoundAvg(c.interviews, i.round)}
                                  </span>
                                ))
                              : "—"}
                          </td>
                          <td>
                            {avg !== null
                              ? <span className="avg-score">{avg.toFixed(2)} / 5</span>
                              : "—"}
                          </td>
                          <td>
                            {hire
                              ? <span className={`hire-badge ${hire.cls}`}>{hire.label}</span>
                              : "—"}
                          </td>
                          {/* Per-round: only the most recent OWN round is editable */}
                          <td>
                            {(() => {
                              // Find the highest round number conducted by this interviewer
                              const myRounds = interviews
                                .filter(i => String(i.interviewer_id) === String(interviewerId))
                                .map(i => i.round);
                              const myLatestRound = myRounds.length > 0 ? Math.max(...myRounds) : null;

                              return (
                                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                                  {interviews.map(i => {
                                    const isMine = String(i.interviewer_id) === String(interviewerId);
                                    // Editable only if it's mine AND it's my most recent round
                                    const isEditable = isMine && i.round === myLatestRound;

                                    if (isEditable) {
                                      return (
                                        <button
                                          key={i.round}
                                          className="btn-edit-feedback"
                                          onClick={() => openEditModal(c, i.round)}
                                          title={`Edit your L${i.round} feedback`}
                                        >
                                          ✏️ L{i.round}
                                        </button>
                                      );
                                    } else {
                                      return (
                                        <button
                                          key={i.round}
                                          className="btn-view-feedback"
                                          onClick={() => openViewModal(c, i.round)}
                                          title={
                                            isMine
                                              ? `L${i.round} is an earlier round you conducted — view only`
                                              : `L${i.round} was conducted by another interviewer — view only`
                                          }
                                        >
                                          👁 L{i.round}
                                        </button>
                                      );
                                    }
                                  })}
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
          )}
        </>
      )}

      {/* ── FEEDBACK MODAL (opened by + Round or clicking a round badge) ─── */}
      {modal.open && modal.candidate && (
        <div className="modal-backdrop" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>

            <div className="modal-header">
              <div>
                <h3>
                  {modal.mode === "edit" ? "Edit Feedback"
                   : modal.mode === "view" ? "View Feedback"
                   : "Give Feedback"}
                </h3>
                <p className="modal-subtitle">
                  {modal.candidate.name}
                  &nbsp;·&nbsp;
                  <span className="round-label">Round L{form.round}</span>
                </p>
              </div>
              <button className="modal-close" onClick={closeModal}>✕</button>
            </div>

            {formError && (
              <div className="banner banner-error" style={{ margin: "0 1.5rem" }}>
                {formError}
              </div>
            )}
            {modal.mode === "view" && (() => {
              const iv = (modal.candidate?.interviews || []).find(i => i.round === modal.roundNum);
              const conductedByMe = iv && String(iv.interviewer_id) === String(interviewerId);
              return (
                <div className="banner banner-info" style={{ margin: "0 1.5rem" }}>
                  {conductedByMe
                    ? `👁 L${modal.roundNum} is an earlier round you conducted. Only your most recent round is editable.`
                    : `👁 L${modal.roundNum} was conducted by another interviewer. You can view but not edit this feedback.`}
                </div>
              );
            })()}

            <div style={{ padding: "1rem 1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
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
                  ["communication",    "Communication"],
                  ["domain_knowledge", "Domain Knowledge"],
                  ["problem_solving",  "Problem Solving"],
                ].map(([field, label]) => (
                  <div className="field-group" key={field}>
                    <label className="field-label">
                      {label} <span className="scale-hint">(1–5)</span>
                    </label>
                    <select
                      value={form[field]}
                      disabled={modal.mode === "view"}
                      onChange={e => setForm({ ...form, [field]: e.target.value })}
                    >
                      <option value="">Select rating</option>
                      {[
                        [1, "1 — Poor"],
                        [2, "2 — Below Average"],
                        [3, "3 — Average"],
                        [4, "4 — Good"],
                        [5, "5 — Excellent"],
                      ].map(([v, l]) => (
                        <option key={v} value={v}>{l}</option>
                      ))}
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
            </div>

            <div className="modal-actions">
              {modal.mode !== "view" && (
                <button className="btn-submit" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit"}
                </button>
              )}
              <button className="btn-cancel" onClick={closeModal}>
                {modal.mode === "view" ? "Close" : "Cancel"}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ── NOTES MODAL (opened by 📓 button) ───────────────────────────── */}
      {notesModal.open && notesModal.candidate && (
        <div className="modal-backdrop" onClick={closeNotesModal}>
          <div className="notes-modal" onClick={e => e.stopPropagation()}>

            <div className="modal-header">
              <div>
                <h3>📓 Interview Notes</h3>
                <p className="modal-subtitle">
                  {notesModal.candidate.name}
                  <span className="cand-id" style={{ marginLeft: "8px" }}>
                    {notesModal.candidate.candidate_id}
                  </span>
                </p>
              </div>
              <button className="modal-close" onClick={closeNotesModal}>✕</button>
            </div>

            <div className="notes-body">
              <p className="notes-hint">
                Jot anything during the interview — observations, strengths, red flags, follow-up questions. Only visible to you.
              </p>
              <textarea
                className="notes-textarea"
                placeholder={"Start typing your notes here…\n\ne.g.\n- Strong DSA fundamentals\n- Struggled with system design\n- Good communication, asks clarifying questions"}
                value={notesText}
                onChange={e => setNotesText(e.target.value)}
                rows={12}
                autoFocus
              />
              <div className="notes-footer">
                <span className="notes-char-count">{notesText.length} characters</span>
                <div className="notes-actions">
                  {notesSaved && <span className="notes-saved-msg">✅ Saved</span>}
                  <button className="btn-cancel" onClick={closeNotesModal}>Close</button>
                  <button
                    className="btn-save-notes"
                    onClick={saveNotes}
                    disabled={notesSaving}
                  >
                    {notesSaving ? "Saving…" : "💾 Save Notes"}
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Toast ─────────────────────────────────────────────────── */}
      {toast && (
        <div className="ip-toast-container">
          <div className={`ip-toast ip-toast--${toast.type}`}>
            <span className="ip-toast-icon">{toast.type === "success" ? "✓" : "✕"}</span>
            <span className="ip-toast-msg">{toast.msg}</span>
          </div>
        </div>
      )}

    </div>
  );
}

export default InterviewPage;
