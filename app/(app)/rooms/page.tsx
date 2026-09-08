'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  DoorOpen,
  Plus,
  Trash2,
  Edit2,
  Search,
  RefreshCw,
  Building2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { Room, RoomType } from '@/lib/types';

export default function RoomsPage() {
  const { profile } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [search, setSearch] = useState('');

  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [typeDialogOpen, setTypeDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [deleteRoom, setDeleteRoom] = useState<Room | null>(null);
  const [newRoomNumber, setNewRoomNumber] = useState('');
  const [newRoomType, setNewRoomType] = useState('');
  const [newTypeName, setNewTypeName] = useState('');

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('rooms')
      .select('id, room_number, room_type_id, created_at, room_types(id, name)')
      .order('room_number', { ascending: true });
    setRooms((data ?? []) as unknown as Room[]);
    setLoading(false);
  }, []);

  const fetchRoomTypes = useCallback(async () => {
    const { data } = await supabase
      .from('room_types')
      .select('id, name, created_at')
      .order('name', { ascending: true });
    setRoomTypes(data ?? []);
  }, []);

  useEffect(() => {
    if (profile && profile.role !== 'admin') {
      router.replace('/dashboard');
      return;
    }
    fetchRooms();
    fetchRoomTypes();
  }, [profile, router, fetchRooms, fetchRoomTypes]);

  async function handleSaveRoom() {
    if (!newRoomNumber.trim()) return;
    if (editingRoom) {
      const { error } = await supabase
        .from('rooms')
        .update({
          room_number: newRoomNumber.trim(),
          room_type_id: newRoomType || null,
        })
        .eq('id', editingRoom.id);
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Room Updated', description: `Room ${newRoomNumber} has been updated.` });
        setRoomDialogOpen(false);
        setEditingRoom(null);
        setNewRoomNumber('');
        setNewRoomType('');
        fetchRooms();
      }
    } else {
      const { error } = await supabase.from('rooms').insert({
        room_number: newRoomNumber.trim(),
        room_type_id: newRoomType || null,
      });
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: 'Room Added', description: `Room ${newRoomNumber} has been created.` });
        setRoomDialogOpen(false);
        setNewRoomNumber('');
        setNewRoomType('');
        fetchRooms();
      }
    }
  }

  async function handleDeleteRoom() {
    if (!deleteRoom) return;
    const { error } = await supabase.from('rooms').delete().eq('id', deleteRoom.id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Room Deleted', description: `Room ${deleteRoom.room_number} has been removed.` });
      setDeleteRoom(null);
      fetchRooms();
    }
  }

  async function handleAddRoomType() {
    if (!newTypeName.trim()) return;
    const { error } = await supabase.from('room_types').insert({ name: newTypeName.trim() });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Room Type Added', description: `${newTypeName} has been added.` });
      setNewTypeName('');
      setTypeDialogOpen(false);
      fetchRoomTypes();
    }
  }

  function openEditRoom(room: Room) {
    setEditingRoom(room);
    setNewRoomNumber(room.room_number);
    setNewRoomType(room.room_type_id ?? '');
    setRoomDialogOpen(true);
  }

  function openAddRoom() {
    setEditingRoom(null);
    setNewRoomNumber('');
    setNewRoomType('');
    setRoomDialogOpen(true);
  }

  const filteredRooms = rooms.filter((r) =>
    r.room_number.toLowerCase().includes(search.toLowerCase()) ||
    r.room_types?.name?.toLowerCase().includes(search.toLowerCase())
  );

  if (profile && profile.role !== 'admin') {
    return null;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Room Management"
        description="Manage room numbers and room types for general cleaning."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setTypeDialogOpen(true)}>
              <Building2 className="mr-2 h-4 w-4" />
              Add Room Type
            </Button>
            <Button className="gold-gradient text-navy hover:opacity-90" size="sm" onClick={openAddRoom}>
              <Plus className="mr-2 h-4 w-4" />
              Add Room
            </Button>
          </div>
        }
      />

      {/* Room types summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {roomTypes.map((type, i) => {
          const count = rooms.filter((r) => r.room_type_id === type.id).length;
          return (
            <motion.div
              key={type.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <Card className="card-shadow-lg">
                <CardContent className="p-4 text-center">
                  <p className="font-display text-2xl font-bold text-navy">{count}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{type.name}</p>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search rooms..."
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Rooms table */}
      <Card className="card-shadow-lg">
        <CardContent className="p-0">
          <div className="overflow-hidden rounded-lg">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Room Number</TableHead>
                  <TableHead>Room Type</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 4 }).map((_, j) => (
                        <TableCell key={j}><div className="h-4 w-24 animate-pulse rounded bg-muted" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filteredRooms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      No rooms found. Click "Add Room" to create one.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRooms.map((room) => (
                    <TableRow key={room.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy text-xs font-bold text-white">
                            {room.room_number.slice(0, 3)}
                          </div>
                          <span className="font-medium">{room.room_number}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{room.room_types?.name ?? 'Unassigned'}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(room.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditRoom(room)}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => setDeleteRoom(room)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Room Dialog */}
      <Dialog open={roomDialogOpen} onOpenChange={setRoomDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRoom ? 'Edit Room' : 'Add New Room'}</DialogTitle>
            <DialogDescription>
              {editingRoom ? 'Update room details.' : 'Create a new room for general cleaning tracking.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Room Number</Label>
              <Input
                placeholder="e.g. 101"
                value={newRoomNumber}
                onChange={(e) => setNewRoomNumber(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveRoom(); }}
              />
            </div>
            <div className="space-y-2">
              <Label>Room Type</Label>
              <Select value={newRoomType} onValueChange={setNewRoomType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select room type" />
                </SelectTrigger>
                <SelectContent>
                  {roomTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoomDialogOpen(false)}>Cancel</Button>
            <Button className="gold-gradient text-navy hover:opacity-90" onClick={handleSaveRoom}>
              {editingRoom ? 'Save Changes' : 'Add Room'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Room Type Dialog */}
      <Dialog open={typeDialogOpen} onOpenChange={setTypeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Room Type</DialogTitle>
            <DialogDescription>
              Create a new room category (e.g. Deluxe, Suite, Standard).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Type Name</Label>
              <Input
                placeholder="e.g. Deluxe Suite"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddRoomType(); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTypeDialogOpen(false)}>Cancel</Button>
            <Button className="gold-gradient text-navy hover:opacity-90" onClick={handleAddRoomType}>
              Add Type
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Room Dialog */}
      <Dialog open={!!deleteRoom} onOpenChange={(open) => !open && setDeleteRoom(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Room?</DialogTitle>
            <DialogDescription>
              This will permanently delete room {deleteRoom?.room_number} and all its cleaning records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteRoom(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteRoom}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
