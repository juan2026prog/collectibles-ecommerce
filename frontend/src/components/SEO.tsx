import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useSiteSettings } from '../hooks/useSiteSettings';

interface SEOProps {
  title: string;
  description: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'product';
  schema?: Record<string, any> | Record<string, any>[];
}

export default function SEO({
  title,
  description,
  keywords,
  image,
  url = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '',
  type = 'website',
  schema,
}: SEOProps) {
  const { settings } = useSiteSettings();
  const siteName = settings['store_name'] || settings['seo_site_title'] || 'Collectibles';
  const ogImage = image || settings['seo_og_image'] || '';
  const fullTitle = `${title} | ${siteName}`;

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Collectibles Uruguay",
    "url": "https://collectibles.uy",
    "logo": "https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/1775828705619-isologocolle.jpg",
    "sameAs": [
      settings['social_instagram'] || "https://instagram.com/collectibles.uy",
      settings['social_facebook'] || "https://facebook.com/collectibles.uy"
    ]
  };

  const schemas = [organizationSchema];
  if (schema) {
    if (Array.isArray(schema)) {
      schemas.push(...schema);
    } else {
      schemas.push(schema);
    }
  }

  return (
    <Helmet>
      {/* Standard Metadata */}
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {keywords && <meta name="keywords" content={keywords} />}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      {ogImage && <meta property="og:image" content={ogImage} />}
      <meta property="og:url" content={url} />
      <meta property="og:site_name" content={siteName} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      {ogImage && <meta name="twitter:image" content={ogImage} />}

      {/* Canonical Link */}
      <link rel="canonical" href={url} />

      {/* JSON-LD Schemas */}
      {schemas.length > 0 && (
        <script type="application/ld+json">
          {JSON.stringify(schemas)}
        </script>
      )}
    </Helmet>
  );
}
