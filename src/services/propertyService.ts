import { database } from '../lib/supabase';
import { Property } from '../types';

export const propertyService = {
  async getAll(): Promise<Property[]> {
    return database.fetchProperties();
  },
  
  async save(prop: Partial<Property>): Promise<Property> {
    return database.saveProperty(prop);
  },
  
  async delete(id: number): Promise<boolean> {
    return database.deleteProperty(id);
  }
};
