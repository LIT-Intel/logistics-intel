import React from 'react';
import { createPageUrl } from '@/utils';

export default function FooterNav({ data }) {
  const footerColumns = data?.columns || [
    {
      title: "Product",
      links: [
        { text: "Search", url: createPageUrl("Search") },
        { text: "Company Profiles", url: "#" },
        { text: "RFP Builder", url: createPageUrl("RFPStudio") },
        { text: "Campaign Tools", url: createPageUrl("Campaigns") },
        { text: "Import Data", url: createPageUrl("ImportData") }
      ]
    },
    {
      title: "Resources",
      links: [
        { text: "Blog", url: "/resources" },
        { text: "API Documentation", url: "#" },
        { text: "Help Center", url: "#" },
        { text: "Video Tutorials", url: "#" }
      ]
    },
    {
      title: "Company",
      links: [
        { text: "About Us", url: "/about" },
        { text: "Contact", url: "/contact" },
        { text: "Careers", url: "#" },
        { text: "Partners", url: "#" }
      ]
    },
    {
      title: "Legal",
      links: [
        { text: "Privacy Policy", url: "/privacy" },
        { text: "Terms of Service", url: "/terms" },
        { text: "Security", url: "/security" },
        { text: "GDPR", url: "#" }
      ]
    }
  ];

  return (
    <footer className="bg-gray-900 text-white py-12 md:py-16">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 lg:grid-cols-5 gap-8 mb-8">
          {/* Logo & Description */}
          <div className="md:col-span-1 lg:col-span-2">
            <div className="flex items-center gap-3 mb-4">
               {/* Temporary text-based logo until assets are uploaded */}
               <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                 <span className="text-white font-bold text-sm">LIT</span>
               </div>
              <h3 className="font-bold text-xl">LIT</h3>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed max-w-xs">
              Turn shipments into meetings. The complete platform for freight sales professionals.
            </p>
          </div>

          {/* Footer Columns */}
          {footerColumns.slice(0, 3).map((column) => (
            <div key={column.title}>
              <h4 className="font-semibold text-white mb-4">{column.title}</h4>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={link.text}>
                    <a
                      href={link.url}
                      className="text-gray-400 hover:text-white transition-colors text-sm"
                    >
                      {link.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-gray-800 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-gray-400 text-sm">
              © 2024 LIT. All rights reserved.
            </p>
            <div className="flex gap-6">
              {footerColumns[3]?.links.map((link) => (
                <a
                  key={link.text}
                  href={link.url}
                  className="text-gray-400 hover:text-white transition-colors text-sm"
                >
                  {link.text}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}