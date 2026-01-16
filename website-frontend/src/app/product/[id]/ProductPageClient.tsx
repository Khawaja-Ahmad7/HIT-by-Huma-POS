'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, ShoppingBag, Plus, Minus, Check } from 'lucide-react';
import { api, Product, Variant } from '@/lib/api';
import { useCart } from '@/context/CartContext';

interface ProductPageClientProps {
    productId: string;
}

export default function ProductPageClient({ productId }: ProductPageClientProps) {
    const { addItem } = useCart();
    const id = Number(productId);

    const [product, setProduct] = useState<Product | null>(null);
    const [selectedVariant, setSelectedVariant] = useState<Variant | null>(null);
    const [quantity, setQuantity] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [added, setAdded] = useState(false);

    useEffect(() => {
        const loadProduct = async () => {
            try {
                setLoading(true);
                const data = await api.getProduct(id);
                setProduct(data);
                if (data.variants && data.variants.length > 0) {
                    setSelectedVariant(data.variants[0]);
                }
                setError(null);
            } catch (err) {
                setError('Failed to load product. Please try again.');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        if (id) {
            loadProduct();
        }
    }, [id]);

    const handleAddToCart = () => {
        if (!product || !selectedVariant) return;

        addItem(product, selectedVariant, quantity);
        setAdded(true);
        setTimeout(() => setAdded(false), 2000);
    };

    const formatPrice = (price: number) => {
        return `Rs. ${price.toLocaleString()}`;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-100">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="animate-pulse">
                        <div className="h-8 bg-gray-200 rounded w-32 mb-8"></div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                            <div className="aspect-square bg-gray-200 rounded-2xl"></div>
                            <div className="space-y-4">
                                <div className="h-8 bg-gray-200 rounded w-3/4"></div>
                                <div className="h-6 bg-gray-200 rounded w-1/4"></div>
                                <div className="h-4 bg-gray-200 rounded w-full"></div>
                                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (error || !product) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="text-center">
                    <ShoppingBag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-red-500 mb-4">{error || 'Product not found'}</p>
                    <Link href="/" className="btn-primary">
                        Back to Home
                    </Link>
                </div>
            </div>
        );
    }

    const currentPrice = selectedVariant?.price || product.price;

    return (
        <div className="min-h-screen bg-gray-100">
            {/* Header */}
            <header className="hidden lg:flex sticky top-0 z-40 bg-white border-b border-gray-200 h-16 items-center justify-center px-6">
                <h1 className="font-display font-bold text-xl text-gray-900">HIT BY HUMA</h1>
            </header>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Back Button */}
                <Link
                    href="/"
                    className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-8 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                    <span>Back to Shop</span>
                </Link>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    {/* Product Image */}
                    <div className="relative aspect-square bg-white rounded-2xl overflow-hidden shadow-sm">
                        {product.imageUrl ? (
                            <Image
                                src={product.imageUrl}
                                alt={product.name}
                                fill
                                className="object-cover"
                                sizes="(max-width: 1024px) 100vw, 50vw"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                                <ShoppingBag className="w-24 h-24 text-gray-300" />
                            </div>
                        )}
                        {product.categoryName && (
                            <span className="absolute top-4 left-4 bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-sm font-medium">
                                {product.categoryName}
                            </span>
                        )}
                    </div>

                    {/* Product Details */}
                    <div className="flex flex-col">
                        <h1 className="text-3xl lg:text-4xl font-display font-bold text-gray-900 mb-4">
                            {product.name}
                        </h1>

                        <p className="text-3xl font-bold text-primary-600 mb-6">
                            {formatPrice(currentPrice)}
                        </p>

                        {product.description && (
                            <p className="text-gray-600 mb-8 leading-relaxed">
                                {product.description}
                            </p>
                        )}

                        {/* Variants */}
                        {product.variants && product.variants.length > 1 && (
                            <div className="mb-8">
                                <label className="block text-sm font-medium text-gray-700 mb-3">
                                    Select Option
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {product.variants.map((variant) => (
                                        <button
                                            key={variant.id}
                                            onClick={() => setSelectedVariant(variant)}
                                            className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${selectedVariant?.id === variant.id
                                                ? 'border-primary-600 bg-primary-50 text-primary-700'
                                                : 'border-gray-200 hover:border-gray-300'
                                                }`}
                                        >
                                            {variant.name || variant.sku}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Quantity */}
                        <div className="mb-8">
                            <label className="block text-sm font-medium text-gray-700 mb-3">
                                Quantity
                            </label>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                    className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                >
                                    <Minus className="w-5 h-5" />
                                </button>
                                <span className="text-xl font-semibold w-12 text-center">{quantity}</span>
                                <button
                                    onClick={() => setQuantity(quantity + 1)}
                                    className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Add to Cart */}
                        <button
                            onClick={handleAddToCart}
                            disabled={!selectedVariant}
                            className={`w-full py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-3 transition-all ${added
                                ? 'bg-green-500 text-white'
                                : 'bg-primary-600 text-white hover:bg-primary-700'
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            {added ? (
                                <>
                                    <Check className="w-6 h-6" />
                                    Added to Cart!
                                </>
                            ) : (
                                <>
                                    <ShoppingBag className="w-6 h-6" />
                                    Add to Cart - {formatPrice(currentPrice * quantity)}
                                </>
                            )}
                        </button>

                        {/* SKU Info */}
                        {selectedVariant && (
                            <p className="mt-4 text-sm text-gray-500">
                                SKU: {selectedVariant.sku}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
