import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Calendar, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';

export default function BlogList({ data }) {
  const [posts, setPosts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  
  const limit = data?.limit || 6;

  useEffect(() => {
    const loadPosts = async () => {
      try {
        // Try to import BlogPost entity dynamically to check if it exists
        const { BlogPost } = await import('@/api/entities');
        
        if (!BlogPost) {
          console.log('BlogPost entity not available, skipping blog section');
          setHasError(true);
          setIsLoading(false);
          return;
        }

        const blogPosts = await BlogPost.filter(
          { status: 'published' },
          '-published_date',
          limit
        );
        
        // Handle different response formats
        const postsArray = Array.isArray(blogPosts) ? blogPosts : 
                          (blogPosts?.data && Array.isArray(blogPosts.data)) ? blogPosts.data : [];
        
        setPosts(postsArray);
        setHasError(false);
      } catch (error) {
        console.log('BlogPost section disabled - entity not configured or no posts available');
        setHasError(true);
        setPosts([]);
      }
      setIsLoading(false);
    };
    
    loadPosts();
  }, [limit]);

  // Don't render anything if there's an error or no posts
  if (hasError || (!isLoading && posts.length === 0)) {
    return null;
  }

  if (isLoading) {
    return (
      <section className="py-16 md:py-24 bg-gray-50/70">
        <div className="container mx-auto px-4 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        </div>
      </section>
    );
  }

  return (
    <section className="py-16 md:py-24 bg-gray-50/70">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            {data?.title || "Latest insights & resources"}
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            {data?.subtitle || "Stay ahead of the curve with expert insights on freight, logistics, and sales strategies."}
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-6xl mx-auto mb-12">
          {posts.map((post, index) => (
            <motion.article
              key={post.id}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="bg-white rounded-2xl shadow-lg border border-gray-200/60 overflow-hidden hover:shadow-xl transition-all duration-300"
            >
              {post.featured_image_url && (
                <img
                  src={post.featured_image_url}
                  alt={post.title}
                  className="w-full h-48 object-cover"
                />
              )}
              <div className="p-6">
                <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {post.published_date && format(new Date(post.published_date), 'MMM dd, yyyy')}
                  </div>
                  {post.author_name && (
                    <div className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      {post.author_name}
                    </div>
                  )}
                </div>
                
                <h3 className="text-lg font-bold text-gray-900 mb-3 line-clamp-2">
                  {post.title}
                </h3>
                
                <div className="text-gray-600 text-sm mb-4 line-clamp-3">
                  {(post.content_markdown || '')
                    .replace(/<[^>]*>/g, '')
                    .substring(0, 120)}
                  ...
                </div>

                {post.tags && post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    {post.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <Button 
                  variant="ghost" 
                  className="text-blue-600 hover:text-blue-700 p-0 h-auto"
                >
                  Read more
                  <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </motion.article>
          ))}
        </div>

        <div className="text-center">
          <Button
            variant="outline"
            className="border-2 border-gray-300 hover:bg-gray-50"
          >
            View All Resources
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </section>
  );
}