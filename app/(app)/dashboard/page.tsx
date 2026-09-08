'use client';

import { motion } from 'framer-motion';
import {
  DoorOpen,
  CheckCircle2,
  Clock,
  TrendingUp,
  Sparkles,
  Award,
  Calendar,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { PageHeader } from '@/components/layout/page-header';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import { MONTH_NAMES } from '@/lib/types';

export default function DashboardPage() {
  const { stats } = useDashboardStats();
  const currentMonth = MONTH_NAMES[new Date().getMonth()];

  const pieData = [
    { name: 'Completed', value: stats.completedToday, color: 'hsl(142, 71%, 45%)' },
    { name: 'Remaining', value: stats.remainingToday, color: 'hsl(43, 74%, 50%)' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Welcome back — here's your housekeeping overview for ${currentMonth}.`}
      />

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Rooms"
          value={stats.totalRooms}
          icon={DoorOpen}
          variant="navy"
          delay={0}
        />
        <StatCard
          label="Completed Today"
          value={stats.completedToday}
          icon={CheckCircle2}
          variant="success"
          delay={0.1}
          sublabel={`${stats.dailyProgress}% progress`}
        />
        <StatCard
          label="Remaining"
          value={stats.remainingToday}
          icon={Clock}
          variant="warning"
          delay={0.2}
          sublabel="Rooms pending cleaning"
        />
        <StatCard
          label="Special Projects"
          value={stats.specialProjects}
          icon={Sparkles}
          variant="gold"
          delay={0.3}
          sublabel={`${stats.specialCompleted}/${stats.specialTotal} items done`}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Progress chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="lg:col-span-2"
        >
          <Card className="card-shadow-lg h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Weekly Cleaning Progress</CardTitle>
                  <p className="text-sm text-muted-foreground">Daily completed cleaning overview</p>
                </div>
                <TrendingUp className="h-5 w-5 text-gold" />
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={stats.monthlyData}>
                  <defs>
                    <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(43, 74%, 50%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(43, 74%, 50%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(40, 10%, 90%)" />
                  <XAxis dataKey="date" stroke="hsl(215, 16%, 47%)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(215, 16%, 47%)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '8px',
                      border: '1px solid hsl(40, 10%, 88%)',
                      background: 'hsl(0, 0%, 100%)',
                      fontSize: '13px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="completed"
                    stroke="hsl(43, 74%, 50%)"
                    strokeWidth={2}
                    fill="url(#colorCompleted)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </motion.div>

        {/* Today's progress pie */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
        >
          <Card className="card-shadow-lg h-full">
            <CardHeader>
              <CardTitle className="text-lg">Today's Progress</CardTitle>
              <p className="text-sm text-muted-foreground">General cleaning status</p>
            </CardHeader>
            <CardContent>
              <div className="relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={85}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid hsl(40, 10%, 88%)',
                        background: 'hsl(0, 0%, 100%)',
                        fontSize: '13px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute flex flex-col items-center">
                  <span className="font-display text-3xl font-bold">{stats.dailyProgress}%</span>
                  <span className="text-xs text-muted-foreground">Complete</span>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {pieData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ background: item.color }} />
                      <span className="text-muted-foreground">{item.name}</span>
                    </div>
                    <span className="font-medium">{item.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Bottom row: special project + recent activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Special cleaning progress */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.5 }}
        >
          <Card className="card-shadow-lg h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Special Cleaning Progress</CardTitle>
                  <p className="text-sm text-muted-foreground">Monthly project overview</p>
                </div>
                <Award className="h-5 w-5 text-gold" />
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Overall Progress</span>
                  <span className="font-medium">{stats.specialProgress}%</span>
                </div>
                <Progress value={stats.specialProgress} className="h-3 [&>div]:gold-gradient" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="font-display text-2xl font-bold">{stats.specialProjects}</p>
                  <p className="text-xs text-muted-foreground">Projects</p>
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="font-display text-2xl font-bold text-emerald-600">{stats.specialCompleted}</p>
                  <p className="text-xs text-muted-foreground">Done</p>
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="font-display text-2xl font-bold text-amber-600">{stats.specialTotal - stats.specialCompleted}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.6 }}
        >
          <Card className="card-shadow-lg h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Recent Activity</CardTitle>
                  <p className="text-sm text-muted-foreground">Latest completed tasks</p>
                </div>
                <Calendar className="h-5 w-5 text-gold" />
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[240px] pr-4">
                {stats.recentActivity.length === 0 ? (
                  <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                    No recent activity yet
                  </div>
                ) : (
                  <div className="space-y-3">
                    {stats.recentActivity.map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-muted/50"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50">
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            Room {activity.room_number} cleaned
                          </p>
                          <p className="text-xs text-muted-foreground">
                            by {activity.completed_by}
                          </p>
                        </div>
                        {activity.completed_at && (
                          <Badge variant="secondary" className="text-xs">
                            {new Date(activity.completed_at).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
