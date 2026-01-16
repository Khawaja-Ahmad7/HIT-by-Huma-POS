import { Suspense } from 'react';
import ProductPageClient from './ProductPageClient';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

// Generate static params for all products at build time
export async function generateStaticParams() {
    try {
        const response = await fetch(`${API_URL}/products`, { cache: 'no-store' });
        if (!response.ok) {
            console.error('Failed to fetch products for static generation');
            return [];
        }
        const data = await response.json();
        const products = data.products || [];
        return products.map((product: { id: number }) => ({
            id: String(product.id),
        }));
    } catch (error) {
        console.error('Error generating static params:', error);
        return [];
    }
}

export default function ProductPage({ params }: { params: { id: string } }) {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <div className="animate-pulse text-gray-400">Loading...</div>
            </div>
        }>
            <ProductPageClient productId={params.id} />
        </Suspense>
    );
}
