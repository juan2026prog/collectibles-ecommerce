import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useSiteSettings } from '../hooks/useSiteSettings';
import { BASE_URL } from '../seo/seoConfig';

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

export function SEO({
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

  // Clean and ensure absolute canonical URL starting with https://collectibles.uy without query params
  let canonicalUrl = url;
  if (!canonicalUrl.startsWith('http')) {
    canonicalUrl = `${BASE_URL}${canonicalUrl.startsWith('/') ? '' : '/'}${canonicalUrl}`;
  }
  canonicalUrl = canonicalUrl.replace('http://', 'https://').replace('www.collectibles.uy', 'collectibles.uy');
  // Strip query string and hashes from canonical
  try {
    const parsed = new URL(canonicalUrl);
    canonicalUrl = `${parsed.origin}${parsed.pathname}`;
  } catch {}

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://collectibles.uy/#organization",
    "name": "Collectibles",
    "alternateName": "Collectibles Uruguay",
    "url": BASE_URL,
    "logo": "https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/1775828705619-isologocolle.jpg",
    "description": "Tienda especializada en figuras de acción, Funko Pop, NECA y coleccionables en Uruguay. Figuras que cuentan historias.",
    "sameAs": [
      settings['social_mercadolibre'] || "https://listado.mercadolibre.com.uy/_CustId_2013898864",
      settings['social_instagram'] || "https://instagram.com/collectibles.uy",
      settings['social_facebook'] || "https://facebook.com/collectibles.uy"
    ],
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "customer service",
      "areaServed": "UY",
      "availableLanguage": "es"
    }
  };

  const webSiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": "https://collectibles.uy/#website",
    "name": "Collectibles Uruguay",
    "url": BASE_URL,
    "description": "Tienda especializada en figuras de acción, Funko Pop, NECA y coleccionables en Uruguay. Figuras que cuentan historias.",
    "publisher": {
      "@id": "https://collectibles.uy/#organization"
    },
    "potentialAction": {
      "@type": "SearchAction",
      "target": {
        "@type": "EntryPoint",
        "urlTemplate": "https://collectibles.uy/shop?q={search_term_string}"
      },
      "query-input": "required name=search_term_string"
    }
  };

  const storeSchema = {
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": "https://collectibles.uy/#store",
    "name": "Collectibles Uruguay",
    "url": BASE_URL,
    "description": "Tienda online especializada en figuras de acción, Funko Pop, NECA y coleccionables en Uruguay.",
    "image": "https://cobtsgkwcftvexaarwmo.supabase.co/storage/v1/object/public/public-assets/1775828705619-isologocolle.jpg",
    "priceRange": "$$",
    "currenciesAccepted": "UYU",
    "paymentAccepted": "Cash, Credit Card, Mercado Pago",
    "parentOrganization": {
      "@id": "https://collectibles.uy/#organization"
    },
    "address": {
      "@type": "PostalAddress",
      "addressCountry": "UY"
    }
  };

  const schemas: any[] = [];
  if (type === 'website') {
    schemas.push(organizationSchema, webSiteSchema, storeSchema);
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

export default SEO;
