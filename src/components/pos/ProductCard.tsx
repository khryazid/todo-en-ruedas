import { memo } from 'react';
import { Plus } from 'lucide-react';
import type { Product } from '../../types';
import { formatCurrency } from '../../utils/pricing';

interface ProductCardProps {
  product: Product;
  priceUSD: number;
  onAdd: (product: Product) => void;
}

export const ProductCard = memo(({ product, priceUSD, onAdd }: ProductCardProps) => {
  const isOutOfStock = product.stock === 0;

  return (
    <div
      onClick={() => !isOutOfStock && onAdd(product)}
      className={`relative flex flex-col justify-between p-3 md:p-4 rounded-2xl border shadow-sm transition-all duration-200 active:scale-95 cursor-pointer h-full group select-none ${isOutOfStock ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed' : 'bg-white border-gray-100 hover:shadow-md hover:border-red-200'} md:min-h-[150px] min-h-[165px]`}
    >
      <div>
        <div className="flex justify-between items-start mb-1">
          <span className="text-[10px] font-mono font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{product.sku}</span>
          <span className={`text-[11px] font-black px-2 py-1 rounded-lg ${product.stock === 0 ? 'bg-red-50 text-red-700' : product.stock <= product.minStock ? 'bg-orange-50 text-orange-700 border-orange-100' : 'bg-green-50 text-green-700 border-green-100'}`}>{product.stock} un.</span>
        </div>
        <h3 className="text-[13px] md:text-sm font-bold text-gray-700 leading-snug line-clamp-3 min-h-[2.8rem] mb-2 group-hover:text-red-600 transition-colors" title={product.name}>{product.name}</h3>
      </div>
      <div className="mt-auto pt-3 border-t border-dashed border-gray-100 flex justify-between items-end">
        <div className="flex flex-col"><span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">Precio</span><span className="text-lg md:text-lg font-black text-gray-900 leading-none">{formatCurrency(priceUSD, 'USD')}</span></div>
        {!isOutOfStock && <div className="bg-red-50 text-red-600 w-10 h-10 rounded-xl flex items-center justify-center shadow-sm group-hover:bg-red-600 group-hover:text-white transition-all duration-300"><Plus size={20} strokeWidth={3} /></div>}
      </div>
    </div>
  );
});
