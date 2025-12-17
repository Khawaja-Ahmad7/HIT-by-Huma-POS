import { useState, useEffect, Suspense } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import api from '../services/api';
import PageLoader from './PageLoader';
import {
  ShoppingCartIcon,
  CubeIcon,
  ArchiveBoxIcon,
  UsersIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  ClockIcon,
  Bars3Icon,
  XMarkIcon,
  HomeIcon,
  PresentationChartLineIcon,
} from '@heroicons/react/24/outline';

const navItems = [
  { path: '/dashboard', name: 'Dashboard', icon: HomeIcon },
  { path: '/pos', name: 'POS Terminal', icon: ShoppingCartIcon },
  { path: '/products', name: 'Products', icon: CubeIcon },
  { path: '/inventory', name: 'Inventory', icon: ArchiveBoxIcon },
  { path: '/customers', name: 'Customers', icon: UsersIcon },
  { path: '/reports', name: 'Reports', icon: PresentationChartLineIcon },
  { path: '/shifts', name: 'Shifts', icon: ClockIcon },
  { path: '/settings', name: 'Settings', icon: Cog6ToothIcon },
];

export default function Layout() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentShift, setCurrentShift] = useState(null);

  // Fetch current shift on mount
  useEffect(() => {
    const fetchShift = async () => {
      try {
        const response = await api.get('/shifts/current');
        if (response.data) {
          setCurrentShift(response.data);
        }
      } catch (error) {
        // No active shift
      }
    };
    fetchShift();
    const interval = setInterval(fetchShift, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 transform transition-transform duration-300 ease-in-out
        lg:static lg:translate-x-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between h-16 px-4 bg-gray-800">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-primary-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">H</span>
              </div>
              <div>
                <h1 className="text-white font-display font-bold">HIT BY HUMA</h1>
                <p className="text-gray-400 text-xs">Point of Sale</p>
              </div>
            </div>
            <button 
              className="lg:hidden text-gray-400 hover:text-white"
              onClick={() => setSidebarOpen(false)}
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Shift Status */}
          <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-700">
            <div className={`flex items-center text-sm ${currentShift ? 'text-green-400' : 'text-gray-400'}`}>
              <ClockIcon className="w-4 h-4 mr-2" />
              <span>{currentShift ? 'Shift Active' : 'No Active Shift'}</span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => `
                  flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors
                  ${isActive 
                    ? 'bg-primary-600 text-white' 
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'}
                `}
              >
                <item.icon className="w-5 h-5 mr-3" />
                {item.name}
              </NavLink>
            ))}
          </nav>

          {/* User Info */}
          <div className="p-4 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-primary-600/20 flex items-center justify-center">
                  <span className="text-primary-400 font-semibold">
                    {user?.name?.charAt(0) || 'U'}
                  </span>
                </div>
                <div className="ml-3">
                  <p className="text-white text-sm font-medium">
                    {user?.name || 'User'}
                  </p>
                  <p className="text-gray-400 text-xs">{user?.role || 'Staff'}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                title="Logout"
              >
                <ArrowRightOnRectangleIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top bar for mobile */}
        <header className="lg:hidden flex items-center justify-between h-16 px-4 bg-white border-b border-gray-200">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 text-gray-600 hover:text-gray-900"
          >
            <Bars3Icon className="w-6 h-6" />
          </button>
          <h1 className="font-display font-bold text-gray-900">HIT BY HUMA</h1>
          <div className="w-10" />
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-auto">
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
