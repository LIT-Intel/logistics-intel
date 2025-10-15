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
