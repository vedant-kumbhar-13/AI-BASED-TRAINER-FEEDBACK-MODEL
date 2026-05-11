import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './components/auth/Login';
import { Register } from './components/auth/Register';
import { Dashboard } from './pages/Dashboard';
import { ProtectedRoute } from './components/ProtectedRoute';

// AI Interview Pages
import { AIInterviewLanding } from './pages/AIInterviewLanding';
import { ResumeUpload } from './pages/ResumeUpload';
import { ResumeSummary } from './pages/ResumeSummary';
import { InterviewSessionPage } from './pages/InterviewSession';
import { InterviewFeedback } from './pages/InterviewFeedback';
import { InterviewHistory } from './pages/InterviewHistory';
import { LiveInterviewSession } from './pages/LiveInterviewSession';

// Learning Pages
import { Learning } from './pages/Learning';
import { Quiz } from './pages/Quiz';
import { QuizResults } from './pages/QuizResults';
import { AboutUs } from './pages/AboutUs';

function App() {
  return (
    <Router>
      <Routes>
        {/* Auth Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected Routes */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />

        {/* AI Interview Routes */}
        <Route path="/ai-interview" element={
          <ProtectedRoute>
            <AIInterviewLanding />
          </ProtectedRoute>
        } />
        <Route path="/ai-interview-upload" element={
          <ProtectedRoute>
            <ResumeUpload />
          </ProtectedRoute>
        } />
        <Route path="/ai-interview-summary" element={
          <ProtectedRoute>
            <ResumeSummary />
          </ProtectedRoute>
        } />
        <Route path="/ai-interview-session" element={
          <ProtectedRoute>
            <InterviewSessionPage />
          </ProtectedRoute>
        } />
        <Route path="/ai-interview-live" element={
          <ProtectedRoute>
            <LiveInterviewSession />
          </ProtectedRoute>
        } />
        <Route path="/ai-interview-feedback" element={
          <ProtectedRoute>
            <InterviewFeedback />
          </ProtectedRoute>
        } />
        <Route path="/ai-interview-history" element={
          <ProtectedRoute>
            <InterviewHistory />
          </ProtectedRoute>
        } />

        {/* Learning Module Routes */}
        <Route path="/learning" element={
          <ProtectedRoute>
            <Learning />
          </ProtectedRoute>
        } />
        <Route path="/learning/:topicSlug" element={
          <ProtectedRoute>
            <Learning />
          </ProtectedRoute>
        } />
        <Route path="/quiz/:topicId" element={
          <ProtectedRoute>
            <Quiz />
          </ProtectedRoute>
        } />
        <Route path="/quiz-results/:topicId" element={
          <ProtectedRoute>
            <QuizResults />
          </ProtectedRoute>
        } />

        {/* About Us */}
        <Route path="/about" element={
          <ProtectedRoute>
            <AboutUs />
          </ProtectedRoute>
        } />

        {/* Placeholder routes */}
        <Route path="/tests" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/profile" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
