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

const todayStr = () => new Date().toLocaleDateString('en-CA');
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA');
};
const monthEnd = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toLocaleDateString('en-CA');
};
const inRange = (dateStr, from, to) => {
  if (!dateStr) return false;
  const d = new Date(dateStr).toLocaleDateString('en-CA');
  return d >= from && d <= to;
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
  const [rangeVerdicts,  setRangeVerdicts]  = useState({ from: monthStart(), to: monthEnd() });

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const localUser = JSON.parse(localStorage.getItem('user') || '{}');
        const activeId  = userId || localUser.user_id || localUser.interviewer_id || localUser.id;

        const [interviewersRes, candidatesRes] = await Promise.all([
          axios.get(`${BASE_URL}/get-interviewers/`, HEADERS),
          axios.get(`${BASE_URL}/get-candidates/`,   HEADERS),
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

  /* all MY interviews flattened from candidates */
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
    return myInterviews.filter(iv =>
      iv.datetime && new Date(iv.datetime).toLocaleDateString('en-CA') === t
    ).length;
  }, [myInterviews]);

  // Pending = candidates where interview_completed is NOT true (matches InterviewPage logic exactly)
  const pendingCandidatesList = useMemo(() =>
    allCandidates.filter(c => !(c.interview_completed === true)),
    [allCandidates]
  );
  const pendingFeedbackCount = pendingCandidatesList.length;

  // For the row-2 card: show each pending candidate's name + role
  const pendingFeedbackList = useMemo(() =>
    pendingCandidatesList.slice(0, 8).map(c => ({
      candidateName: c.name,
      candidateRole: c.applied_role || '—',
      candidateId:   c.candidate_id,
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
      .sort((a, b) => new Date(a.datetime) - new Date(b.datetime)),
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

  const verdicts = useMemo(() => {
    const counts = { strongHire: 0, hire: 0, weakHire: 0, noHire: 0 };
    allCandidates.forEach(c => {
      // Only count candidates in the Completed section (interview_completed === true)
      if (c.interview_completed !== true) return;
      const wasMe = (c.interviews || []).some(iv =>
        String(iv.interviewer_id) === myId &&
        inRange(iv.datetime, rangeVerdicts.from, rangeVerdicts.to)
      );
      if (!wasMe) return;
      const v = c.interview_aggregate?.verdict;
      if      (v === 'Strong Hire') counts.strongHire++;
      else if (v === 'Hire')        counts.hire++;
      else if (v === 'Weak Hire')   counts.weakHire++;
      else if (v === 'No Hire')     counts.noHire++;
    });
    return counts;
  }, [allCandidates, myId, rangeVerdicts]);

  const weeklyData = useMemo(() => {
    const counts = [0, 0, 0, 0];
    myInterviews
      .filter(iv => inRange(iv.datetime, rangeMonth.from, rangeMonth.to))
      .forEach(iv => {
        const day = new Date(iv.datetime).getDate();
        counts[Math.min(Math.floor((day - 1) / 7), 3)]++;
      });
    return counts;
  }, [myInterviews, rangeMonth]);

  const currentWeekIndex = Math.min(Math.floor((new Date().getDate() - 1) / 7), 3);
  const chartColors = weeklyData.map((_, i) => i === currentWeekIndex ? '#0055ff' : '#93b8ff');
  const lastWeek = currentWeekIndex - 1;
  const percentGrowth = lastWeek >= 0 && weeklyData[lastWeek] > 0
    ? Math.round(((weeklyData[currentWeekIndex] - weeklyData[lastWeek]) / weeklyData[lastWeek]) * 100)
    : 0;

  const chartData = {
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
    datasets: [{
      label: 'Interviews',
      data: weeklyData,
      backgroundColor: chartColors,
      borderRadius: 8,
      barThickness: 36,
    }],
  };
  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => ` ${ctx.raw} interviews` } },
    },
    scales: {
      y: { beginAtZero: true, ticks: { stepSize: 1, color: '#666' }, grid: { color: '#f0f0f0' } },
      x: { ticks: { color: '#666' }, grid: { display: false } },
    },
  };

  const ScoreBar = ({ label, value, color }) => (
    <div className="score-bar-row">
      <span className="score-bar-label">{label}</span>
      <div className="score-bar-track">
        <div className="score-bar-fill" style={{ width: `${(value / 5) * 100}%`, background: color }} />
      </div>
      <span className="score-bar-val">{value > 0 ? value.toFixed(1) : '—'}</span>
    </div>
  );

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  if (loading) {
    return (
      <div className="dash-loading">
        <div className="dash-spinner" />
        <p>Loading dashboard…</p>
      </div>
    );
  }

  return (
    <div className="interviewer-dashboard">

      <div className="dash-header">
        <div>
          <h2 className="dash-welcome">
            👋 Welcome back,{' '}
            <span className="dash-username">{interviewerData?.name || 'Interviewer'}</span>
          </h2>
          <p className="dash-date">{dateLabel}</p>
        </div>
        {pendingFeedbackCount > 0 && (
          <div className="feedback-alert"
            onClick={() => navigate(`/interviewer/${userId}/interviews`)}>
            ⚠️ {pendingFeedbackCount} candidate{pendingFeedbackCount > 1 ? 's' : ''} pending interview completion
          </div>
        )}
      </div>

      {/* ── Stat cards ─────────────────────────────────────────── */}
      <div className="stat-grid">

        <div className="stat-card" style={{ '--accent': '#0055ff' }}>
          <div className="stat-icon" style={{ background: '#e6eeff' }}>
            <i className="bi bi-check2-circle" style={{ color: '#0055ff' }} />
          </div>
          <div className="stat-val">{interviewsToday}</div>
          <div className="stat-lbl">Interviews today</div>
          <div className="stat-sub">Fixed to today</div>
        </div>

        <div className="stat-card" style={{ '--accent': '#f5b800' }}>
          <div className="stat-icon" style={{ background: '#fff8d6' }}>
            <i className="bi bi-hourglass-split" style={{ color: '#c49200' }} />
          </div>
          <div className="stat-val">{pendingFeedbackCount}</div>
          <div className="stat-lbl">Pending candidates</div>
          <div className="stat-sub">interview_completed ≠ true</div>
        </div>

        <div className="stat-card stat-card-tall" style={{ '--accent': '#00b894' }}>
          <div className="stat-icon" style={{ background: '#e0f7f2' }}>
            <i className="bi bi-bar-chart-line" style={{ color: '#00b894' }} />
          </div>
          <div className="stat-val">{interviewsInRange}</div>
          <div className="stat-lbl">Interviews in range</div>
          <DateRangePicker
            from={rangeMonth.from} to={rangeMonth.to}
            onChange={(f, t) => setRangeMonth({ from: f, to: t })}
          />
        </div>

        <div className="stat-card stat-card-tall" style={{ '--accent': '#7c6ff7' }}>
          <div className="stat-icon" style={{ background: '#eeecff' }}>
            <i className="bi bi-star-half" style={{ color: '#7c6ff7' }} />
          </div>
          <div className="stat-val">{avgScoreInRange !== null ? avgScoreInRange : '—'}</div>
          <div className="stat-lbl">Avg score given</div>
          <DateRangePicker
            from={rangeAvg.from} to={rangeAvg.to}
            onChange={(f, t) => setRangeAvg({ from: f, to: t })}
          />
        </div>
      </div>

      {/* ── Row 2 ──────────────────────────────────────────────── */}
      <div className="dash-row2">

        <div className="dash-card">
          <div className="card-header">
            <span className="card-title">
              <i className="bi bi-calendar2-check" /> Interviews
            </span>
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
                      ? new Date(iv.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
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
          <div className="card-sub">Candidates not yet completed — across all roles</div>

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
                  <div className="cand-meta">{c.candidateRole} · {c.roundsPending}</div>
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
            <span className="card-title"><i className="bi bi-clipboard2-check" /> Verdicts <span style={{fontSize:'0.68rem',color:'#00b894',fontWeight:600}}>completed only</span></span>
          </div>
          <DateRangePicker
            from={rangeVerdicts.from} to={rangeVerdicts.to}
            onChange={(f, t) => setRangeVerdicts({ from: f, to: t })}
          />
          <div className="verdict-grid" style={{ marginTop: '0.8rem' }}>
            <div className="verdict-box strong-hire">
              <div className="verdict-num">{verdicts.strongHire}</div>
              <div className="verdict-lbl">Strong Hire</div>
            </div>
            <div className="verdict-box hire">
              <div className="verdict-num">{verdicts.hire}</div>
              <div className="verdict-lbl">Hire</div>
            </div>
            <div className="verdict-box weak-hire">
              <div className="verdict-num">{verdicts.weakHire}</div>
              <div className="verdict-lbl">Weak Hire</div>
            </div>
            <div className="verdict-box no-hire">
              <div className="verdict-num">{verdicts.noHire}</div>
              <div className="verdict-lbl">No Hire</div>
            </div>
          </div>
        </div>

        {/* Quick actions — all routes include userId */}
        <div className="dash-card">
          <div className="card-header">
            <span className="card-title"><i className="bi bi-lightning-charge" /> Quick actions</span>
          </div>
          <div className="quick-grid">
            <button className="quick-btn"
              onClick={() => navigate(`/interviewer/${userId}/interviews`)}>
              <i className="bi bi-pencil" /><span>Submit feedback</span>
            </button>
            <button className="quick-btn"
              onClick={() => navigate(`/interviewer/${userId}/fitment`)}>
              <i className="bi bi-graph-up-arrow" /><span>Score fitment</span>
            </button>
            <button className="quick-btn"
              onClick={() => navigate(`/interviewer/${userId}/compare`)}>
              <i className="bi bi-people" /><span>Compare candidates</span>
            </button>
            <button className="quick-btn"
              onClick={() => navigate(`/interviewer/${userId}/assistant`)}>
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
              .sort((a, b) => new Date(b.datetime) - new Date(a.datetime))
              .slice(0, 6)
              .map((iv, idx) => {
                const daysAgo = Math.floor((Date.now() - new Date(iv.datetime)) / 86400000);
                const timeLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo}d ago`;
                return (
                  <div className="activity-row" key={idx}>
                    <div className="activity-dot" />
                    <div className="activity-info">
                      <div className="activity-text">
                        Interviewed {iv.candidateName} — Round {iv.round}
                      </div>
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