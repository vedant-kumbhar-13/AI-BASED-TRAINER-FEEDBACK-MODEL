import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Navigation } from '../components/dashboard/Navigation';
import { Play, ArrowLeft, FileText, Briefcase, GraduationCap, Code, Settings, AlertTriangle } from 'lucide-react';

const DEFAULT_RESUME = {
  skills: ['JavaScript', 'React', 'Node.js', 'Python', 'SQL', 'Git'],
  experience: [
    { title: 'Software Developer', company: 'Tech Company', duration: '2 years' }
  ],
  education: [
    { degree: 'B.Tech in Computer Science', institution: 'University', year: '2022' }
  ],
  projects: [
    { name: 'E-commerce Platform', technologies: ['React', 'Node.js', 'MongoDB'] }
  ],
  summary: 'Experienced software developer with expertise in full-stack web development.'
};

export const ResumeSummary = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const resume = location.state?.resume || DEFAULT_RESUME;
  const initialType = location.state?.interviewType || 'Technical';
  const skipResume = location.state?.skipResume || false;
  const inputMode = (location.state?.inputMode as 'voice' | 'text') || 'voice';

  const [config, setConfig] = useState({
    interviewType: initialType,
    difficulty: 'Intermediate',
    numQuestions: 5,
    enableTimer: true,
    useVoice: false
  });

  const handleStartInterview = () => {
    navigate('/ai-interview-session', {
      state: {
        resume: skipResume ? null : resume,
        config,
        inputMode,
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      
      <main className="pt-16">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Parse Warning Banner: shown when resume data is empty */}
          {!skipResume && !resume.skills?.length && !resume.experience?.length && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-800 text-sm mb-1">Resume Not Fully Parsed</p>
                <p className="text-sm text-amber-700">
                  We couldn't extract detailed information from your resume (AI parse issue). Your interview will still work,
                  but questions may be more generic.
                </p>
                <div className="mt-2 flex gap-3">
                  <button
                    onClick={() => navigate('/ai-interview-upload', { state: { interviewType: initialType } })}
                    className="text-sm font-bold text-amber-700 hover:underline"
                  >
                    ↑ Try uploading again
                  </button>
                  <span className="text-amber-400">·</span>
                  <button
                    onClick={() => navigate('/ai-interview-summary', { state: { interviewType: initialType, skipResume: true } })}
                    className="text-sm font-bold text-amber-700 hover:underline"
                  >
                    Continue without resume
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Interview Setup</h1>
              <p className="text-sm text-gray-500">Review your profile and configure the interview</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Resume Summary (66%) */}
            <div className="lg:col-span-2 space-y-6">
              {skipResume ? (
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                  <span className="text-6xl mb-4 block">🚀</span>
                  <h2 className="text-xl font-bold text-gray-800 mb-2">Quick Interview Mode</h2>
                  <p className="text-gray-500">
                    You're starting without a resume. The AI will ask general interview questions.
                  </p>
                </div>
              ) : (
                <>
                  {/* Summary Card */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-primary-light flex items-center justify-center">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h2 className="font-bold text-gray-800">Resume Summary</h2>
                        <p className="text-sm text-gray-500">AI-extracted information from your resume</p>
                      </div>
                    </div>
                    <p className="text-gray-600">{resume.summary}</p>
                  </div>

                  {/* Skills */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                        <Code className="w-5 h-5 text-green-600" />
                      </div>
                      <h2 className="font-bold text-gray-800">Skills</h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {resume.skills?.map((skill: string, i: number) => (
                        <span
                          key={i}
                          className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Experience */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                        <Briefcase className="w-5 h-5 text-blue-600" />
                      </div>
                      <h2 className="font-bold text-gray-800">Experience</h2>
                    </div>
                    <div className="space-y-3">
                      {resume.experience?.map((exp: any, i: number) => (
                        <div key={i} className="p-3 bg-gray-50 rounded-lg">
                          <p className="font-medium text-gray-800">{exp.title}</p>
                          <p className="text-sm text-gray-500">{exp.company} • {exp.duration}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Education */}
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                        <GraduationCap className="w-5 h-5 text-purple-600" />
                      </div>
                      <h2 className="font-bold text-gray-800">Education</h2>
                    </div>
                    <div className="space-y-3">
                      {resume.education?.map((edu: any, i: number) => (
                        <div key={i} className="p-3 bg-gray-50 rounded-lg">
                          <p className="font-medium text-gray-800">{edu.degree}</p>
                          <p className="text-sm text-gray-500">{edu.institution} • {edu.year}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Right: Configuration Panel (33%) */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl border border-gray-200 p-6 sticky top-24">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-primary-light flex items-center justify-center">
                    <Settings className="w-5 h-5 text-primary" />
                  </div>
                  <h2 className="font-bold text-gray-800">Interview Settings</h2>
                </div>

                {/* Interview Type */}
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Interview Type
                  </label>
                  <select
                    value={config.interviewType}
                    onChange={(e) => setConfig({ ...config, interviewType: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option value="HR">HR Interview</option>
                    <option value="Technical">Technical Interview</option>
                    <option value="Behavioral">Behavioral Interview</option>
                    <option value="Mixed">Mixed Interview</option>
                  </select>
                </div>

                {/* Difficulty */}
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Difficulty Level
                  </label>
                  <select
                    value={config.difficulty}
                    onChange={(e) => setConfig({ ...config, difficulty: e.target.value })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                  </select>
                </div>

                {/* Number of Questions */}
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Number of Questions
                  </label>
                  <select
                    value={config.numQuestions}
                    onChange={(e) => setConfig({ ...config, numQuestions: parseInt(e.target.value) })}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:border-primary focus:ring-1 focus:ring-primary"
                  >
                    <option value={3}>3 Questions (~5 min)</option>
                    <option value={5}>5 Questions (~10 min)</option>
                    <option value={10}>10 Questions (~20 min)</option>
                  </select>
                </div>

                {/* Toggles */}
                <div className="space-y-4 mb-8">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.enableTimer}
                      onChange={(e) => setConfig({ ...config, enableTimer: e.target.checked })}
                      className="w-5 h-5 rounded accent-primary"
                    />
                    <span className="text-sm text-gray-700">Enable Time Pressure</span>
                  </label>
                  
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.useVoice}
                      onChange={(e) => setConfig({ ...config, useVoice: e.target.checked })}
                      className="w-5 h-5 rounded accent-primary"
                    />
                    <span className="text-sm text-gray-700">Use Voice Responses</span>
                  </label>
                </div>

                {/* Start Button */}
                <button
                  onClick={handleStartInterview}
                  className="w-full py-4 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl shadow-button transition-all flex items-center justify-center gap-2"
                >
                  <Play className="w-5 h-5" />
                  Start Interview
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ResumeSummary;
