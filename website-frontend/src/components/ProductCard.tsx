'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { ShoppingBag, Plus, Check } from 'lucide-react';
import { Product, Variant } from '@/lib/api';
import { useCart } from '@/context/CartContext';

interface ProductCardProps {
    product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
    const { addItem } = useCart();
    const [selectedVariant, setSelectedVariant] = useState<Variant | null>(
        product.variants?.[0] || null
    );
    const [showVariants, setShowVariants] = useState(false);
    const [added, setAdded] = useState(false);

    const currentPrice = selectedVariant?.price || product.price;

    const handleAddToCart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedVariant) return;

        addItem(product, selectedVariant, 1);
        setAdded(true);
        setTimeout(() => setAdded(false), 2000);
    };

    const formatPrice = (price: number) => {
        return `Rs. ${price.toLocaleString()}`;
    };

    return (
        <Link href={`/product/${product.id}`} className="product-card group block cursor-pointer">
            {/* Product Image */}
            <div className="relative aspect-square bg-gray-100 overflow-hidden">
                {product.imageUrl ? (
                    <Image
                        src={product.imageUrl}
                        alt={product.name}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                        <ShoppingBag className="w-12 h-12 text-gray-300" />
                    </div>
                )}

                {/* Quick Add Button */}
                <button
                    onClick={handleAddToCart}
                    disabled={!selectedVariant}
                    className={`absolute bottom-3 right-3 p-3 rounded-full shadow-lg transition-all duration-300
            ${added
                            ? 'bg-green-500 text-white'
                            : 'bg-white text-brand hover:bg-brand hover:text-white'
                        }
            opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0
            disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                    {added ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                </button>

                {/* Category Badge */}
                {product.categoryName && (
                    <span className="absolute top-3 left-3 badge-brand text-xs">
                        {product.categoryName}
                    </span>
                )}
            </div>

            {/* Product Info */}
            <div className="p-4">
                <h3 className="font-semibold text-gray-900 mb-1 line-clamp-2 group-hover:text-brand transition-colors">
                    {product.name}
                </h3>

                {/* Variants selector */}
                {product.variants && product.variants.length > 1 && (
                    <div className="mb-2">
                        <button
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowVariants(!showVariants); }}
                            className="text-xs text-gray-500 hover:text-brand"
                        >
                            {product.variants.length} options
                        </button>

                        {showVariants && (
                            <div className="mt-2 flex flex-wrap gap-1">
                                {product.variants.map((variant) => (
                                    <button
                                        key={variant.id}
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedVariant(variant); }}
                                        className={`text-xs px-2 py-1 rounded-md border transition-colors ${selectedVariant?.id === variant.id
                                            ? 'border-brand bg-brand/10 text-brand'
                                            : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        {variant.name || variant.sku}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-brand">
                        {formatPrice(currentPrice)}
                    </span>
                </div>
            </div>
        </Link>
    );
}
