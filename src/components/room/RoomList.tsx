import React from 'react';
import { Room } from '../../types';
import RoomCard from './RoomCard';
import { EmptyState } from '../common/EmptyState';

interface RoomListProps {
  rooms: Room[];
  onSelectRoom: (room: Room) => void;
}

export const RoomList: React.FC<RoomListProps> = ({ rooms, onSelectRoom }) => {
  return (
    <div className="space-y-4">
      {rooms.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map(room => (
            <RoomCard 
              key={room.id}
              room={room}
              onSelect={() => onSelectRoom(room)}
            />
          ))}
        </div>
      ) : (
        <EmptyState message="Tidak ada unit kamar kos aktif yang cocok." />
      )}
    </div>
  );
};

export default RoomList;
