import { useNavigate } from 'react-router-dom';
import type { Topic } from '../../types/learning';
import { VideoPlayer } from './VideoPlayer';
import { getProgress } from '../../data/aptitudeData';

interface TopicContentProps {
  topic: Topic;
}

export const TopicContent = ({ topic }: TopicContentProps) => {
  const navigate = useNavigate();
  const progress = getProgress(topic.id);


  const levelColors: Record<string, string> = {
    Beginner: 'bg-green-100 text-green-700 border-green-200',
    Intermediate: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    Advanced: 'bg-orange-100 text-orange-700 border-orange-200',
    Hard: 'bg-red-100 text-red-700 border-red-200'
  };

  const handleStartQuiz = () => {
    navigate(`/quiz/${topic.id}`);
  };

  // Parse description to handle markdown-like formatting
  const renderDescription = (text: string) => {
    const sections = text.split('\n\n');
    return sections.map((section, idx) => {
      if (section.startsWith('###')) {
        return (
          <h3 key={idx} className="text-xl font-bold text-gray-800 mb-4 mt-6">
            {section.replace('###', '').trim()}
          </h3>
        );
      }
      if (section.startsWith('**')) {
        const lines = section.split('\n');
        return (
          <div key={idx} className="mb-4">
            {lines.map((line, lineIdx) => {
              if (line.startsWith('**') && line.includes(':')) {
                const [title, ...rest] = line.split(':');
                return (
                  <p key={lineIdx} className="mb-2">
                    <strong className="text-gray-800">{title.replace(/\*\*/g, '')}:</strong>
                    <span className="text-gray-600">{rest.join(':')}</span>
                  </p>
                );
              }
              if (line.startsWith('-')) {
                return (
                  <li key={lineIdx} className="ml-4 text-gray-600 list-disc">
                    {line.replace('-', '').trim()}
                  </li>
                );
              }
              return <p key={lineIdx} className="text-gray-600 mb-2">{line}</p>;
            })}
          </div>
        );
      }
      return <p key={idx} className="text-gray-600 mb-4 leading-relaxed">{section}</p>;
    });
  };

  return (
    <div className="flex-1 min-w-0">
      <div className="max-w-4xl mx-auto">
        {/* Topic Header */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              <span className="text-5xl">{topic.icon}</span>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">{topic.name}</h1>
                <div className="flex items-center gap-3 mt-2">
                  <span className={`px-3 py-1 text-xs font-bold rounded-full border ${levelColors[topic.level]}`}>
                    {topic.level}
                  </span>
                  <span className="text-sm text-gray-400">
                    ⏱️ ~10 min read
                  </span>
                </div>
              </div>
            </div>
            
            {progress && (
              <div className="text-right">
                <span className="text-green-600 text-sm font-medium">✓ Completed</span>
                <p className="text-xs text-gray-400 mt-1">
                  Best: {progress.bestScore}% • {progress.attempts} attempt{progress.attempts !== 1 ? 's' : ''}
                </p>
              </div>
            )}
          </div>

          {/* Definition Card */}
          <div className="bg-gradient-to-r from-primary-light to-white rounded-lg p-4 border-l-4 border-primary">
            <p className="text-sm font-medium text-gray-400 mb-1">📖 Definition</p>
            <p className="text-gray-800 font-medium">{topic.definition}</p>
          </div>
        </div>

        {/* Video Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-800 mb-4">🎬 Video Tutorial</h2>
          <VideoPlayer videoUrl={topic.videoUrl} videoTitle={`${topic.name} - Video Tutorial`} />
          <p className="text-xs text-gray-400 mt-3 text-center">
            Watch the video to understand the core concepts before taking the quiz
          </p>
        </div>

        {/* Description Section */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-800 mb-4">📝 Detailed Explanation</h2>
          <div className="prose prose-sm max-w-none">
            {renderDescription(topic.description)}
          </div>
        </div>

        {/* Quiz CTA */}
        <div className="bg-gradient-to-r from-primary-light to-white rounded-xl border-2 border-primary p-6 shadow-sm">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-4xl">📋</span>
              <div>
                <h3 className="text-lg font-bold text-gray-800">Ready to Test Your Knowledge?</h3>
                <p className="text-sm text-gray-500">
                  10 questions • 10 minutes • Instant feedback
                </p>
              </div>
            </div>
            <button
              onClick={handleStartQuiz}
              className="px-8 py-3 bg-primary hover:bg-primary-dark text-white font-bold text-sm rounded-lg shadow-button transition-all transform hover:scale-105"
            >
              {progress ? 'Retake Quiz' : 'Start Quiz'} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
