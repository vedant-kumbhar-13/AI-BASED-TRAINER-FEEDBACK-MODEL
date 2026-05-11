import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import InterviewAPI from '../../../services/interviewAPI';
import AuthService from '../../../services/authService';
import { TOPICS, getAllProgress } from '../../../data/aptitudeData';

// Types for interview data
interface InterviewStats {
  total_interviews: number;
  average_score: number;
  best_score: number;
  improvement: number;
  by_type: Record<string, { count: number; average_score: number }>;
}

interface ChartDataPoint {
  date: string;
  score: number;
  type: string;
}

// Category info for grouping topics in dashboard
const CATEGORY_INFO: Record<string, { label: string; icon: string; color: string }> = {
  quantitative:        { label: 'Quantitative',       icon: '🔢', color: 'text-blue-600' },
  data_interpretation: { label: 'Data Interpretation', icon: '📊', color: 'text-purple-600' },
  logical_reasoning:   { label: 'Logical Reasoning',   icon: '🧠', color: 'text-green-600' },
};

export const DashboardHome = () => {
  const [username, setUsername] = useState<string>('User');
  const [stats, setStats] = useState<InterviewStats | null>(null);
  const [allChartData, setAllChartData] = useState<ChartDataPoint[]>([]);
  const [chartView, setChartView] = useState<'recent' | 'all'>('recent');

  useEffect(() => {
    // Get username from AuthService
    const user = AuthService.getUser();
    if (user) {
      const displayName = user.first_name || user.username || user.email?.split('@')[0] || 'User';
      setUsername(displayName);
    }

    // Fetch interview stats and full history
    const fetchData = async () => {
      try {
        const statsResult = await InterviewAPI.getStats();
        if (statsResult.success && statsResult.stats) {
          setStats(statsResult.stats);
        }

        // Fetch up to 100 to cover all-time view
        const historyResult = await InterviewAPI.getHistory({ page_size: 100, status: 'completed' });
        if (historyResult.success && historyResult.results) {
          const transformedData: ChartDataPoint[] = historyResult.results
            .filter((item: any) => item.overall_score !== null)
            .reverse()
            .map((item: any) => {
              const d = new Date(item.created_at);
              return {
                date: `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`,
                score: Math.round(item.overall_score || 0),
                type: item.interview_type
              };
            });
          setAllChartData(transformedData);
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      }
    };

    fetchData();
  }, []);

  // Derive displayed data from toggle
  const chartData = chartView === 'recent' ? allChartData.slice(-12) : allChartData;

  // Calculate chart metrics
  const hasInterviewData = chartData.length > 0;
  const highestScore = stats?.best_score ? Math.round(stats.best_score) : (hasInterviewData ? Math.max(...chartData.map((d) => d.score)) : 0);
  const lowestScore = hasInterviewData ? Math.min(...chartData.map((d) => d.score)) : 0;
  const averageScore = stats?.average_score ? Math.round(stats.average_score) : 0;

  return (
    <div className="space-y-8">
      {/* Section 1: Welcome */}
      <div>
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome back, {username}! 👋</h1>
        <p className="text-sm text-gray-400">Continue your learning journey</p>
      </div>

      {/* Section 2: Stat Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard 
          icon={<ClockIcon />} 
          value={stats?.total_interviews?.toString() || 'NA'} 
          label="Total Interviews" 
          color="text-primary" 
        />
        <StatCard 
          icon={<TrophyIcon />} 
          value={stats?.best_score ? `${Math.round(stats.best_score)}%` : 'NA'} 
          label="Best Score" 
          color="text-success" 
        />
        <StatCard 
          icon={<BookIcon />} 
          value={stats?.average_score ? `${Math.round(stats.average_score)}%` : 'NA'} 
          label="Average Score" 
          color="text-warning" 
        />
      </div>

      {/* Section 3: Interview Performance & Analytics */}
      <div className="pt-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-1">Interview Performance & Analytics</h2>
          <p className="text-xs text-gray-400">Track your improvement over time</p>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Chart Card */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-card">
            <div className="mb-4 pb-4 border-b border-gray-200 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-1">Your Interview Score Trend</h3>
                <p className="text-xs text-gray-400">
                  {hasInterviewData
                    ? chartView === 'recent'
                      ? `Last ${chartData.length} attempts`
                      : `All ${chartData.length} attempts`
                    : 'No interview data yet'}
                </p>
              </div>
              {/* Toggle pill */}
              {allChartData.length > 0 && (
                <div className="flex items-center bg-gray-100 rounded-full p-1 shrink-0">
                  <button
                    id="chart-toggle-recent"
                    onClick={() => setChartView('recent')}
                    className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${
                      chartView === 'recent'
                        ? 'bg-white text-primary shadow-sm'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    Last 12
                  </button>
                  <button
                    id="chart-toggle-all"
                    onClick={() => setChartView('all')}
                    className={`px-3 py-1 text-xs font-semibold rounded-full transition-all ${
                      chartView === 'all'
                        ? 'bg-white text-primary shadow-sm'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    All Time
                  </button>
                </div>
              )}
            </div>

            <div className="h-72">
              {hasInterviewData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F5" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: '#666666' }}
                      tickLine={{ stroke: '#E0E0E0' }}
                      axisLine={{ stroke: '#E0E0E0' }}
                    />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      tick={{ fontSize: 10, fill: '#666666' }}
                      tickLine={{ stroke: '#E0E0E0' }}
                      axisLine={{ stroke: '#E0E0E0' }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine
                      y={averageScore}
                      stroke="#CCCCCC"
                      strokeDasharray="4 3"
                      label={{ value: `Avg: ${averageScore}`, position: 'right', fontSize: 10, fill: '#999999' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="score"
                      stroke="#E63E29"
                      strokeWidth={3}
                      dot={{ fill: '#E63E29', stroke: 'white', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-gray-400">
                  <span className="text-4xl mb-4">📊</span>
                  <p className="text-sm font-medium">No interview data yet</p>
                  <p className="text-xs mt-1">Complete your first interview to see your progress</p>
                </div>
              )}
            </div>

            {/* Chart Summary */}
            <div className="mt-6 pt-4 border-t border-gray-200 grid grid-cols-3">
              <div className="text-center">
                <span className="text-base">⬆️</span>
                <p className="text-xs text-gray-400">Highest Score</p>
                <p className="text-sm font-bold text-gray-800">{hasInterviewData ? highestScore : 'NA'}</p>
              </div>
              <div className="text-center border-x border-gray-200 px-4">
                <span className="text-base">⬇️</span>
                <p className="text-xs text-gray-400">Lowest Score</p>
                <p className="text-sm font-bold text-gray-800">{hasInterviewData ? lowestScore : 'NA'}</p>
              </div>
              <div className="text-center">
                <span className="text-base">📊</span>
                <p className="text-xs text-gray-400">Current Avg</p>
                <p className="text-sm font-bold text-gray-800">{hasInterviewData ? averageScore : 'NA'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* CTA Card */}
        <div className="mt-6 bg-gradient-to-r from-gray-50 to-white border border-gray-200 rounded-lg p-6 shadow-card">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-4">
            <div className="flex-1">
              <span className="text-3xl">🎓</span>
              <h3 className="text-lg font-bold text-gray-800 mb-1">Ready for more interviews?</h3>
              <p className="text-sm text-gray-400">
                {stats?.total_interviews 
                  ? `You've completed ${stats.total_interviews} interviews. Keep practicing to improve your score!`
                  : 'Start your first AI interview to practice and improve your skills!'}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link
                to="/ai-interview"
                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-bold text-sm rounded-lg shadow-button whitespace-nowrap transition"
              >
                🎙️ Start Interview
              </Link>
              <Link
                to="/ai-interview-history"
                className="px-6 py-3 border-2 border-primary text-primary font-bold text-sm rounded-lg hover:bg-primary-light whitespace-nowrap transition"
              >
                View interview history
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Section 4: Aptitude Learning Progress — REAL DATA */}
      <AptitudePerformanceSection />

      {/* Section 5: AI Interview Banner */}
      <div className="mt-12 bg-gradient-to-br from-primary-light to-white border-2 border-primary rounded-xl p-8">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="flex-1">
            <span className="text-5xl mb-2 block">🤖</span>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Practice with AI Interview</h2>
            <p className="text-sm text-gray-400 mb-6">
              Get personalized interview practice with real-time AI feedback. Upload your resume or start a quick session.
            </p>
            <Link
              to="/ai-interview"
              className="inline-block px-8 py-3 bg-primary hover:bg-primary-dark text-white font-bold text-sm rounded-lg shadow-button transition"
            >
              Start AI Interview
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════
// Aptitude Performance Section — uses REAL topic data
// ═══════════════════════════════════════════════════════════
const AptitudePerformanceSection = () => {
  const progress = getAllProgress();
  const quizTopics = TOPICS.filter(t => t.hasQuiz);
  const totalTopics = quizTopics.length;
  const completedTopics = quizTopics.filter(t => progress[t.id]?.completed).length;

  // Calculate overall stats from real progress
  const scores = quizTopics
    .filter(t => progress[t.id]?.completed)
    .map(t => progress[t.id].bestScore);
  const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
  const bestScore = scores.length > 0 ? Math.max(...scores) : 0;
  const totalAttempts = quizTopics.reduce((sum, t) => sum + (progress[t.id]?.attempts || 0), 0);



  return (
    <div className="pt-8">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">Aptitude Learning Progress</h2>
        <p className="text-xs text-gray-400">Track your quiz performance across {totalTopics} topics • 3 categories</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-primary">{completedTopics}/{totalTopics}</p>
          <p className="text-xs text-gray-400">Topics Completed</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{bestScore > 0 ? `${bestScore}%` : 'NA'}</p>
          <p className="text-xs text-gray-400">Best Score</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-yellow-600">{avgScore > 0 ? `${avgScore}%` : 'NA'}</p>
          <p className="text-xs text-gray-400">Average Score</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-gray-800">{totalAttempts > 0 ? totalAttempts : 'NA'}</p>
          <p className="text-xs text-gray-400">Total Attempts</p>
        </div>
      </div>


    </div>
  );
};

// Custom Tooltip Component
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-white px-4 py-2 border border-gray-200 rounded-lg shadow-lg">
        <p className="text-xs font-bold text-gray-800">{data.date}</p>
        <p className="text-xs text-primary">Score: {data.score}/100</p>
        <p className="text-xs text-gray-400">{data.type} Interview</p>
      </div>
    );
  }
  return null;
};

// Stat Card Component
const StatCard = ({
  icon,
  value,
  label,
  color,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  color: string;
}) => (
  <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-card-hover transition-all">
    <div className={`mb-4 ${color}`}>{icon}</div>
    <p className="text-3xl font-bold text-gray-800 mb-1">{value}</p>
    <p className="text-sm text-gray-400">{label}</p>
  </div>
);

// Icons
const ClockIcon = () => (
  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const BookIcon = () => (
  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
  </svg>
);

const TrophyIcon = () => (
  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m3.044 0a6.726 6.726 0 002.749-1.35m0 0a6.772 6.772 0 01-3.044 6.194m-5.253 0a6.776 6.776 0 01-3.044-6.194" />
  </svg>
);
