// App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Login from './pages/auth/Login';
import HrDashboard from './pages/hr/HrDashboard';
import InterviewerDashboard from './pages/interviewer/InterviewerDashboard';
import ProtectedRoute from './components/ProtectedRoute';
import InterviewerLayout from './layouts/InterviewerLayout';
import HrLayout from './layouts/HrLayout';
import ScheduleInterview from './pages/hr/ScheduleInterview';

// Feature Pages
import FitmentScorer from './pages/interviewer/FitmentScorer';
import CompareCandidates from './pages/interviewer/CompareCandidates';
import InterviewPage from './pages/interviewer/InterviewPage';
import RolesPage from './pages/hr/RolesPage';
import ViewCandidates from './pages/hr/ViewCandidates';
import AddCandidate from './pages/hr/AddCandidate';
import FeedbackPage from './pages/hr/FeedbackPage';
import TalentPool from './pages/hr/TalentPool';

// --- RAG COMPONENTS ---
import RagChat from './pages/hr/Rag';
import InterviewerRag from './pages/interviewer/Interviewer_Rag';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />

        {/* ✅ HR ROUTES */}
        <Route
          path="/hr"
          element={
            <ProtectedRoute allowedRole="HR">
              <HrLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard"      element={<HrDashboard />} />
          <Route path="roles"          element={<RolesPage />} />
          <Route path="candidates"     element={<ViewCandidates />} />
          <Route path="candidates/add" element={<AddCandidate />} />
          <Route path="schedule"       element={<ScheduleInterview />} />
          <Route path="chat"           element={<RagChat />} />
          <Route path="feedback"       element={<FeedbackPage />} />
          <Route path="talent-pool"    element={<TalentPool />} />
        </Route>

        {/* ✅ INTERVIEWER ROUTES */}
        <Route
          path="/interviewer/:userId"
          element={
            <ProtectedRoute allowedRole="Interviewer" matchUserId>
              <InterviewerLayout />
            </ProtectedRoute>
          }
        >
          <Route path="dashboard"  element={<InterviewerDashboard />} />
          <Route path="fitment"    element={<FitmentScorer />} />
          <Route path="compare"    element={<CompareCandidates />} />
          <Route path="interviews" element={<InterviewPage />} />
          <Route path="assistant"  element={<InterviewerRag />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;