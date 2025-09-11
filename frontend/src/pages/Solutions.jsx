import React from 'react';
import { Button } from '@/components/ui/button';
import { Briefcase, TrendingUp, BarChart, CheckCircle, ArrowRight } from 'lucide-react';

const solutions = [
  {
    role: 'Procurement',
    icon: Briefcase,
    color: 'blue',
    tagline: 'Supplier discovery & risk assessment',
    title: 'Transform Your Supply Chain Discovery',
    description: 'Discover qualified suppliers, assess risks, and ensure compliance with AI-powered procurement intelligence that reduces sourcing time by 60%.',
    keyBenefits: [
      { title: 'Intelligent Supplier Discovery', description: 'Find verified suppliers with 98.7% accuracy using AI-powered matching algorithms.' },
      { title: 'Real-Time Risk Assessment', description: 'Monitor supplier financial health, compliance status, and geopolitical risks.' },
      { title: 'Supply Chain Transparency', description: 'Visualize complete supplier networks and identify potential disruptions.' }
    ],
    cta: 'Explore Procurement Solutions',
    visualization: {
      title: 'Supplier Network Visualization',
      stats: [
        { value: '87%', label: 'Supplier Health' },
        { value: '12', label: 'Active Suppliers' },
        { value: '3', label: 'Risk Alerts' },
      ],
      // This would be a more complex component in a real app
      image: "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68acd4246a0f65e4cc375a11/94e836ce1_image.png"
    },
    testimonial: {
      quote: "LIT transformed our supplier discovery process. We've reduced sourcing time by 60% and increased our supplier diversity.",
      author: 'Michael Chen',
      title: 'Procurement Director, TechFlow Inc.',
      metric: '60%',
      metricLabel: 'Time Reduction'
    }
  }
  // Add other solutions here (Sales, Market Research, Compliance)
];

const RoleSelectionCard = ({ icon: Icon, title, description, color }) => {
  const colors = {
    blue: 'bg-blue-100 text-blue-600',
    green: 'bg-green-100 text-green-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    red: 'bg-red-100 text-red-600'
  };
  return (
    <a href={`#${title.toLowerCase().replace(/\s+/g, '-')}`} className="group bg-white rounded-2xl border border-gray-200 hover:border-blue-300 hover:shadow-lg transition-all p-6 text-center transform hover:-translate-y-1">
      <div className={`w-16 h-16 ${colors[color]} rounded-xl flex items-center justify-center mx-auto mb-4 transition-colors`}>
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </a>
  );
};

export default function Solutions() {
  return (
    <div className="bg-white">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-50/50 to-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-semibold mb-6 ring-1 ring-yellow-200">
              Role-Specific Intelligence Solutions
            </div>
            <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 tracking-tighter leading-tight mb-6">
              Solutions Tailored to <span className="text-yellow-500">Your Role</span>
            </h1>
            <p className="text-xl text-gray-600 leading-relaxed">
              Discover how Logistic Intel transforms workflows for Procurement, Sales, Market Research, and Compliance teams with role-specific features and intelligence.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mt-16 max-w-5xl mx-auto">
            <RoleSelectionCard icon={Briefcase} title="Procurement" description="Supplier discovery & risk assessment" color="blue" />
            <RoleSelectionCard icon={TrendingUp} title="Sales Teams" description="International market targeting" color="green" />
            <RoleSelectionCard icon={BarChart} title="Market Research" description="Global trade pattern analysis" color="yellow" />
            <RoleSelectionCard icon={CheckCircle} title="Compliance" description="Regulatory requirements & risk" color="red" />
          </div>
        </div>
      </section>

      {/* Individual Solution Sections */}
      {solutions.map((solution, index) => (
        <section key={solution.role} id={solution.role.toLowerCase().replace(/\s+/g, '-')} className="py-20 bg-gray-50/70">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="space-y-8">
                <div className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-semibold">
                  {solution.role} Intelligence
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900 tracking-tight">{solution.title}</h2>
                <p className="text-lg text-gray-600">{solution.description}</p>
                <div className="space-y-4">
                  {solution.keyBenefits.map((benefit, idx) => (
                    <div key={idx} className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
                      <div>
                        <h4 className="font-semibold text-gray-800">{benefit.title}</h4>
                        <p className="text-gray-600">{benefit.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                  {solution.cta}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
              <div className="space-y-8">
                 <div className="bg-white rounded-2xl p-6 shadow-xl border border-gray-200/80">
                    <h3 className="font-semibold text-gray-800 mb-4 text-center">{solution.visualization.title}</h3>
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <img src={solution.visualization.image} alt={solution.visualization.title} className="rounded-md" />
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-200/80 grid grid-cols-3 gap-4 text-center">
                      {solution.visualization.stats.map(stat => (
                        <div key={stat.label}>
                          <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                          <p className="text-xs text-gray-600">{stat.label}</p>
                        </div>
                      ))}
                    </div>
                 </div>
                 <div className="bg-white rounded-2xl p-6 shadow-xl border border-gray-200/80 flex items-center gap-6">
                    <img src="https://randomuser.me/api/portraits/men/32.jpg" alt={solution.testimonial.author} className="w-16 h-16 rounded-full" />
                    <blockquote className="flex-1">
                      <p className="text-gray-700 italic">"{solution.testimonial.quote}"</p>
                      <footer className="mt-4 font-semibold text-gray-800">{solution.testimonial.author}, <span className="font-normal text-gray-600">{solution.testimonial.title}</span></footer>
                    </blockquote>
                    <div className="text-center border-l border-gray-200 pl-6">
                      <div className="text-4xl font-bold text-green-600">{solution.testimonial.metric}</div>
                      <div className="text-sm text-gray-500">{solution.testimonial.metricLabel}</div>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}