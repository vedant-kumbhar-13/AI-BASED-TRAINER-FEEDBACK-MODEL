import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navigation } from '../components/dashboard/Navigation';
import { Sparkles, Upload, Zap, Users, Code, MessageSquare, ArrowRight } from 'lucide-react';

const INTERVIEW_TYPES = [
  {
    id: 'HR',
    title: 'HR Interview',
    icon: Users,
    description: 'Behavioral questions, culture fit, soft skills assessment',
    color: 'bg-blue-500'
  },
  {
    id: 'Technical',
    title: 'Technical Interview',
    icon: Code,
    description: 'Coding concepts, problem-solving, system design',
    color: 'bg-green-500'
  },
  {
    id: 'Behavioral',
    title: 'Behavioral Interview',
    icon: MessageSquare,
    description: 'STAR method questions, competency-based assessment',
    color: 'bg-purple-500'
  },
  {
    id: 'Mixed',
    title: 'Mixed Interview',
    icon: Sparkles,
    description: 'Combination of all interview types',
    color: 'bg-primary'
  }
];

export const AIInterviewLanding = () => {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState('Technical');

  const handleUploadResume = () => {
    navigate('/ai-interview-upload', { state: { interviewType: selectedType } });
  };

  const handleQuickInterview = () => {
    navigate('/ai-interview-summary', { state: { interviewType: selectedType, skipResume: true } });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="pt-16">
        <div className="max-w-6xl mx-auto px-6 py-12">
          {/* Hero Section */}
          <div className="bg-white rounded-2xl border border-gray-200 p-8 md:p-12 mb-10 shadow-card">
            <div className="flex flex-col lg:flex-row items-center gap-10">
              {/* Left: Content */}
              <div className="flex-1 text-center lg:text-left">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-light rounded-full mb-6">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-sm font-bold text-primary">AI-Powered Interview Practice</span>
                </div>
                
                <h1 className="text-4xl md:text-5xl font-bold text-gray-800 mb-4">
                  Practice Interviews with
                  <span className="text-primary"> AI</span>
                </h1>
                
                <p className="text-lg text-gray-500 mb-8 max-w-xl">
                  Get personalized interview questions based on your resume. 
                  Receive real-time AI feedback to improve your skills.
                </p>
                
                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                  <button
                    onClick={handleUploadResume}
                    className="flex items-center justify-center gap-3 px-8 py-4 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl shadow-button transition-all"
                  >
                    <Upload className="w-5 h-5" />
                    Upload Resume
                    <ArrowRight className="w-5 h-5" />
                  </button>
                  
                  <button
                    onClick={handleQuickInterview}
                    className="flex items-center justify-center gap-3 px-8 py-4 border-2 border-primary text-primary font-bold rounded-xl hover:bg-primary-light transition-all"
                  >
                    <Zap className="w-5 h-5" />
                    Quick Interview
                  </button>
                </div>
              </div>
              
              {/* Right: AI Avatar */}
              <div className="flex-shrink-0">
                <div className="w-48 h-48 md:w-64 md:h-64 rounded-full bg-gradient-to-br from-primary-light to-white border-4 border-primary flex items-center justify-center">
                  <span className="text-8xl md:text-9xl">🤖</span>
                </div>
              </div>
            </div>
          </div>

          {/* Interview Type Selection */}
          <div className="mb-10">
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Select Interview Type</h2>
            <p className="text-sm text-gray-500 mb-6">Choose the type of interview you want to practice</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {INTERVIEW_TYPES.map((type) => {
                const Icon = type.icon;
                const isSelected = selectedType === type.id;
                
                return (
                  <button
                    key={type.id}
                    onClick={() => setSelectedType(type.id)}
                    className={`p-6 rounded-xl border-2 text-left transition-all hover:shadow-card-hover ${
                      isSelected 
                        ? 'border-primary bg-primary-light' 
                        : 'border-gray-200 bg-white hover:border-primary'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl ${type.color} flex items-center justify-center mb-4`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="font-bold text-gray-800 mb-2">{type.title}</h3>
                    <p className="text-sm text-gray-500">{type.description}</p>
                    
                    {isSelected && (
                      <div className="mt-4 flex items-center gap-2 text-primary text-sm font-bold">
                        <span className="w-2 h-2 rounded-full bg-primary" />
                        Selected
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Features */}
          <div className="bg-gradient-to-br from-primary-light to-white rounded-2xl border-2 border-primary p-8">
            <h2 className="text-xl font-bold text-gray-800 mb-6 text-center">Why Practice with AI?</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="text-center p-4">
                <span className="text-4xl mb-3 block">🎯</span>
                <h3 className="font-bold text-gray-800 mb-2">Personalized Questions</h3>
                <p className="text-sm text-gray-500">
                  Questions tailored to your resume and experience
                </p>
              </div>
              
              <div className="text-center p-4">
                <span className="text-4xl mb-3 block">⚡</span>
                <h3 className="font-bold text-gray-800 mb-2">Instant Feedback</h3>
                <p className="text-sm text-gray-500">
                  Get detailed feedback immediately after each answer
                </p>
              </div>
              
              <div className="text-center p-4">
                <span className="text-4xl mb-3 block">📈</span>
                <h3 className="font-bold text-gray-800 mb-2">Track Progress</h3>
                <p className="text-sm text-gray-500">
                  Monitor improvement with detailed analytics
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AIInterviewLanding;
