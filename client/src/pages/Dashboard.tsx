import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { useUserStats } from "@/hooks/use-user";
import { useRecordings } from "@/hooks/use-recordings";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RecordingCard } from "@/components/recordings/RecordingCard";
import { AudioRecorder } from "@/components/recordings/AudioRecorder";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Clock, BookOpen, Trophy, ArrowRight, Loader2, Mic } from "lucide-react";
import { Link } from "wouter";
import { useMemo } from "react";
import { useTranslation } from "@/lib/i18n";

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useUserStats();
  const { data: recordings, isLoading: recordingsLoading } = useRecordings();
  const { t } = useTranslation();

  // Real calculations for metrics
  const totalSeconds = recordings?.reduce((acc, rec) => acc + (rec.duration || 0), 0) || 0;
  const studyTimeSavedHrs = (totalSeconds / 3600).toFixed(1);

  const chartData = useMemo(() => {
    if (!recordings) return [];
    
    // Group by day for the last 7 days
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const now = new Date();
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(now.getDate() - (6 - i));
      return {
        label: days[d.getDay()],
        date: d.toISOString().split('T')[0],
        minutes: 0
      };
    });

    recordings.forEach(rec => {
      const recDate = new Date(rec.createdAt!).toISOString().split('T')[0];
      const dayMatch = last7Days.find(d => d.date === recDate);
      if (dayMatch) {
        dayMatch.minutes += Math.round((rec.duration || 0) / 60);
      }
    });

    return last7Days.map(d => ({ name: d.label, minutes: d.minutes }));
  }, [recordings]);

  if (statsLoading || recordingsLoading) return null; // handled by layout usually

  const recentRecordings = recordings?.slice(0, 3) || [];

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        {/* Welcome Section */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">
              {t("dashboard.hello")}
            </h1>
            <p className="text-muted-foreground mt-2">
              {t("dashboard.subtitle")}
            </p>
          </div>
          <Link href="/recordings">
             <Button variant="outline" className="hidden sm:flex items-center gap-2">
               {t("dashboard.viewAll")} <ArrowRight className="w-4 h-4" />
             </Button>
          </Link>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-6 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/20 text-primary rounded-xl">
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t("dashboard.studyTime")}</p>
                <h3 className="text-2xl font-bold text-foreground">{studyTimeSavedHrs} hrs</h3>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-secondary/5 to-secondary/10 border-secondary/20">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-secondary/20 text-secondary rounded-xl">
                <BookOpen className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">{t("dashboard.totalRecordings")}</p>
                <h3 className="text-2xl font-bold text-foreground">{recordings?.length || 0}</h3>
              </div>
            </div>
          </Card>


        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content: Recent Recordings */}
          <div className="lg:col-span-2 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl font-semibold">{t("dashboard.recentActivity")}</h2>
            </div>

            {recentRecordings.length > 0 ? (
              <div className="space-y-4">
                {recentRecordings.map((recording) => (
                  <RecordingCard key={recording.id} recording={recording} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-muted/30 rounded-2xl border border-dashed">
                <Mic className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground">{t("dashboard.noRecordings")}</h3>
                <p className="text-sm text-muted-foreground/80 mb-6">{t("dashboard.startRecording")}</p>
              </div>
            )}
          </div>

          {/* Sidebar Content: Chart & Tips */}
          <div className="space-y-6">
            <Card className="p-6">
              <h3 className="font-heading font-semibold mb-6">{t("dashboard.weeklyActivity")}</h3>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="name" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip 
                      cursor={{ fill: 'transparent' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                    />
                    <Bar dataKey="minutes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            
            <Card className="p-6 bg-secondary/5 border-secondary/20">
              <h3 className="font-heading font-semibold text-secondary mb-2">{t("dashboard.didYouKnow")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("dashboard.didYouKnowText")}
              </p>
            </Card>
          </div>
        </div>
      </div>
      
      <AudioRecorder />
    </DashboardLayout>
  );
}
