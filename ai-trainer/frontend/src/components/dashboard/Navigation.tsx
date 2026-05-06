import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthService from '../../services/authService';

const NAV_ITEMS = [
  { label: 'Dashboard', path: '/dashboard' },
  { label: 'Learning', path: '/learning' },
  { label: 'AI Interview', path: '/ai-interview' },
];

export const Navigation = () => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [username, setUsername] = useState<string>('User');
  const [userInitial, setUserInitial] = useState<string>('U');
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Get user data from AuthService
    const user = AuthService.getUser();
    if (user) {
      const displayName = user.first_name || user.username || user.email?.split('@')[0] || 'User';
      setUsername(displayName);
      setUserInitial(displayName.charAt(0).toUpperCase());
    }
  }, []);

  const handleLogout = () => {
    AuthService.logout();
    navigate('/login');
  };

  return (
    <nav className="fixed top-0 left-0 right-0 bg-white border-b border-gray-200 z-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="w-2 h-8 bg-primary rounded-full"></div>
            <span className="text-xl font-bold text-gray-800">LearnHub</span>
          </Link>

          {/* Navigation Links */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`text-sm font-medium transition-colors ${
                  location.pathname === item.path ||
                  (item.path === '/dashboard' && location.pathname.startsWith('/dashboard'))
                    ? 'text-primary'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* User Profile */}
          <div className="flex items-center gap-4">
            {/* User Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">{userInitial}</span>
                </div>
                <span className="text-sm font-medium text-gray-800 hidden sm:block">{username}</span>
                <ChevronDownIcon />
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                  {/* Profile Settings and Preferences removed — only Logout remains */}
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-primary hover:bg-primary-light"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
};

// Icons
const ChevronDownIcon = () => (
  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);
