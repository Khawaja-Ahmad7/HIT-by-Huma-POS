import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '@/components/Sidebar';
import { CartProvider } from '@/context/CartContext';

export const metadata: Metadata = {
    title: 'HIT BY HUMA - Fashion & Style',
    description: 'Discover the latest fashion trends at HIT BY HUMA. Shop premium clothing and accessories.',
    keywords: 'fashion, clothing, style, HIT BY HUMA, shopping',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>
                <CartProvider>
                    <div className="flex h-screen bg-gray-100">
                        <Sidebar />
                        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                            {/* Main content area with footer */}
                            <main className="flex-1 overflow-auto flex flex-col">
                                <div className="flex-1">
                                    {children}
                                </div>
                                <footer className="bg-gray-900 text-white py-12 mt-auto">
                                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                            <div>
                                                <h3 className="text-2xl font-display font-bold text-brand mb-4">HIT BY HUMA</h3>
                                                <p className="text-gray-400">Premium fashion for the modern lifestyle.</p>
                                            </div>
                                            <div>
                                                <h4 className="font-semibold mb-4">Contact</h4>
                                                <p className="text-gray-400">Phone: +92 300 1234567</p>
                                                <p className="text-gray-400">Email: info@hitbyhuma.com</p>
                                            </div>
                                            <div>
                                                <h4 className="font-semibold mb-4">Hours</h4>
                                                <p className="text-gray-400">Mon - Sat: 10am - 9pm</p>
                                                <p className="text-gray-400">Sunday: 12pm - 8pm</p>
                                            </div>
                                        </div>
                                        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-500">
                                            <p>&copy; {new Date().getFullYear()} HIT BY HUMA. All rights reserved.</p>
                                        </div>
                                    </div>
                                </footer>
                            </main>
                        </div>
                    </div>
                </CartProvider>
            </body>
        </html>
    );
}

