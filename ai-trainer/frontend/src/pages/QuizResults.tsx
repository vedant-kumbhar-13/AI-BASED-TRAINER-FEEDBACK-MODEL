import { useParams, useLocation, Link } from 'react-router-dom';
import { Navigation } from '../components/dashboard/Navigation';
import { QuestionCard } from '../components/quiz';
import { getTopicById, getQuestionsByTopicId } from '../data/aptitudeData';

interface QuizResultsState {
  answers: Record<number, string>;
  score: number;
  correctCount: number;
  totalQuestions: number;
  quizQuestionIds: number[];
  questions?: any[];        // full question objects passed from Quiz.tsx
  apiResults?: {            // per-question results from backend submit
    questionId: number;
    selectedAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
  }[];
}

export const QuizResults = () => {
  const { topicId } = useParams();
  const location = useLocation();
  const state = location.state as QuizResultsState | null;

  const topic = topicId ? getTopicById(parseInt(topicId)) : null;

  // Prefer questions passed via state (includes API questions with options)
  // Fall back to static local data for older navigation paths
  const staticQuestions = topicId ? getQuestionsByTopicId(parseInt(topicId)) : [];
  const passedQuestions: any[] = state?.questions || [];

  // Merge: if we have API results, patch correctAnswer onto each question
  const apiResultMap = Object.fromEntries(
    (state?.apiResults || []).map(r => [r.questionId, r])
  );

  // Build final question list to display
  const rawQuestions = passedQuestions.length > 0 ? passedQuestions : (
    state?.quizQuestionIds
      ? staticQuestions.filter(q => state.quizQuestionIds.includes(q.id))
      : staticQuestions
  );

  // Patch in correctAnswer from API results where available
  const questions = rawQuestions.map(q => {
    const apiR = apiResultMap[q.id];
    return apiR ? { ...q, correctAnswer: apiR.correctAnswer } : q;
  });

  if (!topic || !state) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="pt-16 flex items-center justify-center h-[calc(100vh-4rem)]">
          <div className="text-center">
            <span className="text-6xl mb-4 block">❓</span>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">No Results Found</h2>
            <p className="text-gray-500 mb-6">Please complete a quiz first to see results.</p>
            <Link
              to="/learning"
              className="px-6 py-3 bg-primary hover:bg-primary-dark text-white font-bold rounded-lg transition"
            >
              Back to Learning
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { answers, score, correctCount, totalQuestions } = state;

  const getPerformanceMessage = (score: number) => {
    if (score >= 90) return { emoji: '🏆', text: 'Excellent!', color: 'text-green-600' };
    if (score >= 70) return { emoji: '🎉', text: 'Great job!', color: 'text-green-600' };
    if (score >= 50) return { emoji: '👍', text: 'Good effort!', color: 'text-yellow-600' };
    return { emoji: '📚', text: 'Keep practicing!', color: 'text-red-600' };
  };

  const performance = getPerformanceMessage(score);

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 70) return 'from-green-50 to-white border-green-200';
    if (score >= 50) return 'from-yellow-50 to-white border-yellow-200';
    return 'from-red-50 to-white border-red-200';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <div className="pt-16">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Results Header */}
          <div className={`bg-gradient-to-r ${getScoreBgColor(score)} rounded-xl border-2 p-8 mb-6 text-center`}>
            <span className="text-6xl block mb-4">{performance.emoji}</span>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">Quiz Completed!</h1>
            <p className={`text-xl font-bold ${performance.color}`}>{performance.text}</p>
            
            {/* Score Circle */}
            <div className="my-8">
              <div className="relative inline-flex items-center justify-center">
                <svg className="w-40 h-40 transform -rotate-90">
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="transparent"
                    className="text-gray-200"
                  />
                  <circle
                    cx="80"
                    cy="80"
                    r="70"
                    stroke="currentColor"
                    strokeWidth="12"
                    fill="transparent"
                    strokeDasharray={440}
                    strokeDashoffset={440 - (440 * score) / 100}
                    strokeLinecap="round"
                    className={getScoreColor(score)}
                  />
                </svg>
                <div className="absolute">
                  <span className={`text-4xl font-bold ${getScoreColor(score)}`}>{score}%</span>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <p className="text-2xl font-bold text-gray-800">{correctCount}</p>
                <p className="text-xs text-gray-500">Correct</p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <p className="text-2xl font-bold text-gray-800">{totalQuestions - correctCount}</p>
                <p className="text-xs text-gray-500">Incorrect</p>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <p className="text-2xl font-bold text-gray-800">{totalQuestions}</p>
                <p className="text-xs text-gray-500">Total</p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <Link
              to={`/quiz/${topicId}`}
              className="flex-1 px-6 py-3 bg-primary hover:bg-primary-dark text-white font-bold text-center rounded-lg transition"
            >
              🔄 Retake Quiz
            </Link>
            <Link
              to={`/learning/${topicId}`}
              className="flex-1 px-6 py-3 border-2 border-primary text-primary hover:bg-primary-light font-bold text-center rounded-lg transition"
            >
              📖 Review Topic
            </Link>
            <Link
              to="/learning"
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 hover:bg-gray-50 font-bold text-center rounded-lg transition"
            >
              📚 All Topics
            </Link>
          </div>

          {/* Question Review */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <h2 className="text-xl font-bold text-gray-800 mb-6">Question Review</h2>
            
            <div className="space-y-6">
              {questions.map((question, index) => (
                <div key={question.id}>
                  <QuestionCard
                    question={question}
                    questionNumber={index + 1}
                    totalQuestions={questions.length}
                    selectedAnswer={answers[question.id] || null}
                    onAnswerSelect={() => {}}
                    showResult={true}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="mt-8 bg-gradient-to-r from-primary-light to-white rounded-xl border-2 border-primary p-6 text-center">
            <span className="text-4xl block mb-2">🚀</span>
            <h3 className="text-lg font-bold text-gray-800 mb-2">Ready for more?</h3>
            <p className="text-sm text-gray-500 mb-4">Try another topic to expand your knowledge!</p>
            <Link
              to="/learning"
              className="inline-block px-8 py-3 bg-primary hover:bg-primary-dark text-white font-bold rounded-lg transition"
            >
              Explore More Topics →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
