'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload, FileText, AlertTriangle, CheckCircle2, RefreshCw, Building2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';

interface ParsedRoom {
  room_number: string;
  room_type: string;
  section: string;
  floor: number | null;
}

export default function ImportRoomsPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [csvText, setCsvText] = useState('');
  const [parsed, setParsed] = useState<ParsedRoom[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);

  // Role guard: admin only
  useEffect(() => {
    if (!authLoading && profile && profile.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [authLoading, profile, router]);

  if (authLoading || !profile || profile.role !== 'admin') {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  function parseInput(text: string) {
    setParseError(null);
    setResult(null);
    const trimmed = text.trim();
    if (!trimmed) {
      setParsed([]);
      return;
    }

    // Support two input formats:
    // A) Plain CSV: room_number,room_type,section,floor
    //    e.g. 301,JSUIT,A,3
    // B) Spreadsheet-like: detect lines like "Section Gedung A" and "FLOOR 3 A" as section/floor markers
    //    and parse the room rows in between.

    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rooms: ParsedRoom[] = [];
    let currentSection = '';
    let currentFloor: number | null = null;

    for (const line of lines) {
      // Skip the spreadsheet title header
      if (/rooming list/i.test(line)) continue;
      if (/^room\s*number/i.test(line)) continue;
      if (/summary\s*project/i.test(line)) continue;
      if (/total\s*rooms|percentage/i.test(line)) continue;
      if (/^,+$/.test(line)) continue;

      // Section marker: "Section Gedung A" or just "Section A"
      const sectionMatch = line.match(/section\s+(?:gedung\s+)?([A-Z])/i);
      if (sectionMatch) {
        currentSection = sectionMatch[1].toUpperCase();
        continue;
      }

      // Floor marker: "FLOOR 3 A" or "FLOOR 3"
      const floorMatch = line.match(/floor\s+(\d+)(?:\s+([A-Z]))?/i);
      if (floorMatch) {
        currentFloor = parseInt(floorMatch[1], 10);
        if (floorMatch[2]) currentSection = floorMatch[2].toUpperCase();
        continue;
      }

      // CSV row: try comma-separated first
      const cols = line.split(',').map((c) => c.trim()).filter(Boolean);
      if (cols.length >= 1) {
        const room_number = cols[0];
        // Validate room number looks like a number
        if (!/^\d+$/.test(room_number)) continue;
        const room_type = cols[1] || 'DLX';
        const section = cols[2] || currentSection || 'A';
        let floor: number | null = cols[3] ? parseInt(cols[3], 10) : currentFloor;
        if (cols[3] && isNaN(floor as number)) floor = currentFloor;
        // Auto-derive floor from room number if still null (e.g. 301 → 3)
        if (floor === null && room_number.length >= 3) {
          floor = parseInt(room_number.charAt(0), 10);
        }
        rooms.push({ room_number, room_type, section, floor });
      }
    }

    if (rooms.length === 0) {
      setParseError('No valid room rows detected. Each row should start with a room number.');
      setParsed([]);
      return;
    }
    setParsed(rooms);
  }

  async function handleImport() {
    if (parsed.length === 0) return;
    setImporting(true);
    setResult(null);

    // 1. Fetch or create room types
    const typeSet = new Set(parsed.map((r) => r.room_type));
    const { data: existingTypes } = await supabase.from('room_types').select('id, name');
    const typeMap = new Map<string, string>();
    (existingTypes ?? []).forEach((t: any) => typeMap.set(t.name, t.id));

    for (const typeName of Array.from(typeSet)) {
      if (!typeMap.has(typeName)) {
        const { data, error } = await supabase.from('room_types').insert({ name: typeName }).select('id, name').single();
        if (error) {
          toast({ title: `Failed to create room type "${typeName}"`, description: error.message, variant: 'destructive' });
          setImporting(false);
          return;
        }
        typeMap.set(typeName, (data as any).id);
      }
    }

    // 2. Fetch existing room numbers to skip duplicates
    const { data: existingRooms } = await supabase.from('rooms').select('room_number');
    const existingNumbers = new Set((existingRooms ?? []).map((r: any) => r.room_number));

    const toInsert = parsed
      .filter((r) => !existingNumbers.has(r.room_number))
      .map((r) => ({
        room_number: r.room_number,
        room_type_id: typeMap.get(r.room_type)!,
        section: r.section,
        floor: r.floor,
      }));

    const skipped = parsed.length - toInsert.length;

    if (toInsert.length === 0) {
      setResult({ inserted: 0, skipped, errors: [] });
      toast({ title: 'Nothing to import', description: `${skipped} room(s) already exist.` });
      setImporting(false);
      return;
    }

    // 3. Insert in batches of 100
    const errors: string[] = [];
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += 100) {
      const batch = toInsert.slice(i, i + 100);
      const { error } = await supabase.from('rooms').insert(batch);
      if (error) {
        errors.push(`Batch ${Math.floor(i / 100) + 1}: ${error.message}`);
      } else {
        inserted += batch.length;
      }
    }

    setResult({ inserted, skipped, errors });
    if (errors.length === 0) {
      toast({ title: 'Import complete', description: `${inserted} room(s) imported, ${skipped} skipped.` });
    } else {
      toast({ title: 'Import partial', description: `${inserted} imported, ${errors.length} batch errors.`, variant: 'destructive' });
    }
    setImporting(false);
  }

  function loadTemplate() {
    setCsvText(`Section Gedung A
FLOOR 3 A
301,JSUIT,A,3
302,JSUIT,A,3
303,DLX,A,3
FLOOR 4 A
401,JSUIT,A,4
402,JSUIT,A,4
403,DLX,A,4
Section Gedung C
FLOOR 2 C
201,DLX,C,2
202,DLX,C,2
203,DLX,C,2`);
    parseInput(`Section Gedung A
FLOOR 3 A
301,JSUIT,A,3
302,JSUIT,A,3
303,DLX,A,3
FLOOR 4 A
401,JSUIT,A,4
402,JSUIT,A,4
403,DLX,A,4
Section Gedung C
FLOOR 2 C
201,DLX,C,2
202,DLX,C,2
203,DLX,C,2`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import Rooms"
        description="Bulk import rooms from a CSV or paste from your spreadsheet. Auto-creates room types."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input panel */}
        <Card className="card-shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                CSV Input
              </CardTitle>
              <Button variant="outline" size="sm" onClick={loadTemplate}>
                Load Sample
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="csv-input">Paste rooms here</Label>
              <Textarea
                id="csv-input"
                placeholder={`Supported formats:

A) Plain CSV (room_number, room_type, section, floor):
301,JSUIT,A,3
302,JSUIT,A,3

B) Spreadsheet-like (auto-detect section & floor markers):
Section Gedung A
FLOOR 3 A
301,JSUIT
302,JSUIT
FLOOR 4 A
401,JSUIT
...`}
                value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value);
                  parseInput(e.target.value);
                }}
                rows={14}
                className="font-mono text-xs"
              />
            </div>
            {parseError && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{parseError}</span>
              </div>
            )}
            <Button
              onClick={handleImport}
              disabled={parsed.length === 0 || importing}
              className="w-full gold-gradient text-navy hover:opacity-90"
            >
              {importing ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Import {parsed.length > 0 ? `${parsed.length} Room${parsed.length > 1 ? 's' : ''}` : ''}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Preview panel */}
        <Card className="card-shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Preview
              </CardTitle>
              {parsed.length > 0 && <Badge variant="outline">{parsed.length} rooms ready</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            {parsed.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
                <FileText className="h-8 w-8 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">Paste CSV on the left to preview parsed rooms.</p>
              </div>
            ) : (
              <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                {/* Group by section → floor */}
                {Object.entries(
                  parsed.reduce((acc, r) => {
                    const key = `${r.section}|${r.floor ?? '?'}`;
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(r);
                    return acc;
                  }, {} as Record<string, ParsedRoom[]>)
                ).map(([key, groupRooms]) => {
                  const [section, floorStr] = key.split('|');
                  return (
                    <div key={key}>
                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                        Section {section} — Floor {floorStr}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {groupRooms.map((r) => (
                          <Badge key={r.room_number} variant="outline" className="text-xs">
                            {r.room_number}
                            <span className="ml-1 text-muted-foreground">·{r.room_type}</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Result panel */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className={`card-shadow-lg ${result.errors.length > 0 ? 'border-amber-200' : 'border-emerald-200'}`}>
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                {result.errors.length > 0 ? (
                  <AlertTriangle className="h-6 w-6 text-amber-600 flex-shrink-0" />
                ) : (
                  <CheckCircle2 className="h-6 w-6 text-emerald-600 flex-shrink-0" />
                )}
                <div className="flex-1">
                  <p className="font-medium">
                    {result.inserted > 0 ? `Imported ${result.inserted} room(s)` : 'No new rooms imported'}
                    {result.skipped > 0 && ` · ${result.skipped} already existed (skipped)`}
                  </p>
                  {result.errors.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {result.errors.map((e, i) => (
                        <p key={i} className="text-xs text-red-700">{e}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
