import React from "react";
import {
  Award,
  BookOpen,
  FileText,
  MessageCircle,
  Search,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";

const resourceCategories = [
  {
    name: "Guides",
    icon: BookOpen,
    description: "Comprehensive how-to guides",
  },
  {
    name: "Webinars",
    icon: Video,
    description: "Live and recorded sessions",
  },
  {
    name: "Case Studies",
    icon: FileText,
    description: "Real customer success stories",
  },
  {
    name: "Market Intel",
    icon: TrendingUp,
    description: "Industry trends and insights",
  },
];

const featuredResources = [
  {
    category: "Sales Strategy",
    title: "How to Leverage Bill of Lading Data for Lead Generation",
    description:
      "Dive deep into the strategies that top sales teams use to turn raw shipping data into qualified, high-value leads for their logistics services.",
    date: "Mar 16, 2024",
    readTime: "8 min read",
    author: "Michael Foster",
    role: "Co-Founder / CTO",
    featured: true,
  },
  {
    category: "Procurement",
    title: "Top 5 KPIs for modern procurement teams",
    description:
      "Move beyond cost-per-unit. We explore the 5 essential KPIs that data-driven procurement teams are using to measure success and drive supply chain resilience.",
    date: "Mar 10, 2024",
    readTime: "6 min read",
    author: "Sarah Chen",
    role: "Head of Product",
  },
  {
    category: "Industry Trends",
    title: "AI in Logistics: Separating Hype from Reality",
    description:
      "Artificial intelligence is poised to revolutionize logistics. This article breaks down the practical applications available today, from predictive analytics to automated outreach.",
    date: "Feb 28, 2024",
    readTime: "10 min read",
    author: "David Lee",
    role: "Lead Data Scientist",
  },
];

const communityFeatures = [
  {
    icon: MessageCircle,
    title: "Expert Forums",
    description: "Connect with trade professionals and share insights",
  },
  {
    icon: Users,
    title: "User Groups",
    description: "Join regional and industry-specific communities",
  },
  {
    icon: Award,
    title: "Certification Program",
    description: "Earn credentials in trade intelligence best practices",
  },
];

export default function Resources() {
  return (
    <div className="bg-white">
      <section className="relative bg-gradient-to-br from-blue-50 to-white overflow-hidden py-16">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 leading-tight">
              Knowledge & Community
              <span className="text-blue-600"> Hub</span>
            </h1>
            <p className="mt-5 text-lg text-gray-600 leading-relaxed">
              Access trade intelligence resources, connect with experts, and
              accelerate your growth.
            </p>

            <div className="mt-8 relative max-w-2xl mx-auto">
              <input
                type="text"
                placeholder="Search resources, topics, or community discussions..."
                className="w-full pl-12 pr-4 py-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-base"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            </div>

            <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {resourceCategories.map((category) => {
                const Icon = category.icon;
                return (
                  <a
                    key={category.name}
                    href="#resources"
                    className="group p-4 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
                  >
                    <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-3 group-hover:bg-blue-200 transition-colors">
                      <Icon className="w-6 h-6 text-blue-600" />
                    </div>
                    <h3 className="font-medium text-gray-900 mb-1">
                      {category.name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {category.description}
                    </p>
                  </a>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="resources" className="bg-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Featured Resources
            </h2>
            <p className="mt-3 text-gray-600 max-w-3xl mx-auto">
              Hand-picked insights from industry experts and our team.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {featuredResources.map((r) => (
              <article
                key={`${r.category}:${r.title}`}
                className={`rounded-2xl border bg-white p-6 shadow-sm ${
                  r.featured
                    ? "border-blue-200 ring-1 ring-blue-100"
                    : "border-gray-200"
                }`}
              >
                <div className="text-xs font-semibold text-blue-700">
                  {r.category}
                </div>
                <h3 className="mt-2 text-lg font-semibold text-gray-900">
                  {r.title}
                </h3>
                <p className="mt-2 text-sm text-gray-600">{r.description}</p>
                <div className="mt-4 text-xs text-gray-500">
                  {r.date} • {r.readTime}
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  {r.author} — {r.role}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-gray-50 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900">Community</h2>
            <p className="mt-3 text-gray-600">
              Learn together and share best practices with peers.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {communityFeatures.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-2xl border border-gray-200 bg-white p-6"
                >
                  <Icon className="w-6 h-6 text-blue-600" />
                  <div className="mt-3 font-semibold text-gray-900">
                    {f.title}
                  </div>
                  <div className="mt-1 text-sm text-gray-600">
                    {f.description}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}
