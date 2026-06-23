import { database } from '../lib/supabase';
import { Room } from '../types';

export const roomService = {
  async getAll(): Promise<Room[]> {
    return database.fetchRooms();
  },
  
  async save(room: Partial<Room>): Promise<Room> {
    return database.saveRoom(room);
  },
  
  async delete(id: number): Promise<boolean> {
    return database.deleteRoom(id);
  }
};
