import { Navigation } from '../components/dashboard/Navigation';
import collegeHeader from '../assets/images/WhatsApp Image 2026-05-10 at 8.23.06 PM.jpeg';

/* ── Objectives ─────────────────────────────────────────────── */
const OBJECTIVES = [
  'To develop a secure web application with user registration, login, and a personalized dashboard for tracking progress.',
  'To implement an interactive learning module where students can access study materials and video lessons for various aptitude topics.',
  'To create a dynamic aptitude test simulator that generates topic-specific quizzes and provides instant scoring.',
  "To design an AI-powered mock interview agent that parses a user\u2019s resume to ask relevant HR and technical questions via a text or audio interface.",
  'To integrate a feedback mechanism that analyzes interview responses for content relevance, clarity, and sentiment.',
  'To provide a comprehensive performance summary on the user dashboard, visualizing results from both tests and interviews to highlight areas for improvement.',
];

/* ── Team ───────────────────────────────────────────────────── */
const TEAM_MEMBERS = [
  { name: 'Vedant Kumbhar',  role: 'Developer & Architect',   email: 'vedant.kumbhar013@gmail.com' },
  { name: 'Loukik Ingale',   role: 'Developer & Integration',  email: 'loukikingale2003@gmail.com' },
  { name: 'Meeraj Krishna',  role: 'Developer & Research',     email: 'meerajkrishna9730@gmail.com' },
];

const GUIDES = [
  {
    name: 'Dr. Suraj R. Nalawade',
    title: 'Project Guide & Research Advisor',
    dept: 'Head of Department — AI & Data Science',
    email: 'dr.surajsir@gmail.com',
  },
  {
    name: 'Asst. Prof. Himgouri O. Tapase',
    title: 'Project Coordinator Guide',
    dept: 'Department of AI & Data Science',
    email: 'gouribarge.8@gmail.com',
  },
];

/* ── Page ───────────────────────────────────────────────────── */
export const AboutUs = () => {
  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Fixed Navigation */}
      <Navigation />

      {/* Content */}
      <main className="pt-16">
        {/* ── College Header Banner ─────────────────────────── */}
        <section className="relative bg-white shadow-sm overflow-hidden">
          <div className="max-w-5xl mx-auto px-4">
            <img
              src={collegeHeader}
              alt="Yashoda Technical Campus, Satara — Faculty of Engineering"
              className="w-full h-auto object-contain py-4"
              draggable={false}
            />
          </div>
          {/* Accent bottom bar */}
          <div className="h-1 bg-gradient-to-r from-primary via-primary-dark to-primary" />
        </section>

        {/* ── Hero / Project Title ──────────────────────────── */}
        <section className="relative overflow-hidden">
          {/* Subtle background orbs */}
          <div className="absolute -top-32 -left-32 w-96 h-96 blur-orb-primary rounded-full pointer-events-none" />
          <div className="absolute -bottom-24 -right-24 w-80 h-80 blur-orb-secondary rounded-full pointer-events-none" />

          <div className="max-w-5xl mx-auto px-6 py-14 text-center relative z-10">
            <span className="inline-block px-4 py-1.5 text-xs font-semibold tracking-widest uppercase bg-primary/10 text-primary rounded-full mb-5">
              Final Year Project — {currentYear}
            </span>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 leading-tight font-display">
              AI-Based Pre-Placement Trainer
              <br />
              <span className="text-gradient-red">&amp; Feedback Model</span>
            </h1>
            <p className="max-w-2xl mx-auto mt-5 text-gray-500 text-base sm:text-lg leading-relaxed">
              A smart, end-to-end web platform designed to help engineering students prepare for campus placements through AI-driven aptitude training, mock interviews, and real-time performance analytics.
            </p>
          </div>
        </section>

        {/* ── About the Project ─────────────────────────────── */}
        <section className="bg-white">
          <div className="max-w-5xl mx-auto px-6 py-14">
            <SectionHeading icon="📖" title="About the Project" />

            <div className="mt-6 bg-gray-50 rounded-2xl p-6 sm:p-8 border border-gray-100 shadow-card">
              <p className="text-gray-700 leading-relaxed text-[15px]">
                The <strong className="text-gray-900">AI-Based Pre-Placement Trainer &amp; Feedback Model</strong> is
                a comprehensive web application developed as a final-year engineering project at
                <strong className="text-gray-900"> Yashoda Technical Campus, Satara</strong> — under the
                <strong className="text-gray-900"> Department of Artificial Intelligence &amp; Data Science</strong>.
              </p>
              <p className="text-gray-700 leading-relaxed text-[15px] mt-4">
                The system empowers students with interactive aptitude learning, AI-powered mock interviews (text &amp; voice),
                resume-aware question generation, real-time sentiment &amp; clarity analysis, and detailed PDF performance reports.
                Built with a <strong className="text-gray-900">React + TypeScript</strong> frontend and a
                <strong className="text-gray-900"> Django REST</strong> backend, integrated with
                <strong className="text-gray-900"> Google Gemini AI</strong> for intelligent interview evaluation and feedback.
              </p>
            </div>
          </div>
        </section>

        {/* ── Objectives ────────────────────────────────────── */}
        <section className="bg-gray-50">
          <div className="max-w-5xl mx-auto px-6 py-14">
            <SectionHeading icon="🎯" title="Project Objectives" />

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {OBJECTIVES.map((obj, i) => (
                <div
                  key={i}
                  className="group bg-white rounded-xl border border-gray-100 p-5 shadow-card hover:shadow-card-hover hover:border-primary/20 transition-all duration-300"
                >
                  <div className="flex items-start gap-4">
                    <span className="flex-shrink-0 w-9 h-9 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center text-sm group-hover:bg-primary group-hover:text-white transition-colors duration-300">
                      {i + 1}
                    </span>
                    <p className="text-gray-700 text-sm leading-relaxed">{obj}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Technology Stack ──────────────────────────────── */}
        <section className="bg-white">
          <div className="max-w-5xl mx-auto px-6 py-14">
            <SectionHeading icon="⚙️" title="Technology Stack" />

            <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {[
                { label: 'React',        color: 'bg-blue-50 text-blue-600 border-blue-100' },
                { label: 'TypeScript',    color: 'bg-sky-50 text-sky-600 border-sky-100' },
                { label: 'Tailwind CSS',  color: 'bg-teal-50 text-teal-600 border-teal-100' },
                { label: 'Django REST',   color: 'bg-green-50 text-green-700 border-green-100' },
                { label: 'Google Gemini', color: 'bg-purple-50 text-purple-600 border-purple-100' },
                { label: 'ReportLab',     color: 'bg-orange-50 text-orange-600 border-orange-100' },
                { label: 'SQLite',        color: 'bg-amber-50 text-amber-700 border-amber-100' },
                { label: 'Web Speech API',color: 'bg-pink-50 text-pink-600 border-pink-100' },
              ].map((t) => (
                <div
                  key={t.label}
                  className={`rounded-xl border px-4 py-3 text-center font-semibold text-sm ${t.color} transition hover:scale-105 duration-200`}
                >
                  {t.label}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Project Team ──────────────────────────────────── */}
        <section className="bg-gray-50">
          <div className="max-w-5xl mx-auto px-6 py-14">
            <SectionHeading icon="👥" title="Project Team" />

            {/* Students */}
            <div className="mt-8 grid gap-5 sm:grid-cols-3">
              {TEAM_MEMBERS.map((m) => (
                <TeamCard key={m.email} {...m} accent />
              ))}
            </div>

            {/* Guides */}
            <h3 className="mt-12 text-lg font-semibold text-gray-800 flex items-center gap-2">
              <span className="w-8 h-[2px] bg-primary rounded-full" />
              Guided By
            </h3>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              {GUIDES.map((g) => (
                <div
                  key={g.email}
                  className="bg-white rounded-xl border border-gray-100 p-6 shadow-card hover:shadow-card-hover transition-all duration-300"
                >
                  <div className="flex items-center gap-4 mb-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-white font-bold text-lg shadow">
                      {g.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{g.name}</p>
                      <p className="text-xs text-primary font-medium">{g.title}</p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">{g.dept}</p>
                  <a
                    href={`mailto:${g.email}`}
                    className="inline-flex items-center gap-1 mt-3 text-xs text-gray-500 hover:text-primary transition"
                  >
                    <MailIcon />
                    {g.email}
                  </a>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Copyright Footer ──────────────────────────────── */}
        <footer className="bg-gray-900 text-gray-400">
          <div className="max-w-5xl mx-auto px-6 py-8 text-center space-y-2">
            <p className="text-sm">
              © {currentYear}{' '}
              <span className="text-white font-medium">
                Vedant Kumbhar · Loukik Ingale · Meeraj Krishna
              </span>
            </p>
            <p className="text-xs text-gray-500">
              AI-Based Pre-Placement Trainer &amp; Feedback Model — All Rights Reserved.
            </p>
            <p className="text-xs text-gray-600">
              Yashoda Technical Campus, Satara — Faculty of Engineering &nbsp;|&nbsp; Dept. of AI &amp; Data Science
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════════════════════════ */

const SectionHeading = ({ icon, title }: { icon: string; title: string }) => (
  <div className="flex items-center gap-3">
    <span className="text-2xl">{icon}</span>
    <h2 className="text-2xl font-bold text-gray-900 font-display">{title}</h2>
    <div className="flex-1 h-[2px] bg-gradient-to-r from-primary/30 to-transparent rounded-full ml-2" />
  </div>
);

interface TeamCardProps {
  name: string;
  role: string;
  email: string;
  accent?: boolean;
}

const TeamCard = ({ name, role, email, accent }: TeamCardProps) => (
  <div className="relative bg-white rounded-xl border border-gray-100 p-6 shadow-card hover:shadow-card-hover transition-all duration-300 group overflow-hidden">
    {/* Accent strip */}
    {accent && (
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-primary-dark scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-500" />
    )}
    <div className="flex items-center gap-4 mb-3">
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center text-white font-bold text-lg shadow">
        {name.charAt(0)}
      </div>
      <div>
        <p className="font-semibold text-gray-900">{name}</p>
        <p className="text-xs text-gray-500">{role}</p>
      </div>
    </div>
    <a
      href={`mailto:${email}`}
      className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-primary transition"
    >
      <MailIcon />
      {email}
    </a>
  </div>
);

const MailIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);
