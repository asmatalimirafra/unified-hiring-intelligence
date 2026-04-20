// // App.js
// import React from 'react';
// import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

// import Login from './pages/auth/Login';
// import HrDashboard from './pages/hr/HrDashboard';
// import InterviewerDashboard from './pages/interviewer/InterviewerDashboard';
// import ProtectedRoute from './components/ProtectedRoute';
// import InterviewerLayout from './layouts/InterviewerLayout';
// import HrLayout from './layouts/HrLayout';

// // Feature Pages
// import FitmentScorer from './pages/interviewer/FitmentScorer';
// import CompareCandidates from './pages/interviewer/CompareCandidates';
// import InterviewPage from './pages/interviewer/InterviewPage';
// import RolesPage from './pages/hr/RolesPage';
// import ViewCandidates from './pages/hr/ViewCandidates';
// import AddCandidate from './pages/hr/AddCandidate';     // ⬅️ NEW
// import FeedbackPage from './pages/hr/FeedbackPage';     // ⬅️ NEW

// import RagChat from './pages/hr/Rag'; // ⬅️ 1. IMPORT YOUR NEW CHAT COMPONENT
// import InterviewerRag from './pages/interviewer/Interviewer_Rag';

// function App() {
//   return (
//     <Router>
//       <Routes>
//         <Route path="/" element={<Login />} />

//         {/* ✅ HR ROUTES */}
//         <Route
//           path="/hr"
//           element={
//             <ProtectedRoute allowedRole="HR">
//               <HrLayout />
//             </ProtectedRoute>
//           }
//         >
//           <Route path="dashboard" element={<HrDashboard />} />
//           <Route path="roles" element={<RolesPage />} />
//           <Route path="candidates" element={<ViewCandidates />} />
//           <Route path="candidates/add" element={<AddCandidate />} />   {/* NEW */}
//           <Route path="feedback" element={<FeedbackPage />} />        {/* NEW */}
//           #RAG
//           <Route path="chat" element={<RagChat />} />
//         </Route>

//         {/* ✅ INTERVIEWER ROUTES */}
//         <Route
//           path="/interviewer/:userId"
//           element={
//             <ProtectedRoute allowedRole="Interviewer" matchUserId>
//               <InterviewerLayout />
//             </ProtectedRoute>
//           }
//         >
//           <Route path="dashboard" element={<InterviewerDashboard />} />
//           <Route path="fitment" element={<FitmentScorer />} />
//           <Route path="compare" element={<CompareCandidates />} />
//           <Route path="interviews" element={<InterviewPage />} />
//         </Route>
//       </Routes>
//     </Router>
//   );
// }

// export default App;


// App.js
import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import Login from './pages/auth/Login';
import HrDashboard from './pages/hr/HrDashboard';
import InterviewerDashboard from './pages/interviewer/InterviewerDashboard';
import ProtectedRoute from './components/ProtectedRoute';
import InterviewerLayout from './layouts/InterviewerLayout';
import HrLayout from './layouts/HrLayout';
import ScheduleInterview from './pages/hr/ScheduleInterview'; // ⬅️ NEW IMPORT

// Feature Pages
import FitmentScorer from './pages/interviewer/FitmentScorer';
import CompareCandidates from './pages/interviewer/CompareCandidates';
import InterviewPage from './pages/interviewer/InterviewPage';
import RolesPage from './pages/hr/RolesPage';
import ViewCandidates from './pages/hr/ViewCandidates';
import AddCandidate from './pages/hr/AddCandidate';     
import FeedbackPage from './pages/hr/FeedbackPage';     

// --- RAG COMPONENTS ---
import RagChat from './pages/hr/Rag'; 
// ✅ 1. IMPORT INTERVIEWER VERSION WITH A UNIQUE NAME
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
          <Route path="dashboard" element={<HrDashboard />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="schedule" element={<ScheduleInterview />} /> {/* ⬅️ NEW ROUTE */}
          <Route path="candidates" element={<ViewCandidates />} />
          <Route path="candidates/add" element={<AddCandidate />} />   
          <Route path="feedback" element={<FeedbackPage />} />        
          {/* ✅ HR Chat Route */}
          <Route path="chat" element={<RagChat />} />
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
          <Route path="dashboard" element={<InterviewerDashboard />} />
          <Route path="fitment" element={<FitmentScorer />} />
          <Route path="compare" element={<CompareCandidates />} />
          <Route path="interviews" element={<InterviewPage />} />
          
          {/* ✅ 2. ADD INTERVIEWER CHAT ROUTE HERE */}
          <Route path="assistant" element={<InterviewerRag />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;