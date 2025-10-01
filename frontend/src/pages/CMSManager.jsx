import React, { useState, useEffect } from 'react';
import { User } from '@/api/entities';
import { CmsPage, CmsSection, BlogPost, PricingPlan, Faq, Testimonial } from '@/api/entities';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  FileText, 
  Layout, 
  PenTool, 
  DollarSign, 
  HelpCircle, 
  Star,
  Plus,
  Edit3,
  Trash2,
  Eye,
  Save,
  RefreshCw
} from 'lucide-react';
import LitPageHeader from '../components/ui/LitPageHeader';
import LitPanel from '../components/ui/LitPanel';
import LitWatermark from '../components/ui/LitWatermark';

import PageEditor from '../components/cms/PageEditor';
import BlogEditor from '../components/cms/BlogEditor';
import PricingEditor from '../components/cms/PricingEditor';
import TestimonialEditor from '../components/cms/TestimonialEditor';
import FaqEditor from '../components/cms/FaqEditor';

export default function CMSManager() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('pages');
  const [isLoading, setIsLoading] = useState(true);
  
  // Data states
  const [pages, setPages] = useState([]);
  const [blogPosts, setBlogPosts] = useState([]);
  const [pricingPlans, setPricingPlans] = useState([]);
  const [testimonials, setTestimonials] = useState([]);
  const [faqs, setFaqs] = useState([]);
  
  // Editor states
  const [showPageEditor, setShowPageEditor] = useState(false);
  const [showBlogEditor, setShowBlogEditor] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const userData = await User.me();
      setUser(userData);

      if (userData.role !== 'admin') {
        setIsLoading(false);
        return;
      }

      // Load all CMS data
      const [pagesData, postsData, plansData, testimonialsData, faqsData] = await Promise.all([
        CmsPage.list('-updated_date').catch(() => []),
        BlogPost.list('-updated_date').catch(() => []),
        PricingPlan.list('price_monthly').catch(() => []),
        Testimonial.list('-created_date').catch(() => []),
        Faq.list('category').catch(() => [])
      ]);

      setPages(pagesData);
      setBlogPosts(postsData);
      setPricingPlans(plansData);
      setTestimonials(testimonialsData);
      setFaqs(faqsData);

    } catch (error) {
      console.error('Failed to load CMS data:', error);
    }
    setIsLoading(false);
  };

  const handleCreateNew = (type) => {
    setEditingItem(null);
    switch (type) {
      case 'page':
        setShowPageEditor(true);
        break;
      case 'blog':
        setShowBlogEditor(true);
        break;
      default:
        break;
    }
  };

  const handleEdit = (item, type) => {
    setEditingItem(item);
    switch (type) {
      case 'page':
        setShowPageEditor(true);
        break;
      case 'blog':
        setShowBlogEditor(true);
        break;
      default:
        break;
    }
  };

  const handleDelete = async (item, type) => {
    if (!confirm(`Are you sure you want to delete this ${type}?`)) return;

    try {
      switch (type) {
        case 'page':
          await CmsPage.delete(item.id);
          break;
        case 'blog':
          await BlogPost.delete(item.id);
          break;
        case 'plan':
          await PricingPlan.delete(item.id);
          break;
        case 'testimonial':
          await Testimonial.delete(item.id);
          break;
        case 'faq':
          await Faq.delete(item.id);
          break;
      }
      await loadData();
    } catch (error) {
      console.error(`Failed to delete ${type}:`, error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="p-6 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Access Denied</h1>
        <p className="text-gray-600">You need admin privileges to access the CMS.</p>
      </div>
    );
  }

  const tabsConfig = [
    { value: 'pages', label: 'Pages', icon: Layout, count: pages.length },
    { value: 'blog', label: 'Blog Posts', icon: FileText, count: blogPosts.length },
    { value: 'pricing', label: 'Pricing', icon: DollarSign, count: pricingPlans.length },
    { value: 'testimonials', label: 'Testimonials', icon: Star, count: testimonials.length },
    { value: 'faqs', label: 'FAQs', icon: HelpCircle, count: faqs.length }
  ];

  return (
    <div className="relative p-4 md:p-6 lg:p-8 min-h-screen">
      <LitWatermark />
      <div className="max-w-7xl mx-auto">
        <LitPageHeader title="Content Management System">
          <Button onClick={loadData} variant="outline" className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button onClick={() => window.open(window.location.origin, '_blank')} variant="outline" className="flex items-center gap-2">
            <Eye className="w-4 h-4" />
            Preview Site
          </Button>
        </LitPageHeader>

        {/* CMS Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-6">
            {tabsConfig.map(tab => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <Badge variant="secondary" className="ml-1">{tab.count}</Badge>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* Pages Tab */}
          <TabsContent value="pages" className="space-y-6">
            <LitPanel>
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900">Website Pages</h2>
                <Button onClick={() => handleCreateNew('page')} className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Create Page
                </Button>
              </div>
            </LitPanel>
            
            <div className="grid gap-4">
              {pages.map(page => (
                <Card key={page.id} className="bg-white/80 backdrop-blur-sm">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{page.title}</CardTitle>
                        <p className="text-sm text-gray-600 mt-1">/{page.slug}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(page, 'page')}
                        >
                          <Edit3 className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(page, 'page')}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="text-sm text-gray-600 mb-2">{page.meta_description}</p>
                    <div className="flex gap-2">
                      <Badge variant="outline">{page.sections?.length || 0} sections</Badge>
                      <Badge variant={page.meta_title ? 'default' : 'secondary'}>
                        {page.meta_title ? 'SEO Ready' : 'Needs SEO'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {pages.length === 0 && (
                <div className="text-center py-8">
                  <Layout className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-600">No pages created yet</p>
                  <Button onClick={() => handleCreateNew('page')} className="mt-4">
                    Create First Page
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Blog Tab */}
          <TabsContent value="blog" className="space-y-6">
            <LitPanel>
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900">Blog Posts</h2>
                <Button onClick={() => handleCreateNew('blog')} className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  New Post
                </Button>
              </div>
            </LitPanel>
            
            <div className="grid gap-4">
              {blogPosts.map(post => (
                <Card key={post.id} className="bg-white/80 backdrop-blur-sm">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{post.title}</CardTitle>
                        <p className="text-sm text-gray-600 mt-1">
                          By {post.author_name} • {post.published_date}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant={post.status === 'published' ? 'default' : 'secondary'}>
                          {post.status}
                        </Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(post, 'blog')}
                        >
                          <Edit3 className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDelete(post, 'blog')}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex gap-2 flex-wrap">
                      {post.tags?.map(tag => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {blogPosts.length === 0 && (
                <div className="text-center py-8">
                  <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-600">No blog posts created yet</p>
                  <Button onClick={() => handleCreateNew('blog')} className="mt-4">
                    Write First Post
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Pricing Tab */}
          <TabsContent value="pricing">
            <PricingEditor plans={pricingPlans} onUpdate={loadData} />
          </TabsContent>

          {/* Testimonials Tab */}
          <TabsContent value="testimonials">
            <TestimonialEditor testimonials={testimonials} onUpdate={loadData} />
          </TabsContent>

          {/* FAQs Tab */}
          <TabsContent value="faqs">
            <FaqEditor faqs={faqs} onUpdate={loadData} />
          </TabsContent>
        </Tabs>

        {/* Editors */}
        {showPageEditor && (
          <PageEditor
            page={editingItem}
            onClose={() => {
              setShowPageEditor(false);
              setEditingItem(null);
            }}
            onSave={() => {
              loadData();
              setShowPageEditor(false);
              setEditingItem(null);
            }}
          />
        )}

        {showBlogEditor && (
          <BlogEditor
            post={editingItem}
            onClose={() => {
              setShowBlogEditor(false);
              setEditingItem(null);
            }}
            onSave={() => {
              loadData();
              setShowBlogEditor(false);
              setEditingItem(null);
            }}
          />
        )}
      </div>
    </div>
  );
}