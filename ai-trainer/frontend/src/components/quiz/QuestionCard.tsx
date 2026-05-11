import type { Question } from '../../types/learning';

interface QuestionCardProps {
  question: Question;
  questionNumber: number;
  totalQuestions: number;
  selectedAnswer: string | null;
  onAnswerSelect: (answer: string) => void;
  showResult?: boolean;
}

export const QuestionCard = ({
  question,
  questionNumber,
  totalQuestions,
  selectedAnswer,
  onAnswerSelect,
  showResult = false
}: QuestionCardProps) => {
  const getOptionStyles = (option: string) => {
    const isSelected = selectedAnswer === option;
    const isCorrect = option === question.correctAnswer;
    const notAnswered = !selectedAnswer;

    if (showResult) {
      if (isCorrect) {
        // Always highlight the correct answer in green
        return 'bg-green-50 border-green-500 text-green-800';
      }
      if (isSelected && !isCorrect) {
        return 'bg-red-50 border-red-500 text-red-800';
      }
      // Unanswered or other wrong options — neutral grey
      return notAnswered
        ? 'bg-gray-50 border-gray-200 text-gray-400'
        : 'bg-gray-50 border-gray-200 text-gray-500';
    }

    if (isSelected) {
      return 'bg-primary-light border-primary text-primary';
    }

    return 'bg-white border-gray-200 text-gray-700 hover:border-primary hover:bg-primary-light/30';
  };

  const optionLabels = ['A', 'B', 'C', 'D'];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      {/* Question Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-bold text-primary">
          Question {questionNumber} of {totalQuestions}
        </span>
        <span className="text-xs text-gray-400">
          Select one answer
        </span>
      </div>

      {/* Question Text */}
      <h2 className="text-lg font-bold text-gray-800 mb-6 leading-relaxed">
        {question.text}
      </h2>

      {/* Options */}
      <div className="space-y-3">
        {question.options.map((option, index) => (
          <button
            key={index}
            onClick={() => !showResult && onAnswerSelect(option)}
            disabled={showResult}
            className={`w-full flex items-center gap-4 p-4 rounded-lg border-2 transition-all text-left ${getOptionStyles(option)}`}
          >
            <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
              selectedAnswer === option 
                ? 'bg-primary text-white border-primary' 
                : 'bg-gray-100 text-gray-600 border-gray-300'
            }`}>
              {optionLabels[index]}
            </span>
            <span className="flex-1 font-medium">{option}</span>
            
            {showResult && option === question.correctAnswer && (
              <span className="text-green-600 font-bold">✓ Correct</span>
            )}
            {showResult && selectedAnswer === option && option !== question.correctAnswer && (
              <span className="text-red-600 font-bold">✗ Wrong</span>
            )}
          </button>
        ))}
      </div>

      {/* Result Explanation */}
      {showResult && (
        <div className={`mt-6 p-4 rounded-lg ${
          !selectedAnswer
            ? 'bg-gray-50 border border-gray-200'
            : selectedAnswer === question.correctAnswer
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
        }`}>
          <p className={`text-sm font-bold ${
            !selectedAnswer
              ? 'text-gray-500'
              : selectedAnswer === question.correctAnswer
                ? 'text-green-700'
                : 'text-red-700'
          }`}>
            {!selectedAnswer
              ? '⚪ Not Answered'
              : selectedAnswer === question.correctAnswer
                ? '🎉 Correct!'
                : '❌ Incorrect'}
          </p>
          {question.correctAnswer && (
            <p className="text-sm text-gray-600 mt-1">
              The correct answer is: <strong>{question.correctAnswer}</strong>
            </p>
          )}
        </div>
      )}
    </div>
  );
};
