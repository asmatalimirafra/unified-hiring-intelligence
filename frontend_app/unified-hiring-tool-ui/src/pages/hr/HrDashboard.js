import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './HrDashboard.css';
import { Bar } from 'react-chartjs-2';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';
const HEADERS  = { headers: { 'ngrok-skip-browser-warning': 'true' } };

const curMonth = () => new Date().getMonth();
const curYear  = () => new Date().getFullYear();
const monthStartStr = () => new Date(curYear(), curMonth(), 1).toLocaleDateString('en-CA');
const monthEndStr   = () => new Date(curYear(), curMonth() + 1, 0).toLocaleDateString('en-CA');

const inRange = (dateStr, from, to) => {
  if (!dateStr) return false;
  const d = new Date(dateStr).toLocaleDateString('en-CA');
  return d >= from && d <= to;
};

const getInitials = (name = '') =>
  name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

function DateRangePicker({ from, to, onChange }) {
  return (
    <div className="hr-drp-wrap">
      <input type="date" className="hr-drp-input" value={from} max={to}
        onChange={e => onChange(e.target.value, to)} />
      <span className="hr-drp-sep">→</span>
      <input type="date" className="hr-drp-input" value={to} min={from}
        onChange={e => onChange(from, e.target.value)} />
    </div>
  );
}

const relativeTime = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const days = Math.floor((Date.now() - d) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
};

export default function HrDashboard() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  /* ── state ──────────────────────────────────────────────────── */
  const [loading,            setLoading]            = useState(true);
  const [interviewsPending,  setInterviewsPending]  = useState(0);
  const [openPositions,      setOpenPositions]      = useState(0);
  const [rolesClosedCount,   setRolesClosedCount]   = useState(0);
  const [allClosedRolesData, setAllClosedRolesData] = useState([]);
  const [openRolesList,      setOpenRolesList]      = useState([]);
  const [interviewerRanking, setInterviewerRanking] = useState([]);
  const [recentActivity,     setRecentActivity]     = useState([]);

  // Raw data stored for range-picker re-computation
  const [allInterviewerData, setAllInterviewerData] = useState([]);
  const [allCandidatesData,  setAllCandidatesData]  = useState([]);

  // Date range pickers
  const [rangeInterviewsStat, setRangeInterviewsStat] = useState({ from: monthStartStr(), to: monthEndStr() });
  const [rangeInterviews,     setRangeInterviews]     = useState({ from: monthStartStr(), to: monthEndStr() });
  const [rangeVerdicts,       setRangeVerdicts]       = useState({ from: monthStartStr(), to: monthEndStr() });
  const [rangeFunnel,         setRangeFunnel]         = useState({ from: monthStartStr(), to: monthEndStr() });
  const [rangeClosed,         setRangeClosed]         = useState({ from: '2020-01-01', to: monthEndStr() });

  // Computed from range pickers
  const [interviewsInRange, setInterviewsInRange] = useState(0);
  const [hireCount,         setHireCount]         = useState(0);
  const [verdictCounts,     setVerdictCounts]     = useState({ strongHire: 0, hire: 0, weakHire: 0, noHire: 0 });
  const [interviewWeekly,   setInterviewWeekly]   = useState([0, 0, 0, 0]);
  const [funnelInRange,     setFunnelInRange]     = useState({ applied: 0, round1: 0, round2: 0, hired: 0 });
  const [closedWeeklyRange, setClosedWeeklyRange] = useState([0, 0, 0, 0]);

  /* ── fetch ──────────────────────────────────────────────────── */
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [candidatesRes, rolesRes, interviewersRes] = await Promise.all([
          axios.get(`${BASE_URL}/get-candidates/`,  HEADERS),
          axios.get(`${BASE_URL}/get-roles/`,       HEADERS),
          axios.get(`${BASE_URL}/get-interviewers/`,HEADERS),
        ]);

        const candidates  = Array.isArray(candidatesRes.data)   ? candidatesRes.data   : [];
        const roles       = Array.isArray(rolesRes.data)        ? rolesRes.data        : [];
        const interviewers= Array.isArray(interviewersRes.data) ? interviewersRes.data : [];

        // Store raw data for range-picker re-computation
        setAllInterviewerData(interviewers);
        setAllCandidatesData(candidates);

        const month = curMonth();
        const year  = curYear();

        /* ── candidates pending (interview_completed !== true) ── */
        setInterviewsPending(candidates.filter(c => !(c.interview_completed === true)).length);

        /* ── open roles count — from /get-roles/ status field ── */
        const open   = roles.filter(r => r.status === 'open');
        const closed = roles.filter(r => r.status === 'closed');
        setOpenPositions(open.length);

        /* ── closed roles count — from /get-roles/ status field ─ */
        setRolesClosedCount(closed.length);

        /* ── store closed roles for the chart (use status field) ─ */
        setAllClosedRolesData(closed);

        /* ── open roles list with candidate counts ──────────── */
        setOpenRolesList(open.map(role => ({
          ...role,
          candidateCount: candidates.filter(
            c => String(c.applied_role_id) === String(role.role_id)
          ).length,
        })));

        /* ── interviewer ranking (current month) ────────────── */
        const ranked = interviewers
          .map(i => {
            const cnt = (i.interviews_taken || []).filter(({ datetime }) => {
              const d = new Date(datetime);
              return d.getMonth() === month && d.getFullYear() === year;
            }).length;
            return { name: i.name, department: i.department || '—', count: cnt };
          })
          .filter(i => i.count > 0)
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
        const maxCount = ranked[0]?.count || 1;
        setInterviewerRanking(ranked.map(i => ({ ...i, pct: Math.round((i.count / maxCount) * 100) })));

        /* ── recent activity ────────────────────────────────── */
        const events = [];
        [...candidates]
          .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
          .slice(0, 4)
          .forEach(c => events.push({
            text:  `Candidate ${c.name} added — ${c.applied_role || ''}`,
            time:  relativeTime(c.created_at),
            ts:    new Date(c.created_at || 0),
            color: '#059669',
          }));
        candidates
          .filter(c => c.interview_aggregate?.verdict && c.interview_aggregate?.aggregated_at)
          .sort((a, b) => new Date(b.interview_aggregate.aggregated_at) - new Date(a.interview_aggregate.aggregated_at))
          .slice(0, 4)
          .forEach(c => {
            const v = c.interview_aggregate.verdict;
            events.push({
              text:  `Verdict for ${c.name}: ${v}`,
              time:  relativeTime(c.interview_aggregate.aggregated_at),
              ts:    new Date(c.interview_aggregate.aggregated_at),
              color: v.includes('Hire') && v !== 'No Hire' ? '#2563eb' : '#dc2626',
            });
          });
        [...closed]
          .sort((a, b) => new Date(a.closed_on?.$date || a.closed_on || 0) - new Date(b.closed_on?.$date || b.closed_on || 0))
          .reverse()
          .slice(0, 3)
          .forEach(r => {
            const raw = r.closed_on?.$date || r.closed_on;
            events.push({
              text:  `Role "${r.role}" closed`,
              time:  relativeTime(raw),
              ts:    new Date(raw || 0),
              color: '#f59e0b',
            });
          });
        events.sort((a, b) => b.ts - a.ts);
        setRecentActivity(events.slice(0, 8));

      } catch (e) {
        console.error('❌ HR Dashboard fetch failed:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  /* ── re-compute interviews STAT CARD ────────────────────────── */
  useEffect(() => {
    let cnt = 0;
    allInterviewerData.forEach(i => {
      (i.interviews_taken || []).forEach(({ datetime }) => {
        if (inRange(datetime, rangeInterviewsStat.from, rangeInterviewsStat.to)) cnt++;
      });
    });
    setInterviewsInRange(cnt);
  }, [allInterviewerData, rangeInterviewsStat]);

  /* ── re-compute interviews CHART ────────────────────────────── */
  useEffect(() => {
    const weekly = [0, 0, 0, 0];
    allInterviewerData.forEach(i => {
      (i.interviews_taken || []).forEach(({ datetime }) => {
        if (!inRange(datetime, rangeInterviews.from, rangeInterviews.to)) return;
        const day = new Date(datetime).getDate();
        weekly[Math.min(Math.floor((day - 1) / 7), 3)]++;
      });
    });
    setInterviewWeekly(weekly);
  }, [allInterviewerData, rangeInterviews]);

  /* ── re-compute hiring funnel ───────────────────────────────── */
  useEffect(() => {
    const filtered = allCandidatesData.filter(c =>
      (c.interviews || []).some(iv => inRange(iv.datetime, rangeFunnel.from, rangeFunnel.to))
    );
    setFunnelInRange({
      applied: filtered.length,
      round1:  filtered.filter(c => (c.interviews||[]).some(i => i.round === 1)).length,
      round2:  filtered.filter(c => (c.interviews||[]).some(i => i.round === 2)).length,
      // Only count as Hired if interview_completed === true
      hired:   filtered.filter(c => {
        if (c.interview_completed !== true) return false;
        const v = c.interview_aggregate?.verdict;
        return v === 'Hire' || v === 'Strong Hire';
      }).length,
    });
  }, [allCandidatesData, rangeFunnel]);

  /* ── re-compute closed roles chart ─────────────────────────── */
  useEffect(() => {
    const weekly = [0, 0, 0, 0];
    allClosedRolesData.forEach((role) => {
      // Safely extract closed_on — handles ISO string, Date object, or MongoDB $date wrapper
      let raw = role.closed_on;
      if (raw && typeof raw === 'object' && raw.$date) raw = raw.$date;
      if (!raw) return;
      const d = new Date(raw);
      if (isNaN(d.getTime())) return;
      const dateStr = d.toLocaleDateString('en-CA');
      if (dateStr < rangeClosed.from || dateStr > rangeClosed.to) return;
      const day = d.getDate();
      weekly[Math.min(Math.floor((day - 1) / 7), 3)]++;
    });
    setClosedWeeklyRange(weekly);
  }, [allClosedRolesData, rangeClosed]);

  /* ── re-compute verdicts ────────────────────────────────────── */
  useEffect(() => {
    const vc = { strongHire: 0, hire: 0, weakHire: 0, noHire: 0 };
    let hires = 0;
    allCandidatesData.forEach(c => {
      // Only count candidates in the Completed section (interview_completed === true)
      if (c.interview_completed !== true) return;
      const hasInterviewInRange = (c.interviews || []).some(iv =>
        inRange(iv.datetime, rangeVerdicts.from, rangeVerdicts.to)
      );
      if (!hasInterviewInRange) return;
      const v = c.interview_aggregate?.verdict;
      if      (v === 'Strong Hire') { vc.strongHire++; hires++; }
      else if (v === 'Hire')        { vc.hire++;        hires++; }
      else if (v === 'Weak Hire')     vc.weakHire++;
      else if (v === 'No Hire')       vc.noHire++;
    });
    setVerdictCounts(vc);
    setHireCount(hires);
  }, [allCandidatesData, rangeVerdicts]);

  /* ── weekly growth helper ───────────────────────────────────── */
  const getWeeklyGrowth = (weekly) => {
    const idx  = Math.min(Math.floor((new Date().getDate()-1)/7), 3);
    const last = weekly[idx] || 0;
    const prev = weekly[idx-1] || 0;
    if (prev === 0 && last === 0) return 0;
    if (prev === 0) return 100;
    if (last === 0) return -100;
    return Math.round(((last - prev) / prev) * 100);
  };

  const GrowthBadge = ({ value }) => (
    <span className={`growth-badge ${value > 0 ? 'up' : value < 0 ? 'down' : 'neu'}`}>
      {value > 0 ? `↑ ${value}%` : value < 0 ? `↓ ${Math.abs(value)}%` : '— no change'} vs last week
    </span>
  );

  /* ── chart config ───────────────────────────────────────────── */
  const baseChartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, ticks: { stepSize: 1, color: '#64748b', font: { size: 11 } }, grid: { color: 'rgba(148,163,184,0.1)', borderDash: [5,5] }, border: { display: false } },
      x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { display: false }, border: { display: false } },
    },
    animation: { duration: 1200, easing: 'easeInOutQuart' },
  };

  const closedChartOptions = {
    ...baseChartOptions,
    plugins: {
      ...baseChartOptions.plugins,
      tooltip: { cornerRadius: 8, callbacks: { label: ctx => ` ${ctx.raw} role${ctx.raw !== 1 ? 's' : ''} closed` } },
    },
  };

  const interviewChartOptions = {
    ...baseChartOptions,
    plugins: {
      ...baseChartOptions.plugins,
      tooltip: { cornerRadius: 8, callbacks: { label: ctx => ` ${ctx.raw} interview${ctx.raw !== 1 ? 's' : ''} conducted` } },
    },
  };

  const closedChartData = {
    labels: ['Week 1','Week 2','Week 3','Week 4'],
    datasets: [{ label: 'Roles closed', data: closedWeeklyRange, backgroundColor: 'rgba(30,41,59,0.8)', borderRadius: 6, borderSkipped: false }],
  };
  const interviewChartData = {
    labels: ['Week 1','Week 2','Week 3','Week 4'],
    datasets: [{ label: 'Interviews', data: interviewWeekly, backgroundColor: 'rgba(59,130,246,0.8)', borderRadius: 6, borderSkipped: false }],
  };

  /* ── funnel bar ─────────────────────────────────────────────── */
  const FunnelBar = ({ label, value, max, color }) => (
    <div className="funnel-row">
      <span className="funnel-label">{label}</span>
      <div className="funnel-track">
        <div className="funnel-fill" style={{ width: `${max > 0 ? Math.round((value/max)*100) : 0}%`, background: color }}>
          <span className="funnel-num">{value}</span>
        </div>
      </div>
    </div>
  );

  /* ── verdict bar ────────────────────────────────────────────── */
  const total = verdictCounts.strongHire + verdictCounts.hire + verdictCounts.weakHire + verdictCounts.noHire;
  const VerdictBar = ({ label, value, color }) => (
    <div className="verdict-row">
      <span className="verdict-label">{label}</span>
      <div className="verdict-track">
        <div className="verdict-fill" style={{ width: `${total > 0 ? Math.round((value/total)*100) : 0}%`, background: color }} />
      </div>
      <span className="verdict-num">{value}</span>
    </div>
  );

  const hireRate = total > 0
    ? Math.round(((verdictCounts.strongHire + verdictCounts.hire) / total) * 100)
    : 0;

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  if (loading) {
    return (
      <div className="hr-loading">
        <div className="hr-spinner" />
        <p>Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div className="hr-dashboard">

      {/* ── Header ─────────────────────────────────────────────── */}
      <motion.div className="hr-header" initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.5 }}>
        <div>
          <h2 className="dashboard-header">
            👋 Welcome back, <span className="username">{user.name || 'HR Professional'}</span>
          </h2>
          <p className="subhead">{dateLabel}</p>
        </div>
      </motion.div>

      {/* ── Stat cards (5) ─────────────────────────────────────── */}
      <div className="hr-stat-grid">
        {[
          { icon:'⏳', val: interviewsPending,  lbl:'Candidates pending',     accent:'#f59e0b', bg:'#fff8e1', delta: 'Awaiting review' },
          { icon:'💼', val: openPositions,      lbl:'Open roles',             accent:'#2563eb', bg:'#e6f0fb', delta: 'Active now' },
          { icon:'🔒', val: rolesClosedCount,   lbl:'Roles closed',           accent:'#dc2626', bg:'#fde8e8', delta: 'Total closed roles' },
          { icon:'🎯', val: hireCount,           lbl:'Hire verdicts',          accent:'#7c3aed', bg:'#ede9fe', delta: 'See verdict picker' },
        ].map((s, i) => (
          <motion.div
            key={i}
            className="hr-stat-card"
            style={{ borderLeftColor: s.accent }}
            initial={{ opacity:0, y:14 }}
            animate={{ opacity:1, y:0 }}
            transition={{ duration:0.4, delay: i * 0.07 }}
          >
            <div className="hr-stat-icon" style={{ background: s.bg }}>{s.icon}</div>
            <div className="hr-stat-val">{s.val}</div>
            <div className="hr-stat-lbl">{s.lbl}</div>
            <div className="hr-stat-delta">{s.delta}</div>
          </motion.div>
        ))}

        {/* Interviews in range — dedicated picker card */}
        <motion.div
          className="hr-stat-card hr-stat-card-picker"
          style={{ borderLeftColor: '#059669' }}
          initial={{ opacity:0, y:14 }}
          animate={{ opacity:1, y:0 }}
          transition={{ duration:0.4, delay: 0.28 }}
        >
          <div className="hr-stat-icon" style={{ background: '#e8f5e9' }}>📊</div>
          <div className="hr-stat-val">{interviewsInRange}</div>
          <div className="hr-stat-lbl">Interviews in range</div>
          <DateRangePicker
            from={rangeInterviewsStat.from} to={rangeInterviewsStat.to}
            onChange={(f, t) => setRangeInterviewsStat({ from: f, to: t })}
          />
        </motion.div>
      </div>

      {/* ── Row 2: Open roles + Funnel + Verdicts ──────────────── */}
      <div className="hr-row3">

        {/* Open roles */}
        <div className="hr-card">
          <div className="hr-card-header">
            <span className="hr-card-title">📋 Open roles status</span>
            <span className="hr-tag info">{openPositions} active</span>
          </div>
          {openRolesList.length === 0 ? (
            <div className="hr-empty">No open roles</div>
          ) : (
            openRolesList.map((role, i) => (
              <div className="hr-role-row" key={i}>
                <div
                  className="hr-role-dot"
                  style={{ background: Number(role.positions) <= 1 ? '#f59e0b' : '#059669' }}
                />
                <div className="hr-role-info">
                  <div className="hr-role-name">{role.role}</div>
                  <div className="hr-role-meta">{role.positions} vacanc{role.positions===1?'y':'ies'} · {role.candidateCount} candidates</div>
                </div>
                <span className={`hr-role-badge ${Number(role.positions) <= 1 ? 'closing' : 'open'}`}>
                  {Number(role.positions) <= 1 ? 'Closing soon' : 'Open'}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Hiring funnel */}
        <div className="hr-card">
          <div className="hr-card-header">
            <span className="hr-card-title">🔽 Hiring funnel</span>
          </div>
          <DateRangePicker
            from={rangeFunnel.from} to={rangeFunnel.to}
            onChange={(f, t) => setRangeFunnel({ from: f, to: t })}
          />
          <div style={{ marginTop: '0.7rem' }}>
            <FunnelBar label="Applied"  value={funnelInRange.applied} max={funnelInRange.applied} color="#2563eb" />
            <FunnelBar label="Round 1"  value={funnelInRange.round1}  max={funnelInRange.applied} color="#7c3aed" />
            <FunnelBar label="Round 2"  value={funnelInRange.round2}  max={funnelInRange.applied} color="#0891b2" />
            <FunnelBar label="Hired"    value={funnelInRange.hired}   max={funnelInRange.applied} color="#059669" />
          </div>
          <div className="hr-funnel-rate">
            Conversion: <strong>{funnelInRange.applied > 0 ? Math.round((funnelInRange.hired/funnelInRange.applied)*100) : 0}%</strong> applied → hired
          </div>
        </div>

        {/* Verdict breakdown */}
        <div className="hr-card">
          <div className="hr-card-header">
            <span className="hr-card-title">📊 Verdict breakdown</span>
            <span className="hr-tag good">Completed only</span>
          </div>
          <DateRangePicker
            from={rangeVerdicts.from} to={rangeVerdicts.to}
            onChange={(f, t) => setRangeVerdicts({ from: f, to: t })}
          />
          <div style={{ marginTop: '0.7rem' }}>
            <VerdictBar label="Strong Hire" value={verdictCounts.strongHire} color="#059669" />
            <VerdictBar label="Hire"        value={verdictCounts.hire}       color="#16a34a" />
            <VerdictBar label="Weak Hire"   value={verdictCounts.weakHire}   color="#f59e0b" />
            <VerdictBar label="No Hire"     value={verdictCounts.noHire}     color="#dc2626" />
          </div>
          <div className="hr-verdict-rate">
            Overall hire rate: <strong style={{ color:'#059669' }}>{hireRate}%</strong>
          </div>
        </div>
      </div>

      {/* ── Row 3: Charts ──────────────────────────────────────── */}
      <div className="hr-row2">
        <div className="hr-card">
          <div className="hr-card-header">
            <span className="hr-card-title">📉 Roles closed</span>
            <GrowthBadge value={getWeeklyGrowth(closedWeeklyRange)} />
          </div>
          <DateRangePicker
            from={rangeClosed.from} to={rangeClosed.to}
            onChange={(f, t) => setRangeClosed({ from: f, to: t })}
          />
          <div style={{ height:'160px', width:'100%', marginTop:'0.6rem' }}>
            <Bar data={closedChartData} options={closedChartOptions} />
          </div>
          <button className="hr-btn-view" onClick={() => navigate('/hr/roles')}>
            View all roles →
          </button>
        </div>

        <div className="hr-card">
          <div className="hr-card-header">
            <span className="hr-card-title">📈 Interviews conducted</span>
            <GrowthBadge value={getWeeklyGrowth(interviewWeekly)} />
          </div>
          <DateRangePicker
            from={rangeInterviews.from} to={rangeInterviews.to}
            onChange={(f, t) => setRangeInterviews({ from: f, to: t })}
          />
          <div style={{ height:'160px', width:'100%', marginTop:'0.6rem' }}>
            <Bar data={interviewChartData} options={interviewChartOptions} />
          </div>
          <button className="hr-btn-view" onClick={() => navigate('/hr/candidates')}>
            View all candidates →
          </button>
        </div>
      </div>

      {/* ── Row 4: Interviewer ranking + Quick actions ──────────── */}
      <div className="hr-row2" style={{ marginBottom:'1rem' }}>

        {/* Interviewer leaderboard */}
        <div className="hr-card">
          <div className="hr-card-header">
            <span className="hr-card-title">👥 Interviewer activity</span>
            <span className="hr-tag info">This month</span>
          </div>
          {interviewerRanking.length === 0 ? (
            <div className="hr-empty">No interview activity this month</div>
          ) : (
            interviewerRanking.map((iv, i) => (
              <div className="hr-iv-row" key={i}>
                <div className="hr-iv-avatar">{getInitials(iv.name)}</div>
                <div className="hr-iv-info">
                  <div className="hr-iv-name">{iv.name}</div>
                  <div className="hr-iv-dept">{iv.department}</div>
                </div>
                <div className="hr-mini-bar-track">
                  <div className="hr-mini-bar-fill" style={{ width: `${iv.pct}%` }} />
                </div>
                <div className="hr-iv-count">{iv.count}</div>
              </div>
            ))
          )}
        </div>

        {/* Quick actions */}
        <div className="hr-card">
          <div className="hr-card-header">
            <span className="hr-card-title">⚡ Quick actions</span>
          </div>
          <div className="hr-quick-grid">
            <button className="hr-quick-btn" onClick={() => navigate('/hr/candidates/add')}>
              <span>➕</span> Add candidate
            </button>
            <button className="hr-quick-btn" onClick={() => navigate('/hr/roles')}>
              <span>📝</span> Manage roles
            </button>
            <button className="hr-quick-btn" onClick={() => navigate('/hr/candidates')}>
              <span>👁</span> View candidates
            </button>
            <button className="hr-quick-btn" onClick={() => navigate('/hr/feedback')}>
              <span>📄</span> View feedback
            </button>
            <button className="hr-quick-btn" onClick={() => navigate('/hr/chat')}>
              <span>💬</span> Ask RAG
            </button>
            <button className="hr-quick-btn" onClick={() => navigate('/hr/roles')}>
              <span>📊</span> Roles report
            </button>
          </div>
        </div>
      </div>

      {/* ── Recent activity ─────────────────────────────────────── */}
      <div className="hr-card" style={{ marginBottom:'1.5rem' }}>
        <div className="hr-card-header">
          <span className="hr-card-title">🕐 Recent activity</span>
          <span className="hr-tag">Latest events</span>
        </div>
        <div className="hr-activity-grid">
          {recentActivity.length === 0 ? (
            <div className="hr-empty">No recent activity</div>
          ) : (
            recentActivity.map((a, i) => (
              <div className="hr-activity-row" key={i}>
                <div className="hr-activity-dot" style={{ background: a.color }} />
                <div className="hr-activity-text">{a.text}</div>
                <div className="hr-activity-time">{a.time}</div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}