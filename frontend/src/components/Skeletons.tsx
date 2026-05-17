import React from 'react';
import { Sparkles } from 'lucide-react';

export const ProductSkeleton = ({ viewMode = 'grid' }: { viewMode?: 'grid' | 'list' }) => (
  <div className={`animate-pulse overflow-hidden flex ${viewMode === 'list' ? 'flex-row h-48 border border-white/5 rounded-2xl' : 'flex-col w-full'}`}>
    <div className={`bg-white/5 ${viewMode === 'list' ? 'w-48 shrink-0 h-full' : 'aspect-square w-full rounded-none mb-3'}`} />
    <div className={`flex flex-col ${viewMode === 'list' ? 'flex-1 p-6 justify-between' : 'px-1 gap-2'}`}>
      <div className="space-y-2">
        <div className="h-2 w-1/4 bg-white/5 rounded" />
        <div className="h-3 w-3/4 bg-white/5 rounded" />
        <div className="h-3 w-1/2 bg-white/5 rounded" />
      </div>
      <div className="mt-2 h-4 w-1/3 bg-[#f00856]/10 rounded" />
    </div>
  </div>
);

export const CategoryGridSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 h-[700px]">
    <div className="bg-white/5 animate-pulse rounded-[2.5rem] md:col-span-2 md:row-span-2" />
    <div className="bg-white/5 animate-pulse rounded-[2.5rem]" />
    <div className="bg-white/5 animate-pulse rounded-[2.5rem]" />
  </div>
);

export const BannerSkeleton = () => (
  <div className="absolute inset-0 bg-gray-900 animate-pulse flex items-center justify-center">
    <Sparkles className="w-12 h-12 text-gray-700 animate-spin" />
  </div>
);

export const BrandCarouselSkeleton = () => (
  <div className="border-y border-white/10 py-8 flex items-center justify-center gap-12 overflow-hidden px-10">
    {[...Array(6)].map((_, i) => <div key={i} className="h-12 w-32 bg-white/10 rounded animate-pulse shrink-0" />)}
  </div>
);

export const CollectionCarouselSkeleton = () => (
  <div className="flex overflow-x-auto gap-6 pb-8 -mx-6 px-6 scrollbar-hide">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="shrink-0 w-[220px] sm:w-[240px]">
        <ProductSkeleton viewMode="grid" />
      </div>
    ))}
  </div>
);

export const PageSkeleton = () => (
  <div className="min-h-screen flex items-center justify-center bg-[#05070f]">
    <div className="flex flex-col items-center gap-4">
      <Sparkles className="w-8 h-8 text-[#f00856] animate-spin" />
      <div className="h-4 w-32 bg-white/10 rounded animate-pulse" />
    </div>
  </div>
);
