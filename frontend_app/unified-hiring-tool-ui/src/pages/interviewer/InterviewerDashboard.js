import React, { useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import './InterviewerDashboard.css';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { BASE_URL } from '../../services/api';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';
const HEADERS  = { headers: { 'ngrok-skip-browser-warning': 'true' } };

const parseDate = (dt) => {
  if (dt == null) return null;
  let raw = dt;
  if (typeof raw === 'object' && '$date' in raw) raw = raw.$date;                 // {$date: ...}
  if (raw && typeof raw === 'object' && '$numberLong' in raw) raw = Number(raw.$numberLong);
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

// Candidate creation date is stored at the root as `datetime` (an ISO string,
// e.g. "2026-06-08T09:30:11.468000"). Other names kept as defensive fallbacks.
const CREATED_KEYS = ['datetime', 'created_at', 'timestamp', 'createdAt', 'created', 'added_on'];
const createdDate = (obj) => {
  if (!obj) return null;
  for (const k of CREATED_KEYS) if (obj[k] != null) return obj[k];
  return null;
};

const todayStr   = () => new Date().toLocaleDateString('en-CA');
const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString('en-CA');
const monthEnd   = () => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toLocaleDateString('en-CA');
const yearStart  = () => new Date(new Date().getFullYear(), 0, 1).toLocaleDateString('en-CA');
const addDays    = (str, n) => { const d = new Date(str); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };

const inRange = (dateStr, from, to) => {
  const d = parseDate(dateStr);
  if (!d) return false;
  const s = d.toLocaleDateString('en-CA');
  return s >= from && s <= to;
};

const getInitials = (name = '') =>
  name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

/* ── one common range used by every widget ────────────────────────────── */
const PRESETS = [
  { key: 'today', label: 'Today',      range: () => ({ from: todayStr(),         to: todayStr() }) },
  { key: '7d',    label: '7D',         range: () => ({ from: addDays(todayStr(), -6),  to: todayStr() }) },
  { key: '30d',   label: '30D',        range: () => ({ from: addDays(todayStr(), -29), to: todayStr() }) },
  { key: 'month', label: 'This Month', range: () => ({ from: monthStart(),        to: monthEnd() }) },
  { key: 'year',  label: 'This Year',  range: () => ({ from: yearStart(),         to: todayStr() }) },
];

/* count-up animation for stat numbers (no external dependency) */
function useCountUp(target, duration = 650) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf;
    const start = performance.now();
    const to = Number(target) || 0;
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function StatNum({ value, decimals = 0 }) {
  const isNum = value !== null && value !== undefined && value !== '—';
  const animated = useCountUp(isNum ? Number(value) : 0);
  if (!isNum) return <span className="stat-num">—</span>;
  return <span className="stat-num">{animated.toFixed(decimals)}</span>;
}

function DateRangePicker({ from, to, onChange }) {
  return (
    <div className="drp-wrap">
      <input type="date" className="drp-input" value={from} max={to}
        onChange={e => onChange(e.target.value, to)} />
      <span className="drp-sep">→</span>
      <input type="date" className="drp-input" value={to} min={from}
        onChange={e => onChange(from, e.target.value)} />
    </div>
  );
}

function InterviewerDashboard() {
  const { userId } = useParams();
  const navigate   = useNavigate();

  const [interviewerData, setInterviewerData] = useState(null);
  const [allCandidates,   setAllCandidates]   = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [myId,            setMyId]            = useState('');

  /* ── single shared range for the whole dashboard ── */
  const [range, setRange] = useState({ from: monthStart(), to: monthEnd() });

  const activePreset = useMemo(() => {
    const match = PRESETS.find(p => {
      const r = p.range();
      return r.from === range.from && r.to === range.to;
    });
    return match ? match.key : null;
  }, [range]);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const localUser   = JSON.parse(localStorage.getItem('user') || '{}');
        const activeId    = userId || localUser.user_id || localUser.interviewer_id || localUser.id;
        const activeEmail = localUser.email || '';

        const [interviewersRes, candidatesRes] = await Promise.all([
          axios.get(`${BASE_URL}/get-interviewers/`, HEADERS),
          activeEmail
            ? axios.get(`${BASE_URL}/get-interviewer-candidates/${encodeURIComponent(activeEmail)}`, HEADERS)
            : Promise.resolve({ data: [] }),
        ]);

        const candidates = candidatesRes.data || [];
        setAllCandidates(candidates);

        const dbUser = interviewersRes.data.find(i =>
          String(i.interviewer_id) === String(activeId) ||
          String(i.id)             === String(activeId)
        );
        const userData = dbUser || localUser;
        setInterviewerData(userData);
        setMyId(String(userData.interviewer_id || userData.id || activeId));

      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [userId]);

  /* all MY interviews flattened from assigned candidates */
  const myInterviews = useMemo(() => {
    if (!myId) return [];
    return allCandidates.flatMap(c =>
      (c.interviews || [])
        .filter(iv => String(iv.interviewer_id) === myId)
        .map(iv => ({
          ...iv,
          candidateName: c.name,
          candidateRole: c.applied_role || '—',
          candidateId:   c.candidate_id,
        }))
    );
  }, [allCandidates, myId]);

  const interviewsToday = useMemo(() => {
    const t = todayStr();
    return myInterviews.filter(iv => {
      const d = parseDate(iv.datetime);
      return d && d.toLocaleDateString('en-CA') === t;
    }).length;
  }, [myInterviews]);

  // Pending = assigned candidates not yet selected or rejected, whose creation
  // date falls in the shared range (consistent with the HR dashboard).
  const pendingCandidatesList = useMemo(() =>
    allCandidates.filter(c =>
      !c.candidate_selected &&
      !c.candidate_rejected &&
      inRange(createdDate(c), range.from, range.to)
    ),
    [allCandidates, range]
  );
  const pendingFeedbackCount = pendingCandidatesList.length;

  const pendingFeedbackList = useMemo(() =>
    pendingCandidatesList.slice(0, 8).map(c => ({
      candidateName: c.name,
      candidateRole: c.applied_role || '—',
      candidateId:   c.candidate_id,
      hrName:        c.interview_details?.scheduled_by_hr_name || null,
      roundsPending: !(c.interviews || []).length
        ? 'No rounds yet'
        : `Pending L${Math.max(...(c.interviews || []).map(i => i.round)) + 1}`,
    })),
    [pendingCandidatesList]
  );

  /* ── everything below now reads the single shared `range` ── */
  const interviewsInRange = useMemo(() =>
    myInterviews.filter(iv => inRange(iv.datetime, range.from, range.to)).length,
    [myInterviews, range]
  );

  const avgScoreInRange = useMemo(() => {
    const filtered = myInterviews.filter(iv =>
      iv.ratings && inRange(iv.datetime, range.from, range.to)
    );
    if (!filtered.length) return null;
    let sum = 0, cnt = 0;
    filtered.forEach(iv => { Object.values(iv.ratings).forEach(v => { sum += v; cnt++; }); });
    return cnt > 0 ? parseFloat((sum / cnt).toFixed(1)) : null;
  }, [myInterviews, range]);

  const scheduledList = useMemo(() =>
    myInterviews
      .filter(iv => inRange(iv.datetime, range.from, range.to))
      .sort((a, b) => (parseDate(a.datetime) || 0) - (parseDate(b.datetime) || 0)),
    [myInterviews, range]
  );

  // Recent activity — interviews I conducted, filtered to the shared range
  const recentActivityList = useMemo(() =>
    myInterviews
      .filter(iv => inRange(iv.datetime, range.from, range.to))
      .sort((a, b) => (parseDate(b.datetime) || 0) - (parseDate(a.datetime) || 0))
      .slice(0, 6),
    [myInterviews, range]
  );

  const scoreBreakdown = useMemo(() => {
    const filtered = myInterviews.filter(iv =>
      iv.ratings && inRange(iv.datetime, range.from, range.to)
    );
    if (!filtered.length) return { communication: 0, problem_solving: 0, domain_knowledge: 0 };
    const sum = { communication: 0, problem_solving: 0, domain_knowledge: 0 };
    let cnt = 0;
    filtered.forEach(iv => {
      sum.communication    += iv.ratings.communication    || 0;
      sum.problem_solving  += iv.ratings.problem_solving  || 0;
      sum.domain_knowledge += iv.ratings.domain_knowledge || 0;
      cnt++;
    });
    return {
      communication:    cnt ? parseFloat((sum.communication    / cnt).toFixed(1)) : 0,
      problem_solving:  cnt ? parseFloat((sum.problem_solving  / cnt).toFixed(1)) : 0,
      domain_knowledge: cnt ? parseFloat((sum.domain_knowledge / cnt).toFixed(1)) : 0,
    };
  }, [myInterviews, range]);

  // ── Chart — daily buckets for short ranges, weekly for longer ────────────
  const chartData = useMemo(() => {
    const start = new Date(range.from);
    const end   = new Date(range.to);
    const spanDays = Math.round((end - start) / 86400000) + 1;
    const stepDays = spanDays <= 31 ? 1 : 7;

    const labels = [];
    const counts = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + stepDays)) {
      const bStart = new Date(d);
      const bEnd   = new Date(d); bEnd.setDate(bEnd.getDate() + stepDays - 1);
      const bEndEod = new Date(bEnd.getFullYear(), bEnd.getMonth(), bEnd.getDate(), 23, 59, 59);

      labels.push(bStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
      counts.push(myInterviews.filter(iv => {
        const dt = parseDate(iv.datetime);
        return dt && dt >= bStart && dt <= bEndEod;
      }).length);
    }
    return {
      labels,
      datasets: [{
        label: 'Interviews',
        data: counts,
        backgroundColor: '#0055ff',
        hoverBackgroundColor: '#003fcc',
        borderRadius: 8,
        maxBarThickness: 30,
      }]
    };
  }, [myInterviews, range]);

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0b1220',
        padding: 10,
        cornerRadius: 8,
        titleColor: '#ffffff',
        bodyColor: '#cbd5e1',
        displayColors: false,
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
      y: { beginAtZero: true, grid: { color: '#eef2f7' }, ticks: { stepSize: 1, color: '#94a3b8' } },
    },
  };

  const thisWeekCount = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    return myInterviews.filter(iv => {
      const d = parseDate(iv.datetime);
      return d && d >= weekAgo && d <= now;
    }).length;
  }, [myInterviews]);

  const lastWeekCount = useMemo(() => {
    const now = new Date();
    const weekAgo  = new Date(now); weekAgo.setDate(now.getDate() - 7);
    const twoWeeks = new Date(now); twoWeeks.setDate(now.getDate() - 14);
    return myInterviews.filter(iv => {
      const d = parseDate(iv.datetime);
      return d && d >= twoWeeks && d < weekAgo;
    }).length;
  }, [myInterviews]);

  const percentGrowth = lastWeekCount === 0
    ? (thisWeekCount > 0 ? 100 : 0)
    : Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100);

  function ScoreBar({ label, value, color }) {
    return (
      <div className="score-bar-row">
        <span className="score-bar-label">{label}</span>
        <div className="score-bar-track">
          <div className="score-bar-fill" style={{ width: `${(value / 5) * 100}%`, background: color }} />
        </div>
        <span className="score-bar-val">{value > 0 ? value : '—'}</span>
      </div>
    );
  }

  if (loading) return <div className="dash-loading">Loading dashboard…</div>;

  const name = interviewerData?.name || 'Interviewer';

  return (
    <div className="interviewer-dashboard idash-enhanced">
      {/* scoped enhancement styles — additive only, never overrides existing CSS */}
      <style>{IDASH_STYLES}</style>

      <div className="dash-header idash-header">
        <div>
          <h1 className="dash-title">Welcome back, {name.split(' ')[0]} 👋</h1>
          <p className="dash-sub">Here's your interview activity overview — assigned candidates only.</p>
        </div>

        {/* ── ONE common date range picker for the whole dashboard ── */}
        <div className="idash-toolbar">
          <div className="idash-presets">
            {PRESETS.map(p => (
              <button
                key={p.key}
                className={`idash-chip ${activePreset === p.key ? 'active' : ''}`}
                onClick={() => setRange(p.range())}
              >
                {p.label}
              </button>
            ))}
          </div>
          <DateRangePicker
            from={range.from} to={range.to}
            onChange={(f, t) => setRange({ from: f, to: t })}
          />
        </div>
      </div>

      {/* ── Row 1 ──────────────────────────────────────────────── */}
      <div className="dash-row1">
        <div className="dash-card stat-card clickable"
          onClick={() => navigate(`/interviewer/${userId}/interviews`)}>
          <div className="stat-icon blue"><i className="bi bi-calendar-check" /></div>
          <div className="stat-body">
            <StatNum value={interviewsToday} />
            <div className="stat-lbl">Today's Interviews</div>
          </div>
        </div>

        <div className="dash-card stat-card">
          <div className="stat-icon purple"><i className="bi bi-graph-up" /></div>
          <div className="stat-body">
            <StatNum value={interviewsInRange} />
            <div className="stat-lbl">Interviews in Range</div>
          </div>
        </div>

        <div className="dash-card stat-card">
          <div className="stat-icon green"><i className="bi bi-star-half" /></div>
          <div className="stat-body">
            <StatNum value={avgScoreInRange} decimals={1} />
            <div className="stat-lbl">Avg Score / 5</div>
          </div>
        </div>

        <div className="dash-card stat-card clickable"
          onClick={() => navigate(`/interviewer/${userId}/interviews`)}>
          <div className="stat-icon orange"><i className="bi bi-people" /></div>
          <div className="stat-body">
            <StatNum value={allCandidates.length} />
            <div className="stat-lbl">Assigned Candidates</div>
          </div>
        </div>
      </div>

      {/* ── Row 2 ──────────────────────────────────────────────── */}
      <div className="dash-row2">
        <div className="dash-card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-clock" /> Scheduled interviews</span>
            <span className="idash-range-tag">{range.from} → {range.to}</span>
          </div>
          <div className="card-sub" style={{ marginTop: '0.25rem' }}>
            {scheduledList.length} interview{scheduledList.length !== 1 ? 's' : ''} in range
          </div>
          {scheduledList.length === 0 ? (
            <div className="empty-state">
              <i className="bi bi-calendar-x" />
              <p>No interviews in this date range</p>
            </div>
          ) : (
            scheduledList.map((iv, idx) => (
              <div className="cand-row" key={idx}>
                <div className="avatar">{getInitials(iv.candidateName)}</div>
                <div className="cand-info">
                  <div className="cand-name">{iv.candidateName}</div>
                  <div className="cand-meta">
                    {iv.candidateRole} ·{' '}
                    {iv.datetime
                      ? parseDate(iv.datetime).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </div>
                </div>
                <span className={`round-pill round-${iv.round}`}>Round {iv.round}</span>
              </div>
            ))
          )}
        </div>

        <div className="dash-card">
          <div className="card-header">
            <span className="card-title">
              <i className="bi bi-hourglass-split" /> Pending candidates
            </span>
            {pendingFeedbackCount > 0 && (
              <span className="card-tag danger">{pendingFeedbackCount} not completed</span>
            )}
          </div>
          <div className="card-sub">Assigned candidates with no verdict yet · {range.from} → {range.to}</div>

          {pendingFeedbackList.length === 0 ? (
            <div className="empty-state success">
              <i className="bi bi-check2-all" />
              <p>No pending candidates in this range</p>
            </div>
          ) : (
            pendingFeedbackList.map((c, idx) => (
              <div className="cand-row clickable" key={idx}
                onClick={() => navigate(`/interviewer/${userId}/interviews`)}>
                <div className="avatar danger-avatar">{getInitials(c.candidateName)}</div>
                <div className="cand-info">
                  <div className="cand-name">{c.candidateName}</div>
                  <div className="cand-meta">
                    {c.candidateRole} · {c.roundsPending}
                    {c.hrName && <span style={{ color: '#5c5cff', marginLeft: '6px' }}>· 👤 {c.hrName}</span>}
                  </div>
                </div>
                <span className="round-pill overdue">Go →</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Row 3 ──────────────────────────────────────────────── */}
      <div className="dash-row3">
        <div className="dash-card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-sliders" /> My scoring breakdown</span>
            <span className="idash-range-tag">{range.from} → {range.to}</span>
          </div>
          <div style={{ marginTop: '0.8rem' }}>
            <ScoreBar label="Communication"    value={scoreBreakdown.communication}    color="#0055ff" />
            <ScoreBar label="Problem Solving"  value={scoreBreakdown.problem_solving}  color="#7c6ff7" />
            <ScoreBar label="Domain Knowledge" value={scoreBreakdown.domain_knowledge} color="#00b894" />
          </div>
          <div className="score-avg-line">
            Overall avg:{' '}
            <strong>
              {scoreBreakdown.communication > 0
                ? ((scoreBreakdown.communication + scoreBreakdown.problem_solving + scoreBreakdown.domain_knowledge) / 3).toFixed(1)
                : '—'} / 5
            </strong>
          </div>
        </div>

        <div className="dash-card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-lightning-charge" /> Quick actions</span>
          </div>
          <div className="quick-grid">
            <button className="quick-btn" onClick={() => navigate(`/interviewer/${userId}/interviews`)}>
              <i className="bi bi-pencil" /><span>Submit feedback</span>
            </button>
            <button className="quick-btn" onClick={() => navigate(`/interviewer/${userId}/fitment`)}>
              <i className="bi bi-graph-up-arrow" /><span>Score fitment</span>
            </button>
            <button className="quick-btn" onClick={() => navigate(`/interviewer/${userId}/compare`)}>
              <i className="bi bi-people" /><span>Compare candidates</span>
            </button>
            <button className="quick-btn" onClick={() => navigate(`/interviewer/${userId}/assistant`)}>
              <i className="bi bi-chat-dots" /><span>Ask RAG</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Row 4 ──────────────────────────────────────────────── */}
      <div className="dash-row4">
        <div className="dash-card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-bar-chart" /> Interview trend</span>
            <span className={`growth-badge ${percentGrowth >= 0 ? 'up' : 'down'}`}>
              {percentGrowth > 0 ? `↑ ${percentGrowth}%`
                : percentGrowth < 0 ? `↓ ${Math.abs(percentGrowth)}%`
                : '— no change'} vs last week
            </span>
          </div>
          <div className="card-sub" style={{ marginBottom: '0.6rem' }}>
            Range: {range.from} → {range.to}
          </div>
          <div className="idash-chart-wrap">
            <Bar data={chartData} options={chartOptions} />
          </div>
        </div>

        <div className="dash-card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-clock-history" /> Recent activity</span>
            <span className="idash-range-tag">{range.from} → {range.to}</span>
          </div>
          {recentActivityList.length === 0 ? (
            <div className="empty-state"><i className="bi bi-inbox" /><p>No activity in this range</p></div>
          ) : (
            recentActivityList
              .map((iv, idx) => {
                const daysAgo = Math.floor((Date.now() - (parseDate(iv.datetime) || 0)) / 86400000);
                const timeLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`;
                return (
                  <div className="activity-row" key={idx}>
                    <div className="activity-dot" />
                    <div className="activity-info">
                      <div className="activity-text">Interviewed {iv.candidateName} — Round {iv.round}</div>
                      <div className="activity-role">{iv.candidateRole}</div>
                    </div>
                    <div className="activity-time">{timeLabel}</div>
                  </div>
                );
              })
          )}
        </div>
      </div>
    </div>
  );
}

/* Scoped, additive enhancement styles. Everything is namespaced under
   .idash-enhanced so it layers on top of your existing InterviewerDashboard.css
   without overriding any of the original rules. */
const IDASH_STYLES = `
.idash-enhanced .idash-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.idash-enhanced .idash-toolbar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.idash-enhanced .idash-presets {
  display: inline-flex;
  gap: 4px;
  background: #f1f5fb;
  border: 1px solid #e3e9f4;
  border-radius: 12px;
  padding: 4px;
}
.idash-enhanced .idash-chip {
  border: none;
  background: transparent;
  color: #5b6577;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 9px;
  cursor: pointer;
  transition: background .15s ease, color .15s ease, transform .12s ease;
}
.idash-enhanced .idash-chip:hover { color: #0055ff; transform: translateY(-1px); }
.idash-enhanced .idash-chip.active {
  background: #0055ff;
  color: #fff;
  box-shadow: 0 4px 10px rgba(0,85,255,.28);
}
.idash-enhanced .idash-range-tag {
  font-size: 0.72rem;
  font-weight: 600;
  color: #6b7280;
  background: #f3f5fa;
  border: 1px solid #e6eaf2;
  border-radius: 999px;
  padding: 3px 10px;
}

/* card + stat-card interactivity */
.idash-enhanced .stat-card,
.idash-enhanced .dash-card {
  transition: transform .18s ease, box-shadow .18s ease;
}
.idash-enhanced .stat-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 12px 26px rgba(2, 32, 71, .10);
}
.idash-enhanced .stat-card.clickable { cursor: pointer; }
.idash-enhanced .stat-card.clickable:active { transform: translateY(-1px); }
.idash-enhanced .quick-btn { transition: transform .15s ease, box-shadow .15s ease; }
.idash-enhanced .quick-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 18px rgba(0, 85, 255, .14);
}
.idash-enhanced .cand-row.clickable { transition: background .15s ease, transform .12s ease; }
.idash-enhanced .cand-row.clickable:hover { transform: translateX(2px); }

/* fixed-height chart container so the bar chart stays crisp */
.idash-enhanced .idash-chart-wrap { height: 240px; position: relative; }

/* gentle entrance for the rows */
.idash-enhanced .dash-row1,
.idash-enhanced .dash-row2,
.idash-enhanced .dash-row3,
.idash-enhanced .dash-row4 {
  animation: idashFade .35s ease both;
}
.idash-enhanced .dash-row2 { animation-delay: .04s; }
.idash-enhanced .dash-row3 { animation-delay: .08s; }
.idash-enhanced .dash-row4 { animation-delay: .12s; }
@keyframes idashFade {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
@media (max-width: 640px) {
  .idash-enhanced .idash-toolbar { width: 100%; }
  .idash-enhanced .idash-presets { width: 100%; justify-content: space-between; }
}
`;

<<<<<<< HEAD
export default InterviewerDashboard;
=======
export default InterviewerDashboard;
>>>>>>> b03856d (Remove hardcoded config: centralize in config.py + env vars)
