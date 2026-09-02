import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { BASE_URL } from '../utils/seoHelpers';

interface SEOProps {
  title: string;
  description: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: 'website' | 'article' | 'product';
  schema?: Record<string, any> | Record<string, any>[];
  noIndex?: boolean;
}

export default function SEO({
  title,
  description,
  keywords,
  image,
  url = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : BASE_URL,
  type = 'website',
  schema,
  noIndex = false,
}: SEOProps) {
  const { settings } = useSiteSettings();
  const siteName = settings['store_name'] || settings['seo_site_title'] || 'Collectibles';
  const ogImage = image || settings['seo_og_image'] || 'https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/1775828705619-isologocolle.jpg';
  
  // Format title cleanly without duplicated site names
  const fullTitle = title.includes('Collectibles') ? title : `${title} | ${siteName}`;

  // Ensure absolute canonical url starting with https://collectibles.uy
  let canonicalUrl = url;
  if (!canonicalUrl.startsWith('http')) {
    canonicalUrl = `${BASE_URL}${canonicalUrl.startsWith('/') ? '' : '/'}${canonicalUrl}`;
  }
  canonicalUrl = canonicalUrl.replace('http://', 'https://').replace('www.collectibles.uy', 'collectibles.uy');

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Collectibles Uruguay - Juguetes Retro y Coleccionables",
    "alternateName": "Juguetes Retro Uruguay",
    "url": BASE_URL,
    "logo": "https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/1775828705619-isologocolle.jpg",
    "description": "La tienda N°1 de juguetes retro, figuras vintage, cartas y coleccionables en Uruguay.",
    "sameAs": [
      settings['social_instagram'] || "https://instagram.com/collectibles.uy",
      settings['social_facebook'] || "https://facebook.com/collectibles.uy"
    ]
  };

  const webSiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Collectibles Uruguay",
    "alternateName": "Juguetes Retro Uruguay",
    "url": BASE_URL,
    "potentialAction": {
      "@type": "SearchAction",
      "target": "https://collectibles.uy/shop?q={search_term_string}",
      "query-input": "required name=search_term_string"
    }
  };

  const schemas: any[] = [];
  if (type === 'website') {
    schemas.push(organizationSchema, webSiteSchema);
  }

  if (schema) {
    if (Array.isArray(schema)) {
      schemas.push(...schema.filter(Boolean));
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
      {noIndex ? (
        <meta name="robots" content="noindex, follow" />
      ) : (
        <meta name="robots" content="index, follow" />
      )}

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      {ogImage && <meta property="og:image" content={ogImage} />}
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:site_name" content={siteName} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      {ogImage && <meta property="og:image" content={ogImage} />}

      {/* Canonical Link */}
      <link rel="canonical" href={canonicalUrl} />

      {/* JSON-LD Schemas */}
      {schemas.length > 0 && (
        <script type="application/ld+json">
          {JSON.stringify(schemas)}
        </script>
      )}
    </Helmet>
  );
}
