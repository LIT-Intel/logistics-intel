import React from 'react';
import { Button } from '@/components/ui/button';
import { Search, BookOpen, Users, Video, FileText, TrendingUp, MessageCircle, Award } from 'lucide-react';

const resourceCategories = [
  {
    name: 'Guides',
    icon: BookOpen,
    description: 'Comprehensive how-to guides',
    color: 'blue'
  },
  {
    name: 'Webinars',
    icon: Video,
    description: 'Live and recorded sessions',
    color: 'purple'
  },
  {
    name: 'Case Studies',
    icon: FileText,
    description: 'Real customer success stories',
    color: 'green'
  },
  {
    name: 'Market Intel',
    icon: TrendingUp,
    description: 'Industry trends and insights',
    color: 'orange'
  }
];

const featuredResources = [
  {
    category: 'Sales Strategy',
    title: 'How to Leverage Bill of Lading Data for Lead Generation',
    description: 'Dive deep into the strategies that top sales teams use to turn raw shipping data into qualified, high-value leads for their logistics services.',
    date: 'Mar 16, 2024',
    readTime: '8 min read',
    author: 'Michael Foster',
    role: 'Co-Founder / CTO',
    featured: true
  },
  {
    category: 'Procurement',
    title: 'Top 5 KPIs for modern procurement teams',
    description: 'Move beyond cost-per-unit. We explore the 5 essential KPIs that data-driven procurement teams are using to measure success and drive supply chain resilience.',
    date: 'Mar 10, 2024',
    readTime: '6 min read',
    author: 'Sarah Chen',
    role: 'Head of Product'
  },
  {
    category: 'Industry Trends',
    title: 'AI in Logistics: Separating Hype from Reality',
    description: 'Artificial intelligence is poised to revolutionize logistics. This article breaks down the practical applications available today, from predictive analytics to automated outreach.',
    date: 'Feb 28, 2024',
    readTime: '10 min read',
    author: 'David Lee',
    role: 'Lead Data Scientist'
  },
  {
    category: 'Platform Guide',
    title: 'Getting Started with Trade Intelligence',
    description: 'A complete beginner\'s guide to leveraging trade data for business growth, from setting up your first search to building automated campaigns.',
    date: 'Feb 20, 2024',
    readTime: '12 min read',
    author: 'Lisa Park',
    role: 'Customer Success'
  },
  {
    category: 'Best Practices',
    title: 'Building Effective Multi-Channel Outreach Campaigns',
    description: 'Learn how to coordinate email and LinkedIn outreach for maximum impact, with templates and timing strategies that convert.',
    date: 'Feb 15, 2024',
    readTime: '7 min read',
    author: 'James Wilson',
    role: 'Marketing Director'
  },
  {
    category: 'Market Analysis',
    title: 'Q1 2024 Global Trade Trends Report',
    description: 'Comprehensive analysis of shipping patterns, emerging markets, and supply chain shifts observed in our platform data.',
    date: 'Feb 10, 2024',
    readTime: '15 min read',
    author: 'Research Team',
    role: 'Market Intelligence'
  }
];

const communityFeatures = [
  {
    icon: MessageCircle,
    title: 'Expert Forums',
    description: 'Connect with trade professionals and share insights'
  },
  {
    icon: Users,
    title: 'User Groups',
    description: 'Join regional and industry-specific communities'
  },
  {
    icon: Award,
    title: 'Certification Program',
    description: 'Earn credentials in trade intelligence best practices'
  }
];

export default function Resources() {
  return (
    <div className="bg-white">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-blue-50 to-white overflow-hidden py-20">
        <div className="absolute inset-0 opacity-5">
          <svg className="w-full h-full" viewBox="0 0 1200 800">
            <defs>
              <pattern id="knowledge-grid" x="0" y="0" width="60" height="60" patternUnits="userSpaceOnUse">
                <circle cx="30" cy="30" r="1.5" fill="currentColor" opacity="0.4"/>
                <path d="M15,30 L45,30 M30,15 L30,45" stroke="currentColor" strokeWidth="0.5" opacity="0.2"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#knowledge-grid)"/>
          </svg>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-800 rounded-full text-sm font-medium mb-6">
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
              10,000+ Trade Professionals Learning Daily
            </div>
            
            <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
              Knowledge & Community
              <span className="text-blue-600"> Hub</span>
            </h1>
            
            <p className="text-xl text-gray-600 leading-relaxed mb-8 max-w-3xl mx-auto">
              Access comprehensive trade intelligence resources, connect with global experts, and accelerate your professional growth through our integrated learning ecosystem.
            </p>

            {/* Search Bar */}
            <div className="relative max-w-2xl mx-auto mb-12">
              <input 
                type="text" 
                placeholder="Search resources, topics, or community discussions..." 
                className="w-full pl-12 pr-16 py-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg" 
              />
              <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
              <button className="absolute right-3 top-1/2 transform -translate-y-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
                Search
              </button>
            </div>

            {/* Quick Access Categories */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {resourceCategories.map((category) => (
                <a key={category.name} href="#resources" className="group p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:bg-blue-200 transition-colors">
                    <category.icon className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="font-medium text-gray-900 mb-1">{category.name}</h3>
                  <p className="text-sm text-gray-600">{category.description}</p>
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Featured Resources */}
      <section id="resources" className="bg-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Featured Resources
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Hand-picked insights from industry experts and our team of trade intelligence specialists
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {featuredResources.map((resource, index) => (
              <article key={resource.title} className={`${resource.featured ? 'lg:col-span-2 lg:row-span-2' : ''} bg-white rounded-xl border border-gray-200 hover:shadow-lg transition-shadow overflow-hidden flex flex-col`}>
                <div className="p-6 flex-grow">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {resource.category}
                    </span>
                    <span className="text-sm text-gray-500">{resource.readTime}</span>
                  </div>
                  
                  <h3 className={`font-bold text-gray-900 mb-3 hover:text-blue-600 transition-colors ${resource.featured ? 'text-xl lg:text-2xl' : 'text-lg'}`}>
                    <a href="#">{resource.title}</a>
                  </h3>
                  
                  <p className={`text-gray-600 mb-4 leading-relaxed ${resource.featured ? 'text-base' : 'text-sm'}`}>
                    {resource.description}
                  </p>
                </div>
                
                <div className="flex items-center justify-between p-6 border-t border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-gray-600 font-bold text-sm">
                      {resource.author.charAt(0)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{resource.author}</p>
                      <p className="text-gray-600 text-xs">{resource.role}</p>
                    </div>
                  </div>
                  <time className="text-sm text-gray-500">{resource.date}</time>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Community Section */}
      <section className="bg-gray-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
                  Join Our Global Community
                </h2>
                <p className="text-xl text-gray-600 leading-relaxed">
                  Connect with thousands of trade professionals worldwide. Share insights, ask questions, and learn from the collective experience of our community.
                </p>
              </div>

              <div className="space-y-6">
                {communityFeatures.map((feature, index) => (
                  <div key={feature.title} className="flex gap-4">
                    <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm">
                      <feature.icon className="w-6 h-6 text-blue-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 mb-1">{feature.title}</h3>
                      <p className="text-gray-600">{feature.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Button className="bg-blue-600 hover:bg-blue-700">
                Join Community Forum
              </Button>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-lg">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Community Highlights</h3>
              <div className="space-y-4">
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-medium text-gray-900">Active Discussions</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">247</p>
                  <p className="text-sm text-gray-600">This week</p>
                </div>
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-sm font-medium text-gray-900">Expert Responses</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">89%</p>
                  <p className="text-sm text-gray-600">Response rate</p>
                </div>
                <div className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                    <span className="text-sm font-medium text-gray-900">Global Members</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">10,000+</p>
                  <p className="text-sm text-gray-600">From 85+ countries</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Newsletter Section */}
      <section className="bg-gray-900 py-20 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Stay Ahead of Trade Trends
          </h2>
          <p className="text-xl text-gray-300 mb-10 max-w-2xl mx-auto">
            Get weekly insights, market updates, and exclusive content delivered to your inbox.
          </p>
          <div className="max-w-lg mx-auto flex gap-4">
            <input 
              type="email" 
              placeholder="Enter your email address" 
              className="flex-1 px-4 py-3 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button className="bg-blue-600 hover:bg-blue-700 px-6">
              Subscribe
            </Button>
          </div>
          <p className="text-sm text-gray-400 mt-4">
            Join 5,000+ professionals. Unsubscribe anytime.
          </p>
        </div>
      </section>
    </div>
  );
}