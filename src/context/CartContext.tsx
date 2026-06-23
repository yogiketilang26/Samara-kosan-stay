import React, { createContext, useContext, useState } from 'react';
import { Room, Property } from '../types';

interface CartItem {
  property: Property;
  room: Room;
  periodType: 'monthly' | 'daily';
  duration: number; // Months or days
}

interface CartContextType {
  cartItem: CartItem | null;
  addToCart: (property: Property, room: Room, periodType: 'monthly' | 'daily', duration: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cartItem, setCartItem] = useState<CartItem | null>(null);

  const addToCart = (property: Property, room: Room, periodType: 'monthly' | 'daily', duration: number) => {
    setCartItem({ property, room, periodType, duration });
  };

  const clearCart = () => {
    setCartItem(null);
  };

  return (
    <CartContext.Provider value={{ cartItem, addToCart, clearCart }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used inside a CartProvider');
  }
  return context;
};
