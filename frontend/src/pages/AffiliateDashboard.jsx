import React, { useState, useEffect } from 'react';
import { User } from '@/api/entities';
import { Affiliate } from '@/api/entities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  DollarSign, 
  TrendingUp, 
  Copy, 
  Share, 
  CheckCircle,
  ExternalLink,
  Star,
  Gift,
  Target,
  Zap
} from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';

export default function AffiliateDashboard() {
  const [user, setUser] = useState(null);
  const [affiliate, setAffiliate] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [stats, setStats] = useState({
    totalReferrals: 0,
    activeReferrals: 0,
    totalCommissions: 0,
    pendingCommissions: 0,
    conversionRate: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const userData = await User.me();
      setUser(userData);

      // Check if user is admin or has affiliate status
      if (userData.role === 'admin' || userData.affiliate_status === 'active') {
        const affiliateData = await Affiliate.filter({ user_id: userData.id });
        if (affiliateData && affiliateData.length > 0) {
          setAffiliate(affiliateData[0]);
        }
      }

      // Mock stats for now - in a real implementation, these would come from the backend
      setStats({
        totalReferrals: 12,
        activeReferrals: 8,
        totalCommissions: 2450.00,
        pendingCommissions: 450.00,
        conversionRate: 15.2
      });

    } catch (error) {
      console.error("Error loading affiliate data:", error);
    }
    setIsLoading(false);
  };

  const handleCopyReferralLink = async () => {
    const referralLink = `https://logisticintel.com?ref=${affiliate?.ref_code || 'YOUR_CODE'}`;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  const shareOnSocial = (platform) => {
    const referralLink = `https://logisticintel.com?ref=${affiliate?.ref_code || 'YOUR_CODE'}`;
    const message = "Discover powerful trade intelligence with Logistic Intel - the platform that's transforming freight sales!";
    
    const urls = {
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(referralLink)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(referralLink)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(referralLink)}`
    };
    
    window.open(urls[platform], '_blank', 'width=600,height=400');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F6F8FB]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#1E5EFF]"></div>
      </div>
    );
  }

  const hasAffiliateAccess = user?.role === 'admin' || user?.affiliate_status === 'active';

  if (!hasAffiliateAccess) {
    return (
      <div className="p-6 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
        <div className="max-w-4xl mx-auto">
          <Card className="bg-white/80 backdrop-blur-sm shadow-lg border border-gray-200/60">
            <CardContent className="p-8 text-center">
              <Gift className="w-16 h-16 text-blue-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Join Our Affiliate Program</h2>
              <p className="text-gray-600 mb-6">
                Partner with us and earn generous commissions by referring new customers to Logistic Intel.
              </p>
              <Button className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800">
                Apply to Join
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gradient-to-br from-gray-50 to-blue-50/30 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 lg:mb-8 gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-gray-900">Affiliate Dashboard</h1>
            <p className="text-gray-600 mt-2 text-sm md:text-base">
              Track your referrals and commission earnings
            </p>
            <div className="flex items-center gap-4 mt-2">
              <Badge className="bg-gradient-to-r from-blue-100 to-purple-100 text-blue-800 border-0">
                <Star className="w-3 h-3 mr-1" />
                {user?.role === 'admin' ? 'Admin Partner' : 'Active Affiliate'}
              </Badge>
              {affiliate?.ref_code && (
                <span className="text-xs text-gray-500 font-mono">
                  Code: {affiliate.ref_code}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <Card className="bg-white/80 backdrop-blur-sm shadow-lg border border-gray-200/60 hover:shadow-xl transition-all duration-300">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                  <Users className="w-4 h-4 mr-2" />
                  Total Referrals
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-gray-900">{stats.totalReferrals}</div>
                <p className="text-sm text-green-600 mt-1">
                  +3 this month
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Card className="bg-white/80 backdrop-blur-sm shadow-lg border border-gray-200/60 hover:shadow-xl transition-all duration-300">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                  <Target className="w-4 h-4 mr-2" />
                  Active Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">{stats.activeReferrals}</div>
                <p className="text-sm text-gray-500 mt-1">
                  Currently paying
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Card className="bg-white/80 backdrop-blur-sm shadow-lg border border-gray-200/60 hover:shadow-xl transition-all duration-300">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                  <DollarSign className="w-4 h-4 mr-2" />
                  Total Earned
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  ${stats.totalCommissions.toFixed(2)}
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  All time
                </p>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <Card className="bg-white/80 backdrop-blur-sm shadow-lg border border-gray-200/60 hover:shadow-xl transition-all duration-300">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center">
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Conversion Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-purple-600">{stats.conversionRate}%</div>
                <p className="text-sm text-green-600 mt-1">
                  +2.1% vs last month
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Referral Link & Sharing */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.5 }}
            className="lg:col-span-2"
          >
            <Card className="bg-white/80 backdrop-blur-sm shadow-lg border border-gray-200/60">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Share className="w-5 h-5 mr-2" />
                  Your Referral Link
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex gap-3">
                  <Input
                    value={`https://logisticintel.com?ref=${affiliate?.ref_code || 'YOUR_CODE'}`}
                    readOnly
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    onClick={handleCopyReferralLink}
                    variant={copiedLink ? "default" : "outline"}
                    className={copiedLink ? "bg-green-600 hover:bg-green-700" : ""}
                  >
                    {copiedLink ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-900 mb-3">Share on Social Media</h4>
                  <div className="flex gap-3">
                    <Button
                      onClick={() => shareOnSocial('twitter')}
                      variant="outline"
                      size="sm"
                      className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                    >
                      Twitter
                    </Button>
                    <Button
                      onClick={() => shareOnSocial('linkedin')}
                      variant="outline"
                      size="sm"
                      className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                    >
                      LinkedIn
                    </Button>
                    <Button
                      onClick={() => shareOnSocial('facebook')}
                      variant="outline"
                      size="sm"
                      className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                    >
                      Facebook
                    </Button>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg p-4">
                  <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                    <Zap className="w-4 h-4 mr-2 text-blue-600" />
                    Commission Structure
                  </h4>
                  <ul className="text-sm text-gray-600 space-y-1">
                    <li>• <strong>20%</strong> recurring commission on all plans</li>
                    <li>• <strong>$50</strong> bonus for first 5 referrals</li>
                    <li>• Monthly payouts via Stripe</li>
                    <li>• 90-day cookie duration</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Quick Stats */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <Card className="bg-white/80 backdrop-blur-sm shadow-lg border border-gray-200/60">
              <CardHeader>
                <CardTitle>This Month</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">New Referrals</span>
                  <span className="font-semibold">3</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Conversions</span>
                  <span className="font-semibold">2</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Commission Earned</span>
                  <span className="font-semibold text-green-600">$450.00</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Pending Payout</span>
                  <span className="font-semibold text-orange-600">${stats.pendingCommissions.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.7 }}
          className="mt-8"
        >
          <Card className="bg-white/80 backdrop-blur-sm shadow-lg border border-gray-200/60">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { type: 'signup', name: 'John Smith', email: 'john@freightco.com', date: '2 hours ago', status: 'Trial Started' },
                  { type: 'conversion', name: 'Sarah Chen', email: 'sarah@logistics.net', date: '1 day ago', status: 'Upgraded to Growth' },
                  { type: 'signup', name: 'Mike Rodriguez', email: 'mike@shipping.com', date: '3 days ago', status: 'Trial Started' }
                ].map((activity, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        activity.type === 'conversion' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
                      }`}>
                        {activity.type === 'conversion' ? <DollarSign className="w-4 h-4" /> : <Users className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{activity.name}</p>
                        <p className="text-sm text-gray-500">{activity.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge className={
                        activity.type === 'conversion' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                      }>
                        {activity.status}
                      </Badge>
                      <p className="text-xs text-gray-500 mt-1">{activity.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}