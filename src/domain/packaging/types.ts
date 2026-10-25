// Veloria PoS — Domain: conditionnement produit (framework-free).

export interface Packaging {
  id: number;
  productId: number;
  labelFr: string;
  factor: number;
  sellingPriceMinor: number;
  purchasePriceMinor: number;
  autoCartonPricing: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}
