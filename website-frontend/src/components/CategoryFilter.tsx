'use client';

import { Category } from '@/lib/api';

interface CategoryFilterProps {
    categories: Category[];
    selected: number | null;
    onSelect: (id: number | null) => void;
}

export function CategoryFilter({ categories, selected, onSelect }: CategoryFilterProps) {
    return (
        <div className="flex flex-wrap justify-center gap-2 mb-8">
            <button
                onClick={() => onSelect(null)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${selected === null
                        ? 'bg-brand text-white shadow-lg shadow-brand/25'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
            >
                All
            </button>

            {categories.map((category) => (
                <button
                    key={category.id}
                    onClick={() => onSelect(category.id)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${selected === category.id
                            ? 'bg-brand text-white shadow-lg shadow-brand/25'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                >
                    {category.name}
                </button>
            ))}
        </div>
    );
}
