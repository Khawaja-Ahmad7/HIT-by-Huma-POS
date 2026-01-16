'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
    Home,
    ShoppingBag,
    Grid3X3,
    Phone,
    Menu,
    X,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    Clock,
    User
} from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { api, Category } from '@/lib/api';

const navItems = [
    { path: '/', name: 'Home', icon: Home },
    { path: '/#contact', name: 'Contact', icon: Phone },
];

export function Sidebar() {
    const pathname = usePathname();
    const { itemCount } = useCart();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [shopOpen, setShopOpen] = useState(false);
    const [categories, setCategories] = useState<Category[]>([]);

    // Fetch categories on mount
    useEffect(() => {
        const loadCategories = async () => {
            try {
                const cats = await api.getCategories();
                setCategories(cats);
            } catch (error) {
                console.error('Failed to load categories:', error);
            }
        };
        loadCategories();
    }, []);

    const isActive = (path: string) => {
        // For the home path, only active on exact match
        if (path === '/') return pathname === '/';
        // For hash-based paths (like /#products), only highlight if explicitly navigating to that exact path
        // Since these are on the same page, we don't highlight them - only Home gets highlighted on home page
        if (path.includes('#')) return false;
        // For other paths, check if pathname starts with the path
        return pathname.startsWith(path);
    };

    return (
        <>
            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Mobile top bar */}
            {/* Mobile Menu Button - overlay on top left */}
            <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden fixed top-3 left-3 z-50 p-2 bg-white rounded-lg shadow-md text-gray-600 hover:text-gray-900"
            >
                <Menu className="w-6 h-6" />
            </button>

            {/* Sidebar */}
            <aside className={`
                fixed inset-y-0 left-0 z-50 bg-gray-900 transform transition-all duration-300 ease-in-out
                lg:static lg:translate-x-0
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}
                w-64
            `}>
                <div className="flex flex-col h-full">
                    {/* Logo */}
                    <div className="flex items-center justify-between h-16 px-4 bg-gray-800">
                        <div className={`flex items-center space-x-3 ${sidebarCollapsed ? 'lg:justify-center lg:space-x-0' : ''}`}>
                            <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center flex-shrink-0 overflow-hidden">
                                <Image
                                    src="/logo.png"
                                    alt="HIT by Huma"
                                    width={40}
                                    height={40}
                                    className="w-full h-full object-contain"
                                    onError={(e) => {
                                        // Fallback to H if logo not found
                                        const target = e.target as HTMLImageElement;
                                        target.style.display = 'none';
                                        if (target.parentElement) {
                                            target.parentElement.innerHTML = '<span class="text-primary-600 font-display font-bold text-lg">H</span>';
                                        }
                                    }}
                                />
                            </div>
                            <div className={`${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                                <h1 className="text-white font-display font-bold">HIT BY HUMA</h1>
                                <p className="text-gray-400 text-xs">Online Store</p>
                            </div>
                        </div>
                        <button
                            className="lg:hidden text-gray-400 hover:text-white"
                            onClick={() => setSidebarOpen(false)}
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Status Indicator - like POS "Shift Active" */}
                    <div className={`px-4 py-3 bg-gray-800/50 border-b border-gray-700 ${sidebarCollapsed ? 'lg:px-2' : ''}`}>
                        <div className={`flex items-center text-sm text-green-400 ${sidebarCollapsed ? 'lg:justify-center' : ''}`}>
                            <Clock className={`w-4 h-4 ${sidebarCollapsed ? '' : 'mr-2'}`} />
                            <span className={`${sidebarCollapsed ? 'lg:hidden' : ''}`}>Store Open</span>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
                        {/* Home link */}
                        <Link
                            href="/"
                            onClick={() => setSidebarOpen(false)}
                            className={`
                                flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors
                                ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}
                                ${pathname === '/'
                                    ? 'bg-primary-600 text-white'
                                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'}
                            `}
                            title={sidebarCollapsed ? 'Home' : ''}
                        >
                            <Home className={`w-5 h-5 ${sidebarCollapsed ? '' : 'mr-3'} flex-shrink-0`} />
                            <span className={`flex-1 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>Home</span>
                        </Link>

                        {/* Shop dropdown with categories */}
                        <div>
                            <button
                                onClick={() => setShopOpen(!shopOpen)}
                                className={`
                                    w-full flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors
                                    ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}
                                    text-gray-300 hover:bg-gray-800 hover:text-white
                                `}
                            >
                                <ShoppingBag className={`w-5 h-5 ${sidebarCollapsed ? '' : 'mr-3'} flex-shrink-0`} />
                                <span className={`flex-1 text-left ${sidebarCollapsed ? 'lg:hidden' : ''}`}>Shop</span>
                                {!sidebarCollapsed && (
                                    <ChevronDown className={`w-4 h-4 transition-transform ${shopOpen ? 'rotate-180' : ''}`} />
                                )}
                            </button>

                            {/* Category submenu */}
                            {shopOpen && !sidebarCollapsed && (
                                <div className="ml-4 mt-1 space-y-1">
                                    <Link
                                        href="/#products"
                                        onClick={() => setSidebarOpen(false)}
                                        className="flex items-center px-4 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
                                    >
                                        <Grid3X3 className="w-4 h-4 mr-3" />
                                        All Products
                                    </Link>
                                    {categories.map((category) => (
                                        <Link
                                            key={category.id}
                                            href={`/?category=${category.id}#products`}
                                            onClick={() => setSidebarOpen(false)}
                                            className="flex items-center px-4 py-2 rounded-lg text-sm text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
                                        >
                                            <span className="w-4 h-4 mr-3 flex items-center justify-center text-xs">•</span>
                                            {category.name}
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Contact link */}
                        <Link
                            href="/#contact"
                            onClick={() => setSidebarOpen(false)}
                            className={`
                                flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors
                                ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}
                                text-gray-300 hover:bg-gray-800 hover:text-white
                            `}
                            title={sidebarCollapsed ? 'Contact' : ''}
                        >
                            <Phone className={`w-5 h-5 ${sidebarCollapsed ? '' : 'mr-3'} flex-shrink-0`} />
                            <span className={`flex-1 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>Contact</span>
                        </Link>

                        {/* Cart link with badge */}
                        <Link
                            href="/cart"
                            onClick={() => setSidebarOpen(false)}
                            className={`
                                flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors
                                ${sidebarCollapsed ? 'lg:justify-center lg:px-2' : ''}
                                ${pathname === '/cart'
                                    ? 'bg-primary-600 text-white'
                                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'}
                            `}
                            title={sidebarCollapsed ? 'Cart' : ''}
                        >
                            <ShoppingBag className={`w-5 h-5 ${sidebarCollapsed ? '' : 'mr-3'} flex-shrink-0`} />
                            <span className={`flex-1 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>Cart</span>
                            {itemCount > 0 && !sidebarCollapsed && (
                                <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                                    {itemCount}
                                </span>
                            )}
                        </Link>
                    </nav>

                    {/* User Info / Footer - matching POS style */}
                    <div className={`p-4 border-t border-gray-700 ${sidebarCollapsed ? 'lg:p-2' : ''}`}>
                        <div className={`flex items-center ${sidebarCollapsed ? 'lg:flex-col lg:space-y-2' : ''}`}>
                            <div className={`flex items-center ${sidebarCollapsed ? 'lg:flex-col lg:w-full' : ''}`}>
                                <div className="w-10 h-10 rounded-full bg-primary-600/20 flex items-center justify-center flex-shrink-0">
                                    <User className="w-5 h-5 text-primary-400" />
                                </div>
                                <div className={`ml-3 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
                                    <p className="text-white text-sm font-medium">Guest</p>
                                    <p className="text-gray-400 text-xs">Shopper</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Desktop Toggle Button - Always Visible (matching POS) */}
            <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden lg:flex fixed top-4 z-50 p-2 bg-gray-900 text-white rounded-lg shadow-lg hover:bg-gray-800 transition-all duration-300"
                style={{ left: sidebarCollapsed ? '88px' : '272px' }}
                title={sidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
                {sidebarCollapsed ? (
                    <Menu className="w-5 h-5" />
                ) : (
                    <X className="w-5 h-5" />
                )}
            </button>
        </>
    );
}
