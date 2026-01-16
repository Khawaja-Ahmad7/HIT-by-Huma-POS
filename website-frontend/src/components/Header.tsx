'use client';

import Link from 'next/link';
import { ShoppingBag, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { useCart } from '@/context/CartContext';

export function Header() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const { itemCount } = useCart();

    return (
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-gray-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex items-center justify-between h-16 md:h-20">
                    {/* Logo */}
                    <Link href="/" className="flex items-center">
                        <span className="text-2xl font-display font-bold bg-gradient-to-r from-brand to-primary-500 bg-clip-text text-transparent">
                            HIT BY HUMA
                        </span>
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center gap-8">
                        <Link href="/#products" className="text-gray-600 hover:text-brand transition-colors font-medium">
                            Shop
                        </Link>
                        <Link href="/#products" className="text-gray-600 hover:text-brand transition-colors font-medium">
                            Collections
                        </Link>
                        <Link href="/#contact" className="text-gray-600 hover:text-brand transition-colors font-medium">
                            Contact
                        </Link>
                    </nav>

                    {/* Cart Button */}
                    <div className="flex items-center gap-4">
                        <Link
                            href="/cart"
                            className="relative p-2 text-gray-600 hover:text-brand transition-colors"
                        >
                            <ShoppingBag className="w-6 h-6" />
                            {itemCount > 0 && (
                                <span className="absolute -top-1 -right-1 w-5 h-5 bg-brand text-white text-xs font-bold rounded-full flex items-center justify-center animate-scale-in">
                                    {itemCount > 99 ? '99+' : itemCount}
                                </span>
                            )}
                        </Link>

                        {/* Mobile menu button */}
                        <button
                            className="md:hidden p-2 text-gray-600"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        >
                            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>

                {/* Mobile Navigation */}
                {mobileMenuOpen && (
                    <nav className="md:hidden py-4 border-t border-gray-100 animate-slide-up">
                        <div className="flex flex-col gap-4">
                            <Link
                                href="/#products"
                                className="text-gray-600 hover:text-brand transition-colors font-medium py-2"
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                Shop
                            </Link>
                            <Link
                                href="/#products"
                                className="text-gray-600 hover:text-brand transition-colors font-medium py-2"
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                Collections
                            </Link>
                            <Link
                                href="/#contact"
                                className="text-gray-600 hover:text-brand transition-colors font-medium py-2"
                                onClick={() => setMobileMenuOpen(false)}
                            >
                                Contact
                            </Link>
                        </div>
                    </nav>
                )}
            </div>
        </header>
    );
}
