import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navigation } from '../components/dashboard/Navigation';
import { Eye, Play, Trash2, Loader2, Download } from 'lucide-react';
import InterviewAPI from '../services/interviewAPI';
import AuthService from '../services/authService';
import type { InterviewSession } from '../services/interviewAPI';

export const InterviewHistory = () => {
  const navigate = useNavigate();
  const [interviews, setInterviews] = useState<InterviewSession[]>([]);
  const [stats, setStats] = useState({
    totalInterviews: 0,
    averageScore: 0
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
    loadStats();
  }, []);

  const loadHistory = async () => {
    try {
      const result = await InterviewAPI.getHistory({ status: 'completed', page_size: 20 });
      if (result.success && result.results) {
        setInterviews(result.results);
      }
    } catch (err) {
      setError('Failed to load interview history');
    } finally {
      setIsLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const result = await InterviewAPI.getStats();
      if (result.success && result.stats) {
        setStats({
          totalInterviews: result.stats.total_interviews || 0,
          averageScore: result.stats.average_score || 0
        });
      }
    } catch (err) {
      // Silent fail for stats
    }
  };

  const handleViewFeedback = (sessionId: string) => {
    navigate(`/ai-interview-feedback`, { state: { sessionId } });
  };

  const handleDownloadReport = async (sessionId: string) => {
    if (downloadingId) return;
    setDownloadingId(sessionId);
    try {
      const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api').replace(/\/api$/, '');
      const headers = AuthService.getAuthHeaders();
      const res = await fetch(`${API_BASE}/api/interview/report/${sessionId}/`, { headers });
      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `AI_Interview_Report_${sessionId.substring(0, 8)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setError('Failed to download report. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (sessionId: string) => {
    if (confirm('Are you sure you want to delete this interview?')) {
      try {
        const result = await InterviewAPI.deleteSession(sessionId);
        if (result.success) {
          setInterviews(prev => prev.filter(i => i.id !== sessionId));
        } else {
          setError(result.error || 'Failed to delete interview');
        }
      } catch {
        setError('Failed to delete interview. Please try again.');
      }
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getTypeColor = (type: string) => {
    switch(type) {
      case 'HR': return 'bg-blue-500';
      case 'Technical': return 'bg-green-500';
      case 'Behavioral': return 'bg-purple-500';
      default: return 'bg-primary';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Use real data only - no fake demo interviews
  const hasInterviews = interviews.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="pt-16">
        <div className="max-w-5xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-800 mb-2">Interview History</h1>
              <p className="text-gray-500">Track your progress and review past interviews</p>
            </div>
            <button
              onClick={() => navigate('/ai-interview')}
              className="mt-4 md:mt-0 px-6 py-3 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl shadow-button flex items-center gap-2"
            >
              <Play className="w-5 h-5" />
              Start New Interview
            </button>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <span className="text-4xl mb-3 block">📊</span>
              <p className="text-3xl font-bold text-gray-800">
                {stats.averageScore > 0 ? `${Math.round(stats.averageScore)}%` : 'NA'}
              </p>
              <p className="text-sm text-gray-500">Average Score</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
              <span className="text-4xl mb-3 block">🎯</span>
              <p className="text-3xl font-bold text-gray-800">
                {stats.totalInterviews > 0 ? stats.totalInterviews : 'NA'}
              </p>
              <p className="text-sm text-gray-500">Completed Interviews</p>
            </div>
          </div>

          {/* Interview Table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <h2 className="font-bold text-gray-800">All Interviews</h2>
            </div>
            
            {isLoading ? (
              <div className="p-12 text-center">
                <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
                <p className="text-gray-500">Loading interviews...</p>
              </div>
            ) : !hasInterviews ? (
              <div className="p-12 text-center">
                <span className="text-5xl mb-4 block">🎯</span>
                <p className="text-gray-500 mb-2">No interviews yet</p>
                <p className="text-sm text-gray-400">Start your first interview to see your history here</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Questions</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Score</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-bold text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {interviews.map((interview) => (
                      <tr key={interview.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {interview.start_time ? formatDate(interview.start_time) : 'NA'}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${getTypeColor(interview.interview_type)}`}>
                            {interview.interview_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {interview.total_questions} questions
                        </td>
                        <td className="px-6 py-4">
                          {interview.overall_score ? (
                            <div className="flex items-center gap-2">
                              <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full rounded-full ${getScoreColor(interview.overall_score)}`}
                                  style={{ width: `${interview.overall_score}%` }}
                                />
                              </div>
                              <span className="text-sm font-bold text-gray-700">
                                {Math.round(interview.overall_score)}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">NA</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 rounded text-xs ${
                            interview.status === 'completed' 
                              ? 'bg-green-100 text-green-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {interview.status === 'completed' ? 'Completed' : 'In Progress'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleViewFeedback(interview.id)}
                              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-primary"
                              title="View Feedback"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            {interview.status === 'completed' && (
                              <button
                                onClick={() => handleDownloadReport(interview.id)}
                                disabled={downloadingId === interview.id}
                                className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-green-600 disabled:opacity-50"
                                title="Download PDF Report"
                              >
                                {downloadingId === interview.id
                                  ? <Loader2 className="w-4 h-4 animate-spin" />
                                  : <Download className="w-4 h-4" />}
                              </button>
                            )}
                            <button
                              onClick={() => handleDelete(interview.id)}
                              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-red-500"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {error && (
            <p className="text-red-500 text-center mt-4">{error}</p>
          )}
        </div>
      </main>
    </div>
  );
};

export default InterviewHistory;
