'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Sparkles, Mail, Lock, ArrowRight, Hotel } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import type { UserRole } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signUp, user, loading } = useAuth();
  const { toast } = useToast();

  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [signUpName, setSignUpName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpRole, setSignUpRole] = useState<UserRole>('supervisor');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    if (!signInEmail || !signInPassword) return;
    setSubmitting(true);
    const { error } = await signIn(signInEmail, signInPassword);
    setSubmitting(false);
    if (error) {
      toast({ title: 'Login Failed', description: error, variant: 'destructive' });
    } else {
      toast({ title: 'Welcome back!', description: 'You have been signed in successfully.' });
      router.push('/dashboard');
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    if (!signUpName || !signUpEmail || !signUpPassword || !signUpRole) return;
    if (signUpPassword.length < 6) {
      toast({ title: 'Password Too Short', description: 'Password must be at least 6 characters.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const { error } = await signUp(signUpEmail, signUpPassword, signUpName, signUpRole);
    setSubmitting(false);
    if (error) {
      toast({ title: 'Sign Up Failed', description: error, variant: 'destructive' });
    } else {
      toast({ title: 'Account Created', description: 'Please sign in with your credentials.' });
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-pulse">
          <Hotel className="h-12 w-12 text-gold" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      {/* Left brand panel */}
      <div className="relative hidden w-1/2 overflow-hidden navy-gradient lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 opacity-5">
          <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-gold blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-96 w-96 rounded-full bg-gold blur-3xl" />
        </div>
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg gold-gradient">
            <Hotel className="h-6 w-6 text-navy" />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold text-white">Housekeeping Manager</h1>
            <p className="text-sm text-white/60">Hotel Daily Project Management</p>
          </div>
        </div>

        <div className="relative z-10 space-y-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="font-display text-4xl font-semibold leading-tight text-white">
              Elevate your<br />housekeeping operations
            </h2>
            <p className="mt-4 max-w-md text-lg text-white/70">
              Track General Cleaning and Special Cleaning projects with precision.
              Real-time progress monitoring for your entire housekeeping team.
            </p>
          </motion.div>

          <div className="grid grid-cols-3 gap-4 max-w-md">
            {[
              { label: 'Real-time', value: 'Monitoring' },
              { label: 'Monthly', value: 'Projects' },
              { label: 'Detailed', value: 'Reports' },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 + i * 0.1 }}
                className="rounded-lg border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
              >
                <p className="text-xs text-gold uppercase tracking-wider">{stat.label}</p>
                <p className="mt-1 font-display text-lg text-white">{stat.value}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="relative z-10 text-sm text-white/40">
          Premium Hotel Management System
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex w-full items-center justify-center bg-background p-6 lg:w-1/2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg gold-gradient">
              <Hotel className="h-6 w-6 text-navy" />
            </div>
            <div>
              <h1 className="font-display text-xl font-semibold">Housekeeping Manager</h1>
              <p className="text-sm text-muted-foreground">Hotel Daily Project Management</p>
            </div>
          </div>

          <h2 className="font-display text-2xl font-semibold">Welcome</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to your account or create a new one to get started.
          </p>

          <Tabs defaultValue="signin" className="mt-8">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin" className="mt-6">
              <form onSubmit={handleSignIn} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="signin-email"
                      type="email"
                      placeholder="you@hotel.com"
                      className="pl-10"
                      value={signInEmail}
                      onChange={(e) => setSignInEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="signin-password"
                      type="password"
                      placeholder="••••••••"
                      className="pl-10"
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full gold-gradient text-navy hover:opacity-90" disabled={submitting}>
                  {submitting ? 'Signing in...' : 'Sign In'}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup" className="mt-6">
              <form onSubmit={handleSignUp} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Full Name</Label>
                  <Input
                    id="signup-name"
                    type="text"
                    placeholder="John Doe"
                    value={signUpName}
                    onChange={(e) => setSignUpName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@hotel.com"
                      className="pl-10"
                      value={signUpEmail}
                      onChange={(e) => setSignUpEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="Min 6 characters"
                      className="pl-10"
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-role">Role</Label>
                  <Select value={signUpRole} onValueChange={(v) => setSignUpRole(v as UserRole)}>
                    <SelectTrigger id="signup-role">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="supervisor">Supervisor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full gold-gradient text-navy hover:opacity-90" disabled={submitting}>
                  {submitting ? 'Creating account...' : 'Create Account'}
                  <Sparkles className="ml-2 h-4 w-4" />
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By continuing, you agree to the terms and conditions of this system.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
