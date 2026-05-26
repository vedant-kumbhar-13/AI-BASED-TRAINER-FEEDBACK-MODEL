import React from 'react';
import { Link } from 'react-router-dom';

interface DashboardSidebarProps {
  isOpen: boolean;
  activeModule: string;
  onModuleChange: (module: string) => void;
}

const MENU_ITEMS = [
  {
    id: 'home',
    label: 'Dashboard',
    icon: 'grid',
    path: '/dashboard',
  },
  {
    id: 'resume',
    label: 'Resume Upload',
    icon: 'upload',
    path: '/dashboard/resume',
  },
  {
    id: 'interview',
    label: 'Interview',
    icon: 'mic',
    path: '/dashboard/interview',
  },
  {
    id: 'aptitude',
    label: 'Aptitude Test',
    icon: 'target',
    path: '/dashboard/aptitude',
  },
  {
    id: 'learning',
    label: 'Learning Resources',
    icon: 'book',
    path: '/dashboard/learning',
  },
  {
    id: 'results',
    label: 'Results & Feedback',
    icon: 'chart',
    path: '/dashboard/results',
  },
];

export const DashboardSidebar = ({ isOpen, activeModule, onModuleChange }: DashboardSidebarProps) => {
  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 lg:hidden z-40"
          onClick={() => onModuleChange('home')}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:static inset-y-0 left-0 w-64 bg-white border-r border-gray-200 z-40 lg:z-0 transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Navigation Links */}
        <nav className="p-6 space-y-2">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Menu</p>
          
          {MENU_ITEMS.map((item) => (
            <Link
              key={item.id}
              to={item.path}
              onClick={() => onModuleChange(item.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                activeModule === item.id
                  ? 'bg-red-50 text-red-600 font-medium'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <IconComponent iconName={item.icon} />
              <span>{item.label}</span>
              {activeModule === item.id && (
                <div className="ml-auto w-1 h-6 bg-red-600 rounded-full"></div>
              )}
            </Link>
          ))}
        </nav>

        {/* Sidebar Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-6 border-t border-gray-200">
          <div className="bg-red-50 rounded-lg p-4">
            <p className="text-sm font-bold text-gray-900 mb-2">Pro Tip</p>
            <p className="text-xs text-gray-600">Practice consistently to improve your score</p>
          </div>
        </div>
      </aside>
    </>
  );
};

// Icon Component Helper
const IconComponent = ({ iconName }: { iconName: string }) => {
  const icons: Record<string, React.ReactElement> = {
    grid: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
      </svg>
    ),
    upload: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
    mic: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4" />
      </svg>
    ),
    target: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
    book: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C6.5 6.253 2 10.998 2 17.5S6.5 28.5 12 28.5s10-4.745 10-10.5S17.5 6.253 12 6.253z" />
      </svg>
    ),
    chart: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  };

  return icons[iconName] || null;
};
