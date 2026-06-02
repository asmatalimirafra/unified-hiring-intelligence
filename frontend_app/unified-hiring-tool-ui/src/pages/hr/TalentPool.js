import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import "./TalentPool.css";

const BASE_URL = "https://unwithering-unattentively-herbert.ngrok-free.dev";
const axiosConfig = { headers: { "ngrok-skip-browser-warning": "69420" } };
const PAGE_SIZE = 50;

const STATUS_META = {
  "Pending":            { color: "#3b82f6", bg: "#eff6ff", label: "Pending" },
  "Scheduled":          { color: "#8b5cf6", bg: "#f5f3ff", label: "Scheduled" },
  "Selected":           { color: "#10b981", bg: "#ecfdf5", label: "Selected" },
  "Interview Rejected": { color: "#ef4444", bg: "#fef2f2", label: "Interview Rejected" },
  "ATS Rejected":       { color: "#f97316", bg: "#fff7ed", label: "ATS Rejected" },
  "Not Joined":         { color: "#6b7280", bg: "#f9fafb", label: "Not Joined" },
};

function ScoreBar({ score }) {
  const color =
    score >= 70 ? "#10b981" :
    score >= 50 ? "#3b82f6" :
    score >= 30 ? "#f97316" : "#ef4444";
  return (
    <div className="tp-score-bar-wrap">
      <div className="tp-score-bar-track">
        <div className="tp-score-bar-fill" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="tp-score-label" style={{ color }}>{score}%</span>
    </div>
  );
}

function FitmentCell({ score }) {
  if (score === null || score === undefined) {
    return (
      <span
        className="tp-fitment-none"
        title="Fitment has not been computed for this candidate yet. Open their Fitment page to generate a score."
      >
        —
      </span>
    );
  }
  const color =
    score >= 70 ? "#10b981" :
    score >= 50 ? "#3b82f6" :
    score >= 30 ? "#f97316" : "#ef4444";
  return (
    <span
      className="tp-fitment-score"
      style={{ color }}
      title="Fitment score against the candidate's originally applied role (cached from a previous run)."
    >
      {score}%
    </span>
  );
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { color: "#6b7280", bg: "#f3f4f6", label: status };
  return (
    <span className="tp-status-badge"
      style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.color}30` }}>
      {meta.label}
    </span>
  );
}

export default function TalentPool() {
  const [roles, setRoles] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [jdText, setJdText] = useState("");
  const [activeTab, setActiveTab] = useState("role");

  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [lastPayload, setLastPayload] = useState(null);

  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sending, setSending] = useState({});
  const [sentIds, setSentIds] = useState(new Set());
  const [toast, setToast] = useState(null);

  const [filterStatus, setFilterStatus] = useState("All");
  const [filterRole, setFilterRole] = useState("All");
  const [minScore, setMinScore] = useState(0);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    axios.get(`${BASE_URL}/get-roles/`, axiosConfig)
      .then(res => setRoles(Array.isArray(res.data) ? res.data : []))
      .catch(err => console.error("Error fetching roles:", err));
  }, []);

  const doSearch = useCallback(async (payload, page = 1) => {
    setLoading(true);
    try {
      const res = await axios.post(
        `${BASE_URL}/talent-pool/search`,
        { ...payload, page, page_size: PAGE_SIZE },
        axiosConfig
      );
      setResults(res.data.results || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.total_pages || 1);
      setCurrentPage(res.data.page || 1);
      setSearched(true);
    } catch (err) {
      showToast(err.response?.data?.detail || "Search failed.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSearch = async () => {
    const payload = {};
    if (activeTab === "role") {
      if (!selectedRoleId) return showToast("Please select a role.", "error");
      payload.role_id = selectedRoleId;
    } else {
      if (!jdText.trim()) return showToast("Please enter a job description or skills.", "error");
      payload.jd_text = jdText.trim();
    }
    setLastPayload(payload);
    setSentIds(new Set());
    setFilterStatus("All");
    setFilterRole("All");
    setMinScore(0);
    await doSearch(payload, 1);
  };

  const handlePageChange = async (newPage) => {
    if (!lastPayload || newPage < 1 || newPage > totalPages) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    await doSearch(lastPayload, newPage);
  };

  const handleSendToPending = async (candidateId) => {
    setSending(s => ({ ...s, [candidateId]: true }));
    try {
      await axios.post(
        `${BASE_URL}/talent-pool/send-to-pending/${candidateId}`,
        {},
        axiosConfig
      );
      setSentIds(s => new Set([...s, candidateId]));
      showToast("Candidate moved to Pending successfully.");
    } catch (err) {
      showToast(err.response?.data?.detail || "Failed to send to pending.", "error");
    } finally {
      setSending(s => ({ ...s, [candidateId]: false }));
    }
  };

  const uniqueRoles    = ["All", ...new Set(results.map(r => r.applied_role).filter(Boolean))];
  const uniqueStatuses = ["All", ...new Set(results.map(r => r.pipeline_status).filter(Boolean))];

  const filtered = results.filter(r => {
    if (filterStatus !== "All" && r.pipeline_status !== filterStatus) return false;
    if (filterRole   !== "All" && r.applied_role    !== filterRole)   return false;
    if (r.talent_score < minScore) return false;
    return true;
  });

  const globalRankStart = (currentPage - 1) * PAGE_SIZE;

  return (
    <div className="tp-root">
      {toast && (
        <div className={`tp-toast tp-toast--${toast.type}`}>
          {toast.type === "success" ? "✓" : "✕"} {toast.msg}
        </div>
      )}

      <div className="tp-header">
        <div className="tp-header-left">
          <span className="tp-header-icon">🎯</span>
          <div>
            <h1 className="tp-title">Talent Pool</h1>
            <p className="tp-subtitle">
              Search across <strong>all candidates</strong> in the database — ranked by relevance to any role
            </p>
          </div>
        </div>
      </div>

      <div className="tp-search-panel">
        <div className="tp-tab-row">
          <button
            className={`tp-tab ${activeTab === "role" ? "tp-tab--active" : ""}`}
            onClick={() => setActiveTab("role")}
          >📋 Search by Role</button>
          <button
            className={`tp-tab ${activeTab === "text" ? "tp-tab--active" : ""}`}
            onClick={() => setActiveTab("text")}
          >✏️ Search by JD / Skills</button>
        </div>

        <div className="tp-search-body">
          {activeTab === "role" ? (
            <div className="tp-field-group">
              <label className="tp-label">Select a role to match candidates against</label>
              <select
                className="tp-select"
                value={selectedRoleId}
                onChange={e => setSelectedRoleId(e.target.value)}
              >
                <option value="">— Choose a role —</option>
                {roles.map(r => (
                  <option key={r.role_id} value={r.role_id}>
                    {r.role} (ID: {r.role_id})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="tp-field-group">
              <label className="tp-label">Paste Job Description or list key skills</label>
              <textarea
                className="tp-textarea"
                rows={6}
                placeholder="e.g. Looking for an AI Engineer with Python, LLMs, RAG pipelines, FastAPI, vector databases..."
                value={jdText}
                onChange={e => setJdText(e.target.value)}
              />
            </div>
          )}

          <button className="tp-search-btn" onClick={handleSearch} disabled={loading}>
            {loading
              ? <><span className="tp-spinner" /> Scanning all candidates...</>
              : <><span>🔍</span> Find Best Matches</>
            }
          </button>
        </div>
      </div>

      {searched && (
        <div className="tp-results-section">
          <div className="tp-filter-bar">
            <div className="tp-results-count">
              Showing <strong>{filtered.length}</strong> on this page &nbsp;·&nbsp;
              <strong>{total}</strong> total candidates found
            </div>
            <div className="tp-filters">
              <div className="tp-filter-item">
                <label>Status</label>
                <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="tp-filter-select">
                  {uniqueStatuses.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="tp-filter-item">
                <label>Applied Role</label>
                <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="tp-filter-select">
                  {uniqueRoles.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              <div className="tp-filter-item">
                <label>Min Match %: <strong>{minScore}%</strong></label>
                <input type="range" min={0} max={100} step={5}
                  value={minScore} onChange={e => setMinScore(Number(e.target.value))}
                  className="tp-range"
                />
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="tp-empty">
              <span>🔎</span>
              <p>No candidates match your current filters on this page.</p>
            </div>
          ) : (
            <div className="tp-table-wrap">
              <table className="tp-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Candidate</th>
                    <th>Applied For</th>
                    <th>Current Status</th>
                    <th title="Re-scored against the JD or role you just searched for. Updates every search.">
                      Match Score
                    </th>
                    <th title="Cached fitment score against the candidate's originally applied role. Shown only when fitment has been computed previously.">
                      Fitment Score
                    </th>
                    <th>Interviews</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => {
                    const globalRank  = globalRankStart + i + 1;
                    const alreadySent = sentIds.has(c.candidate_id);
                    const isSending   = sending[c.candidate_id];
                    const canSend     = c.can_send_to_pending && !alreadySent;

                    return (
                      <tr key={c.candidate_id} className="tp-row">
                        <td className="tp-rank">
                          {globalRank <= 3
                            ? <span className="tp-medal">{["🥇","🥈","🥉"][globalRank - 1]}</span>
                            : <span className="tp-rank-num">{globalRank}</span>
                          }
                        </td>
                        <td className="tp-cell-name">
                          <div className="tp-name">{c.name}</div>
                          <div className="tp-meta">{c.candidate_id}</div>
                          {c.email && <div className="tp-meta">{c.email}</div>}
                        </td>
                        <td className="tp-cell-role">
                          <div className="tp-role-pill">{c.applied_role}</div>
                        </td>
                        <td>
                          <StatusBadge status={alreadySent ? "Pending" : c.pipeline_status} />
                        </td>
                        <td className="tp-cell-score">
                          <ScoreBar score={c.talent_score} />
                        </td>
                        <td className="tp-cell-fitment">
                          <FitmentCell score={c.fitment_score} />
                        </td>
                        <td className="tp-cell-rounds">
                          {c.interviews_count > 0
                            ? <span className="tp-rounds-badge">{c.interviews_count} round{c.interviews_count > 1 ? "s" : ""}</span>
                            : <span className="tp-rounds-none">—</span>
                          }
                        </td>
                        <td className="tp-cell-action">
                          {alreadySent ? (
                            <span className="tp-sent-label">✓ In Pending</span>
                          ) : canSend ? (
                            <button
                              className="tp-send-btn"
                              onClick={() => handleSendToPending(c.candidate_id)}
                              disabled={isSending}
                            >
                              {isSending ? <span className="tp-spinner tp-spinner--sm" /> : "➕"}
                              {isSending ? " Sending..." : " Send to Pending"}
                            </button>
                          ) : (
                            <span className="tp-no-action">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="tp-pagination">
              <button
                className="tp-page-btn"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1 || loading}
              >← Prev</button>

              <div className="tp-page-numbers">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                  .reduce((acc, p, idx, arr) => {
                    if (idx > 0 && p - arr[idx - 1] > 1) acc.push("...");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === "..." ? (
                      <span key={`ellipsis-${idx}`} className="tp-page-ellipsis">…</span>
                    ) : (
                      <button
                        key={item}
                        className={`tp-page-num ${item === currentPage ? "tp-page-num--active" : ""}`}
                        onClick={() => handlePageChange(item)}
                        disabled={loading}
                      >{item}</button>
                    )
                  )
                }
              </div>

              <button
                className="tp-page-btn"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages || loading}
              >Next →</button>

              <span className="tp-page-info">Page {currentPage} of {totalPages}</span>
            </div>
          )}
        </div>
      )}

      {!searched && !loading && (
        <div className="tp-idle">
          <div className="tp-idle-icon">🎯</div>
          <h3>Start by selecting a role or entering a job description</h3>
          <p>Searches across your <strong>entire candidate database</strong> — all roles, all HR accounts</p>
        </div>
      )}
    </div>
  );
}
