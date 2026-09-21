'use client';

import React from 'react';
import { categoryOptions } from '../lib/categoryFilter';

interface CategoryPillBarProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

export const CategoryPillBar: React.FC<CategoryPillBarProps> = ({ selectedCategory, onSelectCategory }) => {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none max-w-full">
      {categoryOptions.map((cat) => {
        const isActive = selectedCategory === cat.id;
        return (
          <button
            key={cat.id}
            onClick={() => onSelectCategory(cat.id)}
            className={`px-4 py-2 text-xs font-medium rounded-full whitespace-nowrap transition duration-200 ${
              isActive
                ? 'bg-olivePrimary text-white shadow-sm'
                : 'bg-[#EFECE3] text-charcoalText hover:bg-[#E5E1D5]'
            }`}
          >
            {cat.label}
          </button>
        );
      })}
    </div>
  );
};
