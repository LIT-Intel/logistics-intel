import WelcomeBanner from '@/components/WelcomeBanner';
export default function DashboardPage(){
  // Replace with actual auth user display name and optional lastLogin from backend if available
  const userDisplayName = 'there';
  const lastLoginIso: string | null = null;
  return (
    <div className="space-y-4">
      <WelcomeBanner userName={userDisplayName} lastLoginIso={lastLoginIso} />
      {/* existing KPI rows / lists remain below */}
    </div>
  );
}
