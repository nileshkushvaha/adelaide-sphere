/** Where a file is used, in the words of the screen that uses it, with a link to it. */
export const USAGE_LABELS: Record<string, { what: string; href: (id: string) => string }> = {
  business: { what: 'Business listing', href: (id) => `/businesses/${encodeURIComponent(id)}` },
  post: { what: 'Article', href: (id) => `/posts/${encodeURIComponent(id)}` },
  author: { what: 'Author profile', href: (id) => `/authors/${encodeURIComponent(id)}` },
  testimonial: { what: 'Testimonial', href: (id) => `/website/testimonials/${encodeURIComponent(id)}` },
  partner: { what: 'Partner logo', href: (id) => `/website/partners/${encodeURIComponent(id)}` },
  page: { what: 'Website page', href: (id) => `/website/pages/${encodeURIComponent(id)}` },
  category: { what: 'Business category', href: (id) => `/categories/${encodeURIComponent(id)}` },
  area: { what: 'Local area', href: (id) => `/areas/${encodeURIComponent(id)}` },
  blogCategory: { what: 'Blog category', href: (id) => `/blog-categories/${encodeURIComponent(id)}` },
  blogTag: { what: 'Blog tag', href: (id) => `/blog-tags/${encodeURIComponent(id)}` },
  faq: { what: 'FAQ', href: (id) => `/website/faqs/${encodeURIComponent(id)}` },
  // A settings document, identified as `group.key`; the two that hold images
  // each have their own screen.
  setting: { what: 'Site settings', href: (id) => (id === 'website.home' ? '/settings' : '/settings/general') },
  // A navigation menu that links a document (change log 1.16).
  menu: { what: 'Menu', href: (id) => `/website/menus?menu=${encodeURIComponent(id)}` },
};
