'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle2,
  Clock,
  Search,
  Calendar,
  RefreshCw,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import type { Room, GeneralCleaning } from '@/lib/types';

interface RoomWithGC extends Room {
  general_cleaning: GeneralCleaning[];
}

export default function GeneralCleaningPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<RoomWithGC[]>([]);
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [updating, setUpdating] = useState<string | null>(null);

  const isSupervisor = profile?.role === 'supervisor';
  const isAdmin = profile?.role === 'admin';
  const isManager = profile?.role === 'manager';
  const canToggle = isSupervisor || isAdmin || isManager;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data: roomsData } = await supabase
      .from('rooms')
      .select('id, room_number, room_type_id, created_at, room_types(id, name)')
      .order('room_number', { ascending: true });

    const { data: gcData } = await supabase
      .from('general_cleaning')
      .select('id, room_id, status, completed_by, completed_at, date, profiles(name, email)')
      .eq('date', selectedDate);

    const gcByRoom = new Map<string, GeneralCleaning>();
    (gcData ?? []).forEach((g) => gcByRoom.set(g.room_id, g as unknown as GeneralCleaning));

    const merged = (roomsData ?? []).map((r) => ({
      ...r,
      room_types: Array.isArray(r.room_types) ? r.room_types[0] ?? null : r.room_types,
      general_cleaning: gcByRoom.has(r.id) ? [gcByRoom.get(r.id)!] : [],
    })) as RoomWithGC[];

    setRooms(merged);
    setLoading(false);
  }, [selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function toggleCleaning(room: RoomWithGC) {
    if (!user) return;
    const existing = room.general_cleaning[0];
    setUpdating(room.id);

    if (existing) {
      const newStatus = existing.status === 'done' ? 'pending' : 'done';
      const { error } = await supabase
        .from('general_cleaning')
        .update({
          status: newStatus,
          completed_by: newStatus === 'done' ? user.id : null,
          completed_at: newStatus === 'done' ? new Date().toISOString() : null,
        })
        .eq('id', existing.id);

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({
          title: newStatus === 'done' ? 'Room marked as done' : 'Room marked as pending',
          description: `Room ${room.room_number} has been updated.`,
        });
        fetchData();
      }
    } else {
      const { error } = await supabase.from('general_cleaning').insert({
        room_id: room.id,
        status: 'done',
        completed_by: user.id,
        completed_at: new Date().toISOString(),
        date: selectedDate,
      });

      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
      } else {
        toast({
          title: 'Room marked as done',
          description: `Room ${room.room_number} has been marked as cleaned.`,
        });
        fetchData();
      }
    }
    setUpdating(null);
  }

  const filteredRooms = rooms.filter((r) =>
    r.room_number.toLowerCase().includes(search.toLowerCase())
  );

  const doneCount = filteredRooms.filter(
    (r) => r.general_cleaning[0]?.status === 'done'
  ).length;
  const totalCount = filteredRooms.length;
  const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="General Cleaning"
        description="Track and manage daily room cleaning progress."
        action={
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      />

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card className="card-shadow-lg">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
              </div>
              <div>
                <p className="font-display text-2xl font-bold">{doneCount}</p>
                <p className="text-sm text-muted-foreground">Rooms Completed</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1 }}>
          <Card className="card-shadow-lg">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="font-display text-2xl font-bold">{totalCount - doneCount}</p>
                <p className="text-sm text-muted-foreground">Rooms Pending</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.2 }}>
          <Card className="card-shadow-lg">
            <CardContent className="p-5">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Daily Progress</span>
                <span className="font-display text-lg font-bold">{progress}%</span>
              </div>
              <Progress value={progress} className="h-3 [&>div]:gold-gradient" />
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search room number..."
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="date"
            className="pl-10 sm:w-auto"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </div>
      </div>

      {/* Room grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg border bg-muted/50" />
          ))}
        </div>
      ) : filteredRooms.length === 0 ? (
        <Card className="card-shadow-lg">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-muted-foreground">No rooms found. Add rooms in Room Management first.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredRooms.map((room, i) => {
            const gc = room.general_cleaning[0];
            const isDone = gc?.status === 'done';
            return (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.03 }}
              >
                <Card
                  className={`card-shadow-lg cursor-pointer transition-all hover:scale-[1.02] ${
                    isDone ? 'border-emerald-200 bg-emerald-50/50' : ''
                  }`}
                  onClick={() => canToggle && toggleCleaning(room)}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-display text-xl font-bold">{room.room_number}</p>
                        <Badge variant="outline" className="mt-1 text-xs">
                          {room.room_types?.name ?? 'Unassigned'}
                        </Badge>
                      </div>
                      <Checkbox
                        checked={isDone}
                        disabled={!canToggle || updating === room.id}
                        onCheckedChange={() => canToggle && toggleCleaning(room)}
                        onClick={(e) => e.stopPropagation()}
                        className="data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
                      />
                    </div>
                    <div className="mt-4">
                      {isDone ? (
                        <div className="flex items-center gap-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span className="text-emerald-700">
                            {gc?.profiles?.name ?? 'Completed'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          <span>Pending</span>
                        </div>
                      )}
                      {gc?.completed_at && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(gc.completed_at).toLocaleString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {!canToggle && (
        <p className="text-center text-sm text-muted-foreground">
          You have view-only access. Switch to a supervisor, manager, or admin account to update cleaning status.
        </p>
      )}
    </div>
  );
}
