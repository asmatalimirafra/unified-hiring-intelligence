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

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const BASE_URL = 'https://unwithering-unattentively-herbert.ngrok-free.dev';
const HEADERS  = { headers: { 'ngrok-skip-browser-warning': 'true' } };

const parseDate = (dt) => {
  if (!dt) return null;
  const raw = (dt && typeof dt === 'object' && dt.$date) ? dt.$date : dt;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
};

const todayStr   = () => new Date().toLocaleDateString('en-CA');
const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString('en-CA');
const monthEnd   = () => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toLocaleDateString('en-CA');

const inRange = (dateStr, from, to) => {
  const d = parseDate(dateStr);
  if (!d) return false;
  const s = d.toLocaleDateString('en-CA');
  return s >= from && s <= to;
};

const getInitials = (name = '') =>
  name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

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

  const [rangeMonth,     setRangeMonth]     = useState({ from: monthStart(), to: monthEnd() });
  const [rangeAvg,       setRangeAvg]       = useState({ from: monthStart(), to: monthEnd() });
  const [rangeToday,     setRangeToday]     = useState({ from: todayStr(),   to: todayStr()  });
  const [rangeBreakdown, setRangeBreakdown] = useState({ from: monthStart(), to: monthEnd() });

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const localUser = JSON.parse(localStorage.getItem('user') || '{}');
        const activeId    = userId || localUser.user_id || localUser.interviewer_id || localUser.id;
        // ── Use the interviewer's email from localStorage ─────────────────
        const activeEmail = localUser.email || '';

        const [interviewersRes, candidatesRes] = await Promise.all([
          axios.get(`${BASE_URL}/get-interviewers/`, HEADERS),
          // ── Fetch only candidates assigned to this interviewer ───────────
          activeEmail
            ? axios.get(`${BASE_URL}/get-interviewer-candidates/${encodeURIComponent(activeEmail)}`, HEADERS)
            : Promise.resolve({ data: [] }),
        ]);

        const candidates = candidatesRes.data || [];
        setAllCandidates(candidates);

        const dbUser   = interviewersRes.data.find(i =>
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

  // Pending = assigned candidates not yet selected or rejected
  const pendingCandidatesList = useMemo(() =>
    allCandidates.filter(c => !c.candidate_selected && !c.candidate_rejected),
    [allCandidates]
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

  const interviewsInRange = useMemo(() =>
    myInterviews.filter(iv => inRange(iv.datetime, rangeMonth.from, rangeMonth.to)).length,
    [myInterviews, rangeMonth]
  );

  const avgScoreInRange = useMemo(() => {
    const filtered = myInterviews.filter(iv =>
      iv.ratings && inRange(iv.datetime, rangeAvg.from, rangeAvg.to)
    );
    if (!filtered.length) return null;
    let sum = 0, cnt = 0;
    filtered.forEach(iv => { Object.values(iv.ratings).forEach(v => { sum += v; cnt++; }); });
    return cnt > 0 ? parseFloat((sum / cnt).toFixed(1)) : null;
  }, [myInterviews, rangeAvg]);

  const todaysInterviewList = useMemo(() =>
    myInterviews
      .filter(iv => inRange(iv.datetime, rangeToday.from, rangeToday.to))
      .sort((a, b) => (parseDate(a.datetime) || 0) - (parseDate(b.datetime) || 0)),
    [myInterviews, rangeToday]
  );

  const scoreBreakdown = useMemo(() => {
    const filtered = myInterviews.filter(iv =>
      iv.ratings && inRange(iv.datetime, rangeBreakdown.from, rangeBreakdown.to)
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
  }, [myInterviews, rangeBreakdown]);


  // ── Chart ─────────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    const days = [];
    const counts = [];
    const start = new Date(rangeMonth.from);
    const end   = new Date(rangeMonth.to);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
      const label = d.toLocaleDateString('en-CA');
      days.push(label);
      counts.push(myInterviews.filter(iv => {
        const dt = parseDate(iv.datetime);
        return dt && dt.toLocaleDateString('en-CA') === label;
      }).length);
    }
    return {
      labels: days,
      datasets: [{
        label: 'Interviews',
        data: counts,
        backgroundColor: '#0055ff44',
        borderColor: '#0055ff',
        borderWidth: 2,
        borderRadius: 6,
      }]
    };
  }, [myInterviews, rangeMonth]);

  const chartOptions = {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
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
    <div className="interviewer-dashboard">
      <div className="dash-header">
        <div>
          <h1 className="dash-title">Welcome back, {name.split(' ')[0]} 👋</h1>
          <p className="dash-sub">Here's your interview activity overview — assigned candidates only.</p>
        </div>
      </div>

      {/* ── Row 1 ──────────────────────────────────────────────── */}
      <div className="dash-row1">
        <div className="dash-card stat-card">
          <div className="stat-icon blue"><i className="bi bi-calendar-check" /></div>
          <div className="stat-body">
            <div className="stat-num">{interviewsToday}</div>
            <div className="stat-lbl">Today's Interviews</div>
          </div>
        </div>
        <div className="dash-card stat-card">
          <div className="stat-icon purple"><i className="bi bi-graph-up" /></div>
          <div className="stat-body">
            <DateRangePicker
              from={rangeMonth.from} to={rangeMonth.to}
              onChange={(f, t) => setRangeMonth({ from: f, to: t })}
            />
            <div className="stat-num">{interviewsInRange}</div>
            <div className="stat-lbl">Interviews in Range</div>
          </div>
        </div>
        <div className="dash-card stat-card">
          <div className="stat-icon green"><i className="bi bi-star-half" /></div>
          <div className="stat-body">
            <DateRangePicker
              from={rangeAvg.from} to={rangeAvg.to}
              onChange={(f, t) => setRangeAvg({ from: f, to: t })}
            />
            <div className="stat-num">{avgScoreInRange ?? '—'}</div>
            <div className="stat-lbl">Avg Score / 5</div>
          </div>
        </div>
        <div className="dash-card stat-card">
          <div className="stat-icon orange"><i className="bi bi-people" /></div>
          <div className="stat-body">
            <div className="stat-num">{allCandidates.length}</div>
            <div className="stat-lbl">Assigned Candidates</div>
          </div>
        </div>
      </div>

      {/* ── Row 2 ──────────────────────────────────────────────── */}
      <div className="dash-row2">
        <div className="dash-card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-clock" /> Today's schedule</span>
          </div>
          <DateRangePicker
            from={rangeToday.from} to={rangeToday.to}
            onChange={(f, t) => setRangeToday({ from: f, to: t })}
          />
          <div className="card-sub" style={{ marginTop: '0.5rem' }}>
            {todaysInterviewList.length} interview{todaysInterviewList.length !== 1 ? 's' : ''} found
          </div>
          {todaysInterviewList.length === 0 ? (
            <div className="empty-state">
              <i className="bi bi-calendar-x" />
              <p>No interviews in this date range</p>
            </div>
          ) : (
            todaysInterviewList.map((iv, idx) => (
              <div className="cand-row" key={idx}>
                <div className="avatar">{getInitials(iv.candidateName)}</div>
                <div className="cand-info">
                  <div className="cand-name">{iv.candidateName}</div>
                  <div className="cand-meta">
                    {iv.candidateRole} ·{' '}
                    {iv.datetime
                      ? parseDate(iv.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
          <div className="card-sub">Your assigned candidates with pending interviews</div>

          {pendingFeedbackList.length === 0 ? (
            <div className="empty-state success">
              <i className="bi bi-check2-all" />
              <p>All caught up! No pending candidates</p>
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
          </div>
          <DateRangePicker
            from={rangeBreakdown.from} to={rangeBreakdown.to}
            onChange={(f, t) => setRangeBreakdown({ from: f, to: t })}
          />
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
            Range: {rangeMonth.from} → {rangeMonth.to}
          </div>
          <Bar data={chartData} options={chartOptions} />
        </div>

        <div className="dash-card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-clock-history" /> Recent activity</span>
          </div>
          {myInterviews.length === 0 ? (
            <div className="empty-state"><i className="bi bi-inbox" /><p>No activity found</p></div>
          ) : (
            [...myInterviews]
              .filter(iv => iv.datetime)
              .sort((a, b) => (parseDate(b.datetime) || 0) - (parseDate(a.datetime) || 0))
              .slice(0, 6)
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

export default InterviewerDashboard;