'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ProductCard } from '@/components/ProductCard';
import { CategoryFilter } from '@/components/CategoryFilter';
import { api, Product, Category } from '@/lib/api';
import { ShoppingBag, Sparkles } from 'lucide-react';
import { useCart } from '@/context/CartContext';

export default function HomePage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const { itemCount } = useCart();

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const [productsData, categoriesData] = await Promise.all([
                    api.getProducts(selectedCategory || undefined),
                    api.getCategories(),
                ]);
                setProducts(productsData.products);
                setCategories(categoriesData);
                setError(null);
            } catch (err) {
                setError('Failed to load products. Please try again.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [selectedCategory]);

    return (
        <div>
            {/* Top Header Bar - visible in all views with cart button */}
            <header className="sticky top-0 z-40 bg-white border-b border-gray-200 h-16 flex items-center justify-between px-4 lg:px-6">
                <div className="w-16 lg:w-24"></div>
                <h1 className="font-display font-bold text-xl text-gray-900">HIT BY HUMA</h1>
                <Link href="/cart" className="relative w-16 lg:w-24 flex justify-end">
                    <div className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <ShoppingBag className="w-6 h-6 text-gray-700" />
                        {itemCount > 0 && (
                            <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                                {itemCount > 9 ? '9+' : itemCount}
                            </span>
                        )}
                    </div>
                </Link>
            </header>

            {/* Hero Section */}
            <section className="relative bg-white border-b border-gray-200 overflow-hidden">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 lg:py-20">
                    <div className="text-center">
                        <div className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 px-4 py-2 rounded-full mb-6">
                            <Sparkles className="w-4 h-4" />
                            <span className="text-sm font-medium">New Collection Available</span>
                        </div>
                        <h1 className="text-4xl md:text-6xl font-display font-bold mb-6 leading-tight text-gray-900">
                            Elevate Your Style
                        </h1>
                        <p className="text-2xl text-primary-600 font-semibold mb-4">Premium Fashion Collection</p>
                        <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
                            Discover our curated collection of premium fashion pieces designed for the modern lifestyle.
                        </p>
                        <a href="#products" className="btn-primary inline-flex items-center gap-2">
                            <ShoppingBag className="w-5 h-5" />
                            Shop Now
                        </a>
                    </div>
                </div>
            </section>

            {/* Products Section */}
            <section id="products" className="py-16 lg:py-24">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl md:text-4xl font-display font-bold text-gray-900 mb-4">
                            Our Collection
                        </h2>
                        <p className="text-gray-600 max-w-2xl mx-auto">
                            Handpicked styles for every occasion. Quality craftsmanship meets modern design.
                        </p>
                    </div>

                    {/* Category Filter */}
                    <CategoryFilter
                        categories={categories}
                        selected={selectedCategory}
                        onSelect={setSelectedCategory}
                    />

                    {/* Products Grid */}
                    {loading ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {[...Array(8)].map((_, i) => (
                                <div key={i} className="card animate-pulse">
                                    <div className="aspect-square bg-gray-200"></div>
                                    <div className="p-4 space-y-3">
                                        <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : error ? (
                        <div className="text-center py-12">
                            <p className="text-red-500 mb-4">{error}</p>
                            <button
                                onClick={() => window.location.reload()}
                                className="btn-secondary"
                            >
                                Try Again
                            </button>
                        </div>
                    ) : products.length === 0 ? (
                        <div className="text-center py-12">
                            <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500">No products found in this category.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                            {products.map((product) => (
                                <ProductCard key={product.id} product={product} />
                            ))}
                        </div>
                    )}
                </div>
            </section>

            {/* Features Section */}
            <section className="py-16 bg-gray-100">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        <div className="text-center p-6">
                            <div className="w-16 h-16 bg-brand/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 className="font-semibold text-lg mb-2">Premium Quality</h3>
                            <p className="text-gray-600">Only the finest materials and craftsmanship.</p>
                        </div>
                        <div className="text-center p-6">
                            <div className="w-16 h-16 bg-brand/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </div>
                            <h3 className="font-semibold text-lg mb-2">Fast Processing</h3>
                            <p className="text-gray-600">Quick order confirmation and processing.</p>
                        </div>
                        <div className="text-center p-6">
                            <div className="w-16 h-16 bg-brand/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <svg className="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                            </div>
                            <h3 className="font-semibold text-lg mb-2">Support</h3>
                            <p className="text-gray-600">Call us anytime for assistance.</p>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
