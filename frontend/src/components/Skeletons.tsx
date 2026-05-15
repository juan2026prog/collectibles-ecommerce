import React from 'react';
import { Sparkles } from 'lucide-react';

export const ProductSkeleton = ({ viewMode = 'grid' }: { viewMode?: 'grid' | 'list' }) => (
  <div className={`animate-pulse glass overflow-hidden flex ${viewMode === 'list' ? 'flex-row  h-48' : 'flex-col  h-full'}`}>
    <div className={`bg-white/10 ${viewMode === 'list' ? 'w-48 shrink-0 h-full' : 'aspect-square w-full'}`} />
    <div className="p-5 flex flex-col flex-1 justify-between">
      <div>
        <div className="h-2 w-1/3 bg-gray-200 rounded mb-3" />
        <div className="h-4 w-3/4 bg-gray-200 rounded mb-2" />
        <div className="h-4 w-1/2 bg-gray-200 rounded" />
      </div>
      <div className="h-5 w-1/4 bg-gray-200 rounded mt-4" />
    </div>
  </div>
);

export const CategoryGridSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-[600px]">
    <div className="bg-gray-200 animate-pulse  md:col-span-2 h-[300px] md:h-full" />
    <div className="flex flex-col gap-6 h-[300px] md:h-full">
      <div className="bg-gray-200 animate-pulse  flex-1" />
      <div className="bg-gray-200 animate-pulse  flex-1" />
    </div>
  </div>
);

export const BannerSkeleton = () => (
  <div className="absolute inset-0 bg-gray-900 animate-pulse flex items-center justify-center">
    <Sparkles className="w-12 h-12 text-gray-700 animate-spin" />
  </div>
);

export const BrandCarouselSkeleton = () => (
  <div className="border-y border-white/10 bg-white py-8 flex items-center justify-center gap-12 overflow-hidden px-10">
    {[...Array(6)].map((_, i) => <div key={i} className="h-12 w-32 bg-white/10 rounded animate-pulse shrink-0" />)}
  </div>
);

export const CollectionCarouselSkeleton = () => (
  <div className="flex overflow-x-auto gap-6 pb-8 -mx-6 px-6 scrollbar-hide">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="shrink-0 w-[240px] sm:w-[280px]">
        <ProductSkeleton viewMode="grid" />
      </div>
    ))}
  </div>
);

export const PageSkeleton = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="flex flex-col items-center gap-4">
      <Sparkles className="w-8 h-8 text-black animate-spin" />
      <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
    </div>
  </div>
);
