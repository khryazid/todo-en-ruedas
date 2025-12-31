export type Role = 'ADMIN' | 'SELLER';
export type CostType = 'BCV' | 'TH'; // <--- CAMBIO CLAVE: Tipo de Dolar de Compra

export interface GlobalSettings {
  tasaBCV: number;
  tasaTH: number;
  defaultMargin: number;
  defaultVAT: number;
  lastUpdated: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  stock: number;
  minStock: number;
  
  // Costos
  cost: number;       // El valor numérico en Dólares (ej: 10)
  costType: CostType; // ¿Pagué esos 10 a tasa BCV o tasa TH?
  
  // Personalización
  customMargin?: number; 
  customVAT?: number;
}

export interface CartItem extends Product {
  quantity: number;
  calculatedPriceUSD: number; 
  calculatedPriceVED: number;
}

export interface Sale {
  id: string;
  date: string;
  totalUSD: number;
  totalVED: number;
  items: CartItem[];
}