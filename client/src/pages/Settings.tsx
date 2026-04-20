import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useUserStats, useUpdateSettings } from "@/hooks/use-user";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Loader2, Accessibility, Eye, Speaker } from "lucide-react";

export default function Settings() {
  const { data: stats, isLoading } = useUserStats();
  const updateMutation = useUpdateSettings();

  if (isLoading || !stats) return null;

  const handleToggle = (key: 'dyslexiaFont' | 'highContrast' | 'darkMode', value: boolean) => {
    updateMutation.mutate({ [key]: value });
  };

  const handleSpeedChange = (value: number[]) => {
    updateMutation.mutate({ voiceSpeed: value[0].toString() });
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto space-y-8">
        <div>
           <h1 className="font-heading text-3xl font-bold mb-2">Accessibility Settings</h1>
           <p className="text-muted-foreground">Customize your learning experience to fit your needs.</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Accessibility className="w-6 h-6 text-primary" />
              <CardTitle>Visual Aids</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base font-medium">Dyslexia Friendly Font</Label>
                <p className="text-sm text-muted-foreground">
                  Use OpenDyslexic font to improve readability.
                </p>
              </div>
              <Switch 
                checked={stats.dyslexiaFont || false}
                onCheckedChange={(checked) => handleToggle('dyslexiaFont', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-base font-medium">High Contrast Mode</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Increase contrast for better visibility.
                </p>
              </div>
              <Switch 
                 checked={stats.highContrast || false}
                 onCheckedChange={(checked) => handleToggle('highContrast', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-muted-foreground" />
                  <Label className="text-base font-medium">Dark Mode</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Switch the entire interface to a darker color scheme.
                </p>
              </div>
              <Switch 
                 checked={stats.darkMode || false}
                 onCheckedChange={(checked) => handleToggle('darkMode', checked)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Speaker className="w-6 h-6 text-primary" />
              <CardTitle>Audio Preferences</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
             <div className="space-y-4">
               <div className="flex justify-between">
                 <Label className="text-base font-medium">Voice Playback Speed</Label>
                 <span className="text-sm font-mono bg-muted px-2 py-1 rounded">{stats.voiceSpeed}x</span>
               </div>
               <Slider 
                 defaultValue={[parseFloat(stats.voiceSpeed || "1.0")]}
                 max={2.0}
                 min={0.5}
                 step={0.1}
                 onValueCommit={handleSpeedChange}
               />
               <p className="text-sm text-muted-foreground">
                 Adjust the speed of audio playback and text-to-speech.
               </p>
             </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
           {updateMutation.isPending && (
             <span className="flex items-center text-sm text-muted-foreground">
               <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving changes...
             </span>
           )}
        </div>
      </div>
    </DashboardLayout>
  );
}
