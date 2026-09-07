import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { 
  GraduationCap, BookOpen, Layers, Sparkles, Search, HelpCircle, 
  ArrowRight, ShieldCheck, Clock, ShoppingBag, Star,
  LayoutGrid, List, CheckCircle2, ChevronRight, Box,
  ChevronDown, ChevronUp, Tag, Wrench, Shield
} from 'lucide-react';
import SEO from '../../components/SEO';

export interface AcademyArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  type: string;
  category_key: string;
  featured_image?: string;
  read_time_minutes?: number;
  category_name?: string;
  level?: string;
}

const ALL_ACADEMY_ARTICLES: AcademyArticle[] = [
  // ─── 1. PRIMEROS PASOS (6 guías) ─────────────────────────────────────────────
  {
    id: 'art-empezar',
    title: 'Cómo Empezar una Colección sin Comprar Todo lo que Ves',
    slug: 'como-empezar-coleccion-figuras',
    excerpt: 'Una guía práctica para definir tu colección, controlar el presupuesto y evitar compras impulsivas. El punto de partida de todo coleccionista.',
    type: 'INICIO',
    category_key: 'start',
    featured_image: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=1200&q=80',
    read_time_minutes: 8,
    category_name: 'Primeros Pasos',
    level: 'Inicial'
  },
  {
    id: 'art-accion-vs-estatuas',
    title: 'Figuras de Acción vs Estatuas: ¿Qué Tipo de Colección es para Ti?',
    slug: 'figuras-accion-vs-estatuas',
    excerpt: 'Articulación, tamaño, materiales y precio: descubre las principales diferencias antes de elegir.',
    type: 'GUÍA',
    category_key: 'start',
    featured_image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80',
    read_time_minutes: 5,
    category_name: 'Primeros Pasos',
    level: 'Inicial'
  },
  {
    id: 'art-foco-coleccion',
    title: 'El Arte del Foco: Cómo Elegir una Sola Línea y Dominarla sin Dispersarse',
    slug: 'el-arte-del-foco-como-elegir-linea-coleccion',
    excerpt: 'La dispersión es la enemiga número uno del coleccionista. Descubre cómo definir un foco temático fuerte y dominar una línea con criterio y coherencia visual.',
    type: 'INICIO',
    category_key: 'start',
    featured_image: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1200&q=80',
    read_time_minutes: 6,
    category_name: 'Primeros Pasos',
    level: 'Inicial'
  },
  {
    id: 'art-completismo-curaduria',
    title: 'Completismo vs Curaduría: Por Qué Intentar Tener Todo Arruina el Disfrute',
    slug: 'completismo-vs-curaduria-coleccionismo',
    excerpt: 'El síndrome de la wave completa genera fatiga y repisas saturadas. Aprende a aplicar curaduría estética para que cada figura destaque como una obra de arte.',
    type: 'INICIO',
    category_key: 'start',
    featured_image: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=1200&q=80',
    read_time_minutes: 5,
    category_name: 'Primeros Pasos',
    level: 'Inicial'
  },
  {
    id: 'art-presupuesto-real',
    title: 'Presupuesto Real del Coleccionista: Costo Oculto de Envíos, Aduana y Exhibición',
    slug: 'presupuesto-real-coleccionista-costos-ocultos',
    excerpt: 'El precio de la figura es solo la mitad de la historia. Guía financiera para calcular fletes internacionales, franquicias aduaneras, vitrinas y accesorios.',
    type: 'COMPRA',
    category_key: 'start',
    featured_image: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1200&q=80',
    read_time_minutes: 7,
    category_name: 'Primeros Pasos',
    level: 'Intermedio'
  },
  {
    id: 'art-caja-cerrada-vs-open',
    title: 'El Síndrome de la Caja Cerrada: Debate Definitivo entre Open-Box y Conservación Sellada',
    slug: 'sindrome-caja-cerrada-open-box-vs-sellado',
    excerpt: '¿Disfrutar en vitrina o especular con precintos de fábrica? Análisis imparcial sobre valor de reventa, degradación del plástico en caja y disfrute personal.',
    type: 'INICIO',
    category_key: 'start',
    featured_image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&q=80',
    read_time_minutes: 6,
    category_name: 'Primeros Pasos',
    level: 'Inicial'
  },

  // ─── 2. ESCALAS & TAMAÑOS (3 guías) ──────────────────────────────────────────
  {
    id: 'art-escalas-nuevo',
    title: 'Guía de Escalas en Figuras de Colección: de 1:18 a 1:4',
    slug: 'guia-escalas-figuras-coleccion',
    excerpt: 'Aprende qué significan las escalas 1:18, 1:12, 1:10, 1:6 y 1:4, cuánto mide cada figura y cuáles pueden exhibirse juntas.',
    type: 'GUÍA',
    category_key: 'scales',
    featured_image: 'https://images.unsplash.com/photo-1608889476518-738c9b1dcb40?w=1200&q=80',
    read_time_minutes: 7,
    category_name: 'Escalas & Tamaños',
    level: 'Inicial'
  },
  {
    id: 'art-salto-escala-1-6',
    title: 'El Salto a 1:6: Requisitos de Espacio, Peso y Soporte Antes de Comprar tu Primera Pieza',
    slug: 'el-salto-a-escala-1-6-requisitos-espacio-vitrinas',
    excerpt: 'Una figura de 30 cm con metal diecast y base dinámica no entra en cualquier estante. Lo que debes preparar en tu habitación antes de recibir tu primer Hot Toys o InArt.',
    type: 'GUÍA',
    category_key: 'scales',
    featured_image: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1200&q=80',
    read_time_minutes: 7,
    category_name: 'Escalas & Tamaños',
    level: 'Avanzado'
  },
  {
    id: 'art-micro-escalas-1-18',
    title: 'Micro-Escalas y Miniaturas: Guía para Integrar Figuras 1:18 y 1:24 en tu Repisa',
    slug: 'micro-escalas-miniaturas-figuras-1-18-y-1-24',
    excerpt: 'De Star Wars Vintage Collection a JoyToy Warhammer 40K: el renacimiento de las 3.75 pulgadas y cómo construir dioramas masivos en espacios reducidos.',
    type: 'GUÍA',
    category_key: 'scales',
    featured_image: 'https://images.unsplash.com/photo-1618336753974-aae8e04506aa?w=1200&q=80',
    read_time_minutes: 5,
    category_name: 'Escalas & Tamaños',
    level: 'Inicial'
  },

  // ─── 3. MARCAS & GAMAS (4 guías) ─────────────────────────────────────────────
  {
    id: 'art-batalla-1-12-import-retail',
    title: 'Batalla en Escala 1:12: Diferencias Reales entre Import Japonés y Retail Americano',
    slug: 'batalla-escala-1-12-import-japones-vs-retail-americano',
    excerpt: 'MAFEX y S.H.Figuarts frente a Marvel Legends y DC Multiverse: comparativa milimétrica de articulación, accesorios, escala real y relación calidad-precio.',
    type: 'GUÍA',
    category_key: 'brands',
    featured_image: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=1200&q=80',
    read_time_minutes: 8,
    category_name: 'Marcas & Gamas',
    level: 'Intermedio'
  },
  {
    id: 'art-frontera-18cm-1-10',
    title: 'La Frontera de los 18 cm: Por Qué la Escala 1:10 de McFarlane y NECA No Encaja con Todo',
    slug: 'frontera-18-cm-escala-1-10-mcfarlane-neca',
    excerpt: 'Las 7 pulgadas tienen una presencia imponente pero generan pesadillas de escala al mezclarse. Cómo armar repisas armoniosas con escala 1:10.',
    type: 'GUÍA',
    category_key: 'brands',
    featured_image: 'https://images.unsplash.com/photo-1608889476518-738c9b1dcb40?w=1200&q=80',
    read_time_minutes: 6,
    category_name: 'Marcas & Gamas',
    level: 'Intermedio'
  },
  {
    id: 'art-lineas-entrada-vs-alta-gama',
    title: 'Líneas de Entrada vs Alta Gama: Bandai Spirits, Good Smile Company y Medicom Explicadas',
    slug: 'lineas-entrada-vs-alta-gama-fabricantes-coleccionismo',
    excerpt: 'Ichibansho vs Figuarts ZERO, Pop Up Parade vs Scale Figures y MAFEX vs Figma: guía de jerarquías para saber exactamente por qué estás pagando.',
    type: 'AUTENTICIDAD',
    category_key: 'brands',
    featured_image: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?w=1200&q=80',
    read_time_minutes: 8,
    category_name: 'Marcas & Gamas',
    level: 'Intermedio'
  },
  {
    id: 'art-titanes-hot-toys-vs-inart',
    title: 'Guerra de Titanes 1:6: Ingeniería de Hot Toys frente a la Silicona y Pelo Enraizado de InArt',
    slug: 'guerra-titanes-1-6-hot-toys-vs-inart-ingenieria',
    excerpt: 'La revolución del hiperrealismo: articulaciones magnéticas, trajes a medida y ojos móviles independientes. El cambio de paradigma en el coleccionismo cinematográfico.',
    type: 'AUTENTICIDAD',
    category_key: 'brands',
    featured_image: 'https://images.unsplash.com/photo-1620428268482-cf1851a36764?w=1200&q=80',
    read_time_minutes: 9,
    category_name: 'Marcas & Gamas',
    level: 'Avanzado'
  },

  // ─── 4. AUTENTICIDAD (3 guías) ───────────────────────────────────────────────
  {
    id: 'art-bootleg-nuevo',
    title: 'Cómo Reconocer una Figura Original y Evitar Bootlegs',
    slug: 'como-reconocer-figura-original-bootleg',
    excerpt: 'Aprende a identificar señales comunes de falsificaciones y qué revisar antes de comprar.',
    type: 'AUTENTICIDAD',
    category_key: 'authenticity',
    featured_image: 'https://images.unsplash.com/photo-1620428268482-cf1851a36764?w=1200&q=80',
    read_time_minutes: 6,
    category_name: 'Autenticidad',
    level: 'Inicial'
  },
  {
    id: 'art-cabezas-custom-3d',
    title: 'El Mercado de las Cabezas Custom: Escultura 3D, Pintura a Mano y Licencias no Oficiales',
    slug: 'mercado-cabezas-custom-escultura-3d-pintura',
    excerpt: 'El auge del aftermarket artístico: escultores digitales, pintores independientes en Patreon e Instagram, y cómo elevar una figura comercial a nivel de museo.',
    type: 'AUTENTICIDAD',
    category_key: 'authenticity',
    featured_image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1200&q=80',
    read_time_minutes: 7,
    category_name: 'Autenticidad',
    level: 'Avanzado'
  },
  {
    id: 'art-resinas-oficiales-vs-garages',
    title: 'El Universo de las Resinas de Estudio: Licencia Oficial frente a Garages No Autorizados',
    slug: 'resinas-estudio-licencia-oficial-vs-garages-custom',
    excerpt: 'Prime 1 Studio, Tsume y XM Studios frente a los estudios independientes sin licencia. Pros, contras de valor, seguridad en envíos y calidad de fundición.',
    type: 'AUTENTICIDAD',
    category_key: 'authenticity',
    featured_image: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=1200&q=80',
    read_time_minutes: 7,
    category_name: 'Autenticidad',
    level: 'Avanzado'
  },

  // ─── 5. CUIDADO & EXHIBICIÓN (6 guías) ───────────────────────────────────────
  {
    id: 'art-materiales-nuevo',
    title: 'PVC, ABS, Resina y Die-Cast: Materiales de las Figuras Explicados',
    slug: 'materiales-figuras-pvc-abs-resina-diecast',
    excerpt: 'Qué diferencias existen entre PVC, ABS, resina y metal die-cast y cómo afectan peso, detalle y resistencia.',
    type: 'MATERIALES',
    category_key: 'care',
    featured_image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1200&q=80',
    read_time_minutes: 6,
    category_name: 'Cuidado & Exhibición',
    level: 'Intermedio'
  },
  {
    id: 'art-cuidar-nuevo',
    title: 'Cómo Cuidar y Exhibir tus Figuras sin Dañarlas',
    slug: 'como-cuidar-exhibir-figuras-coleccion',
    excerpt: 'Luz, polvo, humedad y temperatura: las reglas esenciales para conservar una colección durante años.',
    type: 'CUIDADO',
    category_key: 'care',
    featured_image: 'https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=1200&q=80',
    read_time_minutes: 5,
    category_name: 'Cuidado & Exhibición',
    level: 'Inicial'
  },
  {
    id: 'art-articulaciones-rigidas-calor',
    title: 'Articulaciones Rígidas y Clavijas Quebradas: Técnicas Seguras con Calor para No Romper Figuras',
    slug: 'articulaciones-rigidas-clavijas-quebradas-tecnicas-calor',
    excerpt: 'El método del baño de agua caliente a 60°C y el secador de pelo. Cómo aflojar articulaciones duras de fábrica sin blanquear ni quebrar las clavijas de plástico.',
    type: 'CUIDADO',
    category_key: 'care',
    featured_image: 'https://images.unsplash.com/photo-1545558014-8692077e9b5c?w=1200&q=80',
    read_time_minutes: 6,
    category_name: 'Cuidado & Exhibición',
    level: 'Intermedio'
  },
  {
    id: 'art-articulaciones-flojas-firmeza',
    title: 'Articulaciones Flojas y Desgaste: Cómo Devolverle Firmeza a Rótulas y Ball-Joints sin Pegamento',
    slug: 'articulaciones-flojas-devolver-firmeza-rotulas-sin-pegamento',
    excerpt: 'El uso correcto de polímeros acrílicos al agua (Kiki Loose Joints, barniz acrílico brillante) para engrosar rótulas gastadas sin soldar la articulación.',
    type: 'CUIDADO',
    category_key: 'care',
    featured_image: 'https://images.unsplash.com/photo-1581092918056-0c4c3acd3789?w=1200&q=80',
    read_time_minutes: 5,
    category_name: 'Cuidado & Exhibición',
    level: 'Intermedio'
  },
  {
    id: 'art-posa-dinamica-balance',
    title: 'Centro de Gravedad y Balance: Principios de Posa Dinámica sin Depender de Stands Visibles',
    slug: 'centro-gravedad-balance-posa-dinamica-sin-stands',
    excerpt: 'Línea de acción, distribución del peso en tobillos y rotación de cadera. Cómo lograr que tus figuras de acción luzcan vivas y cinematográficas en la vitrina.',
    type: 'CUIDADO',
    category_key: 'care',
    featured_image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80',
    read_time_minutes: 7,
    category_name: 'Cuidado & Exhibición',
    level: 'Inicial'
  },
  {
    id: 'art-cuidado-ropa-tela-cuerina',
    title: 'Ropa de Tela y Cuerina (Pleather): Cómo Evitar el Cuarteado y Descascarillado con los Años',
    slug: 'cuidado-ropa-tela-cuerina-pleather-evitar-cuarteado',
    excerpt: 'La hidrólisis en chaquetas de cuerina y trajes de vinilo es la peor pesadilla en escala 1:6. Productos hidratantes (303 Aerospace Protectant) y humedad ideal.',
    type: 'MATERIALES',
    category_key: 'care',
    featured_image: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=1200&q=80',
    read_time_minutes: 6,
    category_name: 'Cuidado & Exhibición',
    level: 'Avanzado'
  },

  // ─── 6. MERCADO (4 guías) ───────────────────────────────────────────────────
  {
    id: 'art-edicion-limitada',
    title: 'Edición Limitada, Exclusive, Chase y Pre-Order: Qué Significan',
    slug: 'edicion-limitada-exclusive-chase-preorder',
    excerpt: 'Aprende la diferencia entre edición limitada, exclusiva, chase, preventa y reedición antes de comprar.',
    type: 'COMPRA',
    category_key: 'market',
    featured_image: 'https://images.unsplash.com/photo-1612404730960-5c71577fca11?w=1200&q=80',
    read_time_minutes: 5,
    category_name: 'Mercado',
    level: 'Inicial'
  },
  {
    id: 'art-fomo-aftermarket-reissue',
    title: 'El Fenómeno FOMO y el Aftermarket: Cuándo Pagar Precio de Reventa y Cuándo Esperar un Reissue',
    slug: 'fomo-aftermarket-reventa-vs-esperar-reissue',
    excerpt: 'Psicología del mercado coleccionista: análisis de patrones de reedición de Bandai, MAFEX y Hot Toys para no caer en precios inflados por la histeria.',
    type: 'COMPRA',
    category_key: 'market',
    featured_image: 'https://images.unsplash.com/photo-1614094082869-cd4e4b2905c7?w=1200&q=80',
    read_time_minutes: 7,
    category_name: 'Mercado',
    level: 'Intermedio'
  },
  {
    id: 'art-preventas-depositos-retrasos',
    title: 'Preventas y Depósitos de Reserva: Ciclo de Producción, Retrasos Habituales y Cancelaciones',
    slug: 'preventas-depositos-reserva-ciclo-produccion-retrasos',
    excerpt: 'De la fase de prototipo (grey model) a la aprobación de licencias y el flete marítimo. Guía para entender los tiempos de producción y asegurar tus piezas.',
    type: 'COMPRA',
    category_key: 'market',
    featured_image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&q=80',
    read_time_minutes: 6,
    category_name: 'Mercado',
    level: 'Inicial'
  },
  {
    id: 'art-guia-importacion-uruguay-franquicia',
    title: 'Guía de Importación en Uruguay: Cómo Usar la Franquicia de USD 200 para Coleccionables sin Pagar Recargos',
    slug: 'guia-importacion-uruguay-franquicia-usd-200-figuras',
    excerpt: 'El manual definitivo para coleccionistas uruguayos: reglas de Aduana, facturas comerciales, límite de 3 envíos anuales, peso máximo y cómo evitar retenciones.',
    type: 'COMPRA',
    category_key: 'market',
    featured_image: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1200&q=80',
    read_time_minutes: 8,
    category_name: 'Mercado',
    level: 'Intermedio'
  },

  // ─── 7. GLOSARIO (2 guías) ──────────────────────────────────────────────────
  {
    id: 'art-misb',
    title: 'MISB, MIB, Loose y otros términos del coleccionismo',
    slug: 'misb-mib-loose-glosario-coleccionismo',
    excerpt: '¿MISB? ¿MIB? ¿Loose? Aprende los términos utilizados para describir el estado de figuras y coleccionables.',
    type: 'GLOSARIO',
    category_key: 'glossary',
    featured_image: 'https://images.unsplash.com/photo-1614094082869-cd4e4b2905c7?w=1200&q=80',
    read_time_minutes: 5,
    category_name: 'Glosario',
    level: 'Inicial'
  },
  {
    id: 'art-grading-afa-cas-figuras',
    title: 'Grading en Figuras de Acción: Qué Hacen AFA y CAS y Cuándo Vale la Pena Certificar',
    slug: 'grading-figuras-accion-afa-cas-certificacion',
    excerpt: 'Sub-grados de burbuja, figura y cartón. Cuándo el encapsulado en acrílico agrega valor real de inversión y cuándo es solo un gasto innecesario.',
    type: 'GLOSARIO',
    category_key: 'glossary',
    featured_image: 'https://images.unsplash.com/photo-1612404730960-5c71577fca11?w=1200&q=80',
    read_time_minutes: 6,
    category_name: 'Glosario',
    level: 'Avanzado'
  }
];

export interface GlossaryTerm {
  term: string;
  spanish_term?: string;
  definition: string;
  category: 'Autenticidad' | 'Estado' | 'Mercado' | 'Técnico' | 'Materiales';
  group?: string;
  is_essential?: boolean;
}

const DEFAULT_GLOSSARY: GlossaryTerm[] = [
  // ─── 1. AUTENTICIDAD ──────────────────────────────────────────────────────────
  // Esenciales (6)
  { term: 'Official', spanish_term: 'Oficial', definition: 'Producto producido oficialmente por la marca o fabricante autorizado.', category: 'Autenticidad', is_essential: true },
  { term: 'Licensed', spanish_term: 'Licenciado', definition: 'Producto fabricado con autorización oficial del titular de los derechos de autor o propiedad intelectual.', category: 'Autenticidad', is_essential: true },
  { term: 'Bootleg', spanish_term: 'Bootleg / Falsificación', definition: 'Producto no autorizado que utiliza personajes, diseños o propiedades intelectuales sin permiso.', category: 'Autenticidad', is_essential: true },
  { term: 'KO / Knockoff', spanish_term: 'KO / Copia', definition: 'Copia no autorizada que intenta reproducir directamente una figura o molde oficial existente.', category: 'Autenticidad', is_essential: true },
  { term: 'Counterfeit', spanish_term: 'Falsificación engañosa', definition: 'Producto creado específicamente para hacerse pasar por una pieza auténtica, imitando empaque, logos y sellos oficiales con intención de engaño.', category: 'Autenticidad', is_essential: true },
  { term: 'Unlicensed', spanish_term: 'No licenciado', definition: 'Producto basado en una propiedad intelectual sin autorización formal, común en estatuas custom y merchandising de terceros.', category: 'Autenticidad', is_essential: true },
  // Copias y alteraciones (7)
  { term: 'Third-Party', spanish_term: 'Terceros (3P)', definition: 'Fabricante independiente que diseña figuras o complementos compatibles sin licencia formal pero con molde propio.', category: 'Autenticidad', group: 'Copias y alteraciones' },
  { term: 'Recast', spanish_term: 'Recasting / Copia de molde', definition: 'Reproducción no autorizada obtenida al clonar directamente el molde de una pieza original, muy común en estatuas de resina.', category: 'Autenticidad', group: 'Copias y alteraciones' },
  { term: 'Repro / Reproduction', spanish_term: 'Repro / Reproducción', definition: 'Caja, accesorio, sticker, arma u otra parte recreada posteriormente que no pertenece a la producción original.', category: 'Autenticidad', group: 'Copias y alteraciones' },
  { term: 'Factory Reject', spanish_term: 'Rechazo de fábrica', definition: 'Unidad descartada en control de calidad que sale al mercado irregular por canales no oficiales.', category: 'Autenticidad', group: 'Copias y alteraciones' },
  { term: 'Resealed', spanish_term: 'Resellado', definition: 'Producto abierto cuyo empaque fue vuelto a cerrar con cinta o calor intentando simular su estado de fábrica.', category: 'Autenticidad', group: 'Copias y alteraciones' },
  { term: 'Tampered', spanish_term: 'Manipulado / Alterado', definition: 'Empaque o pieza que presenta aperturas forzadas, cambios de piezas internas o alteraciones posteriores a su fabricación.', category: 'Autenticidad', group: 'Copias y alteraciones' },
  { term: 'Authentic but Modified', spanish_term: 'Auténtico modificado', definition: 'Pieza auténtica que fue repintada, reparada o customizada, alejándose de su estado original de fábrica.', category: 'Autenticidad', group: 'Copias y alteraciones' },
  // Verificación (5)
  { term: 'Original Parts', spanish_term: 'Partes originales', definition: 'Componentes auténticos pertenecientes a la tirada y producción oficial de fábrica.', category: 'Autenticidad', group: 'Verificación' },
  { term: 'COA', spanish_term: 'Certificado de Autenticidad', definition: 'Certificate of Authenticity emitido por el fabricante o artista para garantizar la legitimidad y numeración de la pieza.', category: 'Autenticidad', group: 'Verificación' },
  { term: 'Serial Number', spanish_term: 'Número de serie', definition: 'Código alfanumérico único grabado en la caja o base para registro y validación con el fabricante.', category: 'Autenticidad', group: 'Verificación' },
  { term: 'Hologram / Authenticity Sticker', spanish_term: 'Sticker holográfico de autenticidad', definition: 'Sello brillante de seguridad (Toei cat, Bandai Spirits, Marvel) colocado en empaques para certificar licencias oficiales.', category: 'Autenticidad', group: 'Verificación' },
  { term: 'Provenance', spanish_term: 'Procedencia / Historial', definition: 'Historial documentado del origen, factura de compra y propietarios anteriores de una pieza de alto valor.', category: 'Autenticidad', group: 'Verificación' },
  // Producción (2)
  { term: 'Prototype', spanish_term: 'Prototipo', definition: 'Pieza de prueba esculpida durante el desarrollo del producto antes de comenzar la producción comercial en serie.', category: 'Autenticidad', group: 'Producción' },
  { term: 'Production Sample', spanish_term: 'Muestra de producción', definition: 'Unidad producida para auditar acabados, empaques y control de calidad antes del lanzamiento masivo.', category: 'Autenticidad', group: 'Producción' },

  // ─── 2. ESTADO ────────────────────────────────────────────────────────────────
  // Esenciales (6)
  { term: 'MISB', spanish_term: 'Mint in Sealed Box', definition: 'Pieza completamente nueva dentro de su caja original, todavía con los sellos y precintos de fábrica intactos.', category: 'Estado', is_essential: true },
  { term: 'MIB', spanish_term: 'Mint in Box', definition: 'Pieza en estado impecable conservada con su empaque original; la caja pudo haber sido abierta para inspección.', category: 'Estado', is_essential: true },
  { term: 'NIB', spanish_term: 'New in Box', definition: 'Producto nuevo sin uso dentro de su empaque original de fábrica.', category: 'Estado', is_essential: true },
  { term: 'Loose', spanish_term: 'Loose / Sin empaque', definition: 'Figura fuera de su caja original. Ideal para exhibir en vitrina; no significa que esté dañada.', category: 'Estado', is_essential: true },
  { term: 'CIB', spanish_term: 'Complete in Box', definition: 'Pieza que conserva su empaque original junto con la totalidad de accesorios, manuales e inserts correspondientes.', category: 'Estado', is_essential: true },
  { term: 'Complete', spanish_term: 'Completo', definition: 'Conserva todos sus accesorios, manos intercambiables, armas y soportes originales de fábrica.', category: 'Estado', is_essential: true },
  // Empaque (6)
  { term: 'MOC', spanish_term: 'Mint on Card', definition: 'Figura en estado impecable preservada sobre su cartón blister original.', category: 'Estado', group: 'Empaque' },
  { term: 'MOSC', spanish_term: 'Mint on Sealed Card', definition: 'Figura en card original con la burbuja plástica sellada de fábrica sin abrir.', category: 'Estado', group: 'Empaque' },
  { term: 'NRFB', spanish_term: 'Never Removed From Box', definition: 'El empaque exterior fue abierto pero la figura nunca fue retirada de sus anclajes o blisters internos.', category: 'Estado', group: 'Empaque' },
  { term: 'Boxed', spanish_term: 'Con caja', definition: 'Conserva la caja original, aunque pueda presentar desgaste o no estar sellada.', category: 'Estado', group: 'Empaque' },
  { term: 'Opened / Displayed', spanish_term: 'Abierto / En vitrina', definition: 'Pieza retirada de la caja y exhibida en vitrina en condiciones cuidadas de coleccionista.', category: 'Estado', group: 'Empaque' },
  { term: 'Incomplete', spanish_term: 'Incompleto', definition: 'Pieza a la que le falta al menos un accesorio, mano, arma o base original.', category: 'Estado', group: 'Empaque' },
  // Certificación (3)
  { term: 'Graded', spanish_term: 'Graduado / Calificado', definition: 'Coleccionable auditado por expertos independientes y sellado en cápsula acrílica con nota de conservación.', category: 'Estado', group: 'Certificación' },
  { term: 'AFA', spanish_term: 'Action Figure Authority', definition: 'Servicio y autoridad especializada en autenticar, graduar con nota numérica (escala 1-100) y encapsular figuras y juguetes.', category: 'Estado', group: 'Certificación' },
  { term: 'CAS', spanish_term: 'Collector Archive Services', definition: 'Servicio profesional independiente de preservación, certificación y graduado de figuras vintage y modernas.', category: 'Estado', group: 'Certificación' },

  // ─── 3. MERCADO ───────────────────────────────────────────────────────────────
  // Esenciales (6)
  { term: 'Chase', spanish_term: 'Chase / Variante rara', definition: 'Variante deliberadamente más difícil de conseguir, distribuida al azar en proporciones reducidas dentro de una tirada estándar.', category: 'Mercado', is_essential: true },
  { term: 'Pre-Order', spanish_term: 'Preventa', definition: 'Reserva anticipada antes del lanzamiento comercial. La fecha de entrega es estimada y sujeta a logística internacional.', category: 'Mercado', is_essential: true },
  { term: 'Grail', spanish_term: 'Santo Grial', definition: 'La pieza más codiciada, difícil y representativa que un coleccionista busca para coronar su colección.', category: 'Mercado', is_essential: true },
  { term: 'Reissue', spanish_term: 'Reedición', definition: 'Nueva tanda de producción oficial autorizada por la marca tras haberse agotado el tiraje inicial.', category: 'Mercado', is_essential: true },
  { term: 'Aftermarket', spanish_term: 'Mercado secundario', definition: 'Mercado de reventa entre coleccionistas y tiendas especializadas una vez finalizada la distribución oficial.', category: 'Mercado', is_essential: true },
  { term: 'Variant / Repaint', spanish_term: 'Variante / Repintado', definition: 'Versión alternativa que utiliza el mismo molde con un esquema de color diferente o detalles exclusivos.', category: 'Mercado', is_essential: true },
  // Lanzamientos (4)
  { term: 'Restock', spanish_term: 'Reposición de stock', definition: 'Entrada de nuevas unidades disponibles para compra en tiendas oficiales tras haberse agotado.', category: 'Mercado', group: 'Lanzamientos' },
  { term: 'Sold Out', spanish_term: 'Agotado', definition: 'Producto sin existencias en los canales de venta primarios.', category: 'Mercado', group: 'Lanzamientos' },
  { term: 'Waitlist', spanish_term: 'Lista de espera', definition: 'Registro de compradores interesados en acceder a una unidad reservada en caso de cancelaciones.', category: 'Mercado', group: 'Lanzamientos' },
  { term: 'Pre-Owned', spanish_term: 'Segunda mano', definition: 'Pieza que anteriormente perteneció a otro coleccionista antes de volver a ingresar al mercado.', category: 'Mercado', group: 'Lanzamientos' },
  // Ediciones (3)
  { term: 'Exclusive / Exclusiva', spanish_term: 'Edición Exclusiva', definition: 'Pieza distribuida únicamente por un canal o evento determinado (Retailer Exclusive en cadenas específicas, Convention Exclusive en eventos como SDCC o NYCC, o Event Exclusive).', category: 'Mercado', group: 'Ediciones' },
  { term: 'Limited Edition', spanish_term: 'Edición Limitada', definition: 'Producto cuya fabricación está restringida por cantidad de unidades o ventana temporal estricta.', category: 'Mercado', group: 'Ediciones' },
  { term: 'Numbered Edition', spanish_term: 'Edición Numerada', definition: 'Edición de colección donde cada pieza tiene grabado su número individual dentro de la tirada total (ej: 245/1000).', category: 'Mercado', group: 'Ediciones' },
  // Comportamiento del mercado (3)
  { term: 'Peg Warmer', spanish_term: 'Estancado en góndola', definition: 'Figura con baja demanda que permanece durante meses en los estantes comerciales sin venderse.', category: 'Mercado', group: 'Comportamiento del mercado' },
  { term: 'Bundle / Set', spanish_term: 'Pack / Set', definition: 'Conjunto de múltiples figuras o accesorios complementarios vendidos conjuntamente.', category: 'Mercado', group: 'Comportamiento del mercado' },
  { term: 'Army Builder', spanish_term: 'Constructor de ejércitos', definition: 'Personajes genéricos o soldados (Stormtroopers, Clones, Ninjas) diseñados para comprar en volumen y armar dioramas masivos.', category: 'Mercado', group: 'Comportamiento del mercado' },

  // ─── 4. TÉCNICO ───────────────────────────────────────────────────────────────
  // Esenciales (6)
  { term: 'Pinless Joints', spanish_term: 'Articulación sin pernos', definition: 'Sistema moderno de articulación sin remaches metálicos ni orificios visibles en codos y rodillas.', category: 'Técnico', is_essential: true },
  { term: 'Double Jointed', spanish_term: 'Doble articulación', definition: 'Mecanismo con dos ejes de giro en codos o rodillas que permite doblar la extremidad casi 180°.', category: 'Técnico', is_essential: true },
  { term: 'Butterfly Joint', spanish_term: 'Articulación mariposa', definition: 'Pivote en el interior del hombro que permite llevar los brazos hacia adelante para poses de tiro o cruce de brazos.', category: 'Técnico', is_essential: true },
  { term: 'PERS', spanish_term: 'Parallel Eyeball Rolling System', definition: 'Mecanismo interno con palanca que permite mover y fijar ambos ojos de la figura de forma independiente y realista.', category: 'Técnico', is_essential: true },
  { term: 'BAF', spanish_term: 'Build-A-Figure', definition: 'Figura de gran tamaño cuyas piezas individuales vienen repartidas entre los distintos personajes de una misma wave.', category: 'Técnico', is_essential: true },
  { term: 'Custom / Kitbash', spanish_term: 'Custom / Combinación de piezas', definition: 'Pieza personalizada o creada combinando partes de diferentes figuras, modelado 3D y pintura artesanal.', category: 'Técnico', is_essential: true },
  // Articulación (4)
  { term: 'Ball Joint', spanish_term: 'Rótula esférica', definition: 'Articulación de bola que permite rotación e inclinación multidireccional en cuello, muñecas y tobillos.', category: 'Técnico', group: 'Articulación' },
  { term: 'Ankle Rocker', spanish_term: 'Inclinación de tobillo', definition: 'Movimiento lateral en los pies indispensable para mantener las plantas firmes sobre la repisa en poses abiertas.', category: 'Técnico', group: 'Articulación' },
  { term: 'Drop-Down Hips', spanish_term: 'Caderas extensibles', definition: 'Mecanismo que desciende la pierna unos milímetros para lograr patadas altas sin rozar la entrepierna.', category: 'Técnico', group: 'Articulación' },
  { term: 'Ratchet Joint', spanish_term: 'Articulación dentada (clic)', definition: 'Engranaje interno con clics audibles diseñado para soportar piezas pesadas sin vencerse por gravedad.', category: 'Técnico', group: 'Articulación' },
  // Diseño y acabado (5)
  { term: 'Swappable Parts', spanish_term: 'Partes intercambiables', definition: 'Manos, cabezas, armas y rostros diseñados para cambiarse a presión de forma rápida y segura.', category: 'Técnico', group: 'Diseño y acabado' },
  { term: 'Likeness', spanish_term: 'Parecido / Fidelidad facial', definition: 'Nivel de exactitud con el que la escultura facial reproduce las facciones reales del actor o personaje.', category: 'Técnico', group: 'Diseño y acabado' },
  { term: 'Paint Apps', spanish_term: 'Aplicaciones de pintura', definition: 'Calidad, sombreados, tampografía y degradados aplicados en fábrica sobre la figura.', category: 'Técnico', group: 'Diseño y acabado' },
  { term: 'QC', spanish_term: 'Control de Calidad', definition: 'Quality Control: proceso de inspección de fábrica para detectar defectos de pintura o articulaciones flojas.', category: 'Técnico', group: 'Diseño y acabado' },
  { term: 'Seamless Body', spanish_term: 'Cuerpo continuo sin articulaciones visibles', definition: 'Estructura interna de metal articulado recubierta por silicona médica flexible que oculta articulaciones mecánicas.', category: 'Técnico', group: 'Diseño y acabado' },

  // ─── 5. MATERIALES ────────────────────────────────────────────────────────────
  { term: 'PVC', spanish_term: 'Policloruro de vinilo', definition: 'Plástico flexible y resistente ideal para extremidades, cabellos, capas y detalles exteriores.', category: 'Materiales' },
  { term: 'ABS', spanish_term: 'Acrilonitrilo Butadieno Estireno', definition: 'Plástico rígido de alta densidad utilizado en esqueletos internos, armaduras y articulaciones mecánicas.', category: 'Materiales' },
  { term: 'Diecast', spanish_term: 'Metal fundido a presión', definition: 'Aleación de zinc y aluminio que aporta peso real, estabilidad estructural y acabados metálicos auténticos.', category: 'Materiales' },
  { term: 'Resin', spanish_term: 'Resina', definition: 'Material de escultura premium que captura detalles microscópicos y texturas orgánicas, aunque es rígido y frágil ante caídas.', category: 'Materiales' },
  { term: 'Polystone', spanish_term: 'Polystone (Resina con polvo de piedra)', definition: 'Compuesto pesado y frío al tacto utilizado en estatuas de museo por su estabilidad y sensación pétrea.', category: 'Materiales' },
  { term: 'Silicone', spanish_term: 'Silicona médica de grado platino', definition: 'Material suave de alta durabilidad usado en torsos realistas y bustos 1:1 por su textura idéntica a la piel humana.', category: 'Materiales' },
  { term: 'Soft Goods', spanish_term: 'Ropa de tela real', definition: 'Prendas confeccionadas a escala en telas auténticas, cuero sintético o alambres para poses dinámicas.', category: 'Materiales' },
  { term: 'Rooted Hair', spanish_term: 'Pelo injertado mechón por mechón', definition: 'Cabello de fibra natural o sintética implantado manualmente en la cabeza para un hiperrealismo cinematográfico.', category: 'Materiales' }
];

const GLOSSARY_CATEGORIES = [
  'Autenticidad',
  'Estado',
  'Mercado',
  'Técnico',
  'Materiales',
  'Todos'
] as const;

type GlossaryCategory = typeof GLOSSARY_CATEGORIES[number];

const CATEGORY_ICONS: Record<string, any> = {
  'Autenticidad': ShieldCheck,
  'Estado': Box,
  'Mercado': Tag,
  'Técnico': Wrench,
  'Materiales': Layers,
  'Todos': BookOpen
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  'Autenticidad': 'Guía para diferenciar piezas oficiales y licenciadas de copias, falsificaciones, recasts y réplicas.',
  'Estado': 'Nomenclatura estándar del mercado para describir la condición física y empaque de figuras.',
  'Mercado': 'Términos comerciales clave sobre preventas, rareza, ediciones limitadas y mercado secundario.',
  'Técnico': 'Ingeniería, tipos de articulaciones, sistemas de posado y terminología de escultura.',
  'Materiales': 'Diferencias clave entre plásticos, aleaciones metálicas, resinas y textiles a escala.',
  'Todos': 'Índice general estructurado de toda la terminología del coleccionismo.'
};

// ─── METADATA DE LAS 7 CATEGORÍAS EDITORIALES DE GUÍAS ────────────────────────
export interface GuideCategoryMeta {
  key: string;
  name: string;
  count: number;
  icon: any;
  description: string;
}

const GUIDE_CATEGORIES_METADATA: GuideCategoryMeta[] = [
  { key: 'start', name: 'Primeros Pasos', count: 6, icon: GraduationCap, description: 'Bases, presupuestos y criterios para construir una colección sostenible.' },
  { key: 'scales', name: 'Escalas & Tamaños', count: 3, icon: Layers, description: 'Dimensiones reales, compatibilidad y requerimientos de vitrina.' },
  { key: 'brands', name: 'Marcas & Gamas', count: 4, icon: Sparkles, description: 'Fabricantes, líneas de producto, filosofías de diseño y diferencias de gama.' },
  { key: 'authenticity', name: 'Autenticidad', count: 3, icon: ShieldCheck, description: 'Identificación de piezas originales, bootlegs, copias no autorizadas y customs.' },
  { key: 'care', name: 'Cuidado & Exhibición', count: 6, icon: Box, description: 'Materiales, conservación, técnicas de reparación y principios de posado.' },
  { key: 'market', name: 'Mercado', count: 4, icon: ShoppingBag, description: 'Preventas, exclusivas, aftermarket, compras internacionales y franquicias.' },
  { key: 'glossary', name: 'Glosario', count: 2, icon: HelpCircle, description: 'Terminología técnica fundamental y sistemas de certificación.' },
];

const CATEGORY_TABS = [
  { key: 'start', label: 'Primeros Pasos', icon: GraduationCap, count: 6 },
  { key: 'scales', label: 'Escalas & Tamaños', icon: Layers, count: 3 },
  { key: 'brands', label: 'Marcas & Gamas', icon: Sparkles, count: 4 },
  { key: 'authenticity', label: 'Autenticidad', icon: ShieldCheck, count: 3 },
  { key: 'care', label: 'Cuidado & Exhibición', icon: Box, count: 6 },
  { key: 'market', label: 'Mercado', icon: ShoppingBag, count: 4 },
  { key: 'glossary', label: 'Glosario', icon: HelpCircle, count: 2 },
];

const TYPE_COLORS: Record<string, string> = {
  'INICIO': 'bg-sky-500 text-black',
  'GUÍA': 'bg-emerald-500 text-black',
  'AUTENTICIDAD': 'bg-red-500 text-white',
  'MATERIALES': 'bg-violet-500 text-white',
  'CUIDADO': 'bg-amber-500 text-black',
  'GLOSARIO': 'bg-zinc-600 text-white',
  'COMPRA': 'bg-orange-500 text-black',
  'GUÍAS DE COMPRA': 'bg-orange-500 text-black',
};

function getTypeBadgeClass(type: string): string {
  return TYPE_COLORS[type] ?? 'bg-zinc-700 text-white';
}

export default function AcademyHome() {
  // Categoría por defecto: Primeros Pasos
  const [activeTab, setActiveTab] = useState<string>('start');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Preferencia de Vista Compacta con persistencia en localStorage
  const [isCompactView, setIsCompactView] = useState<boolean>(() => {
    try {
      return localStorage.getItem('academyCompactView') === 'true';
    } catch {
      return false;
    }
  });

  const [selectedGlossaryCategory, setSelectedGlossaryCategory] = useState<GlossaryCategory>('Autenticidad');
  const [glossarySearch, setGlossarySearch] = useState<string>('');
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [selectedScaleIndex, setSelectedScaleIndex] = useState<number>(1); // Default to 1:12
  
  const [scales, setScales] = useState<any[]>([]);
  const [glossary, setGlossary] = useState<GlossaryTerm[]>(DEFAULT_GLOSSARY);
  const [imageOverrides, setImageOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadAcademyData();
  }, []);

  const handleToggleCompactView = (val: boolean) => {
    setIsCompactView(val);
    try {
      localStorage.setItem('academyCompactView', String(val));
    } catch (e) {
      console.error(e);
    }
  };

  const loadAcademyData = async () => {
    try {
      setLoading(true);
      const [scaRes, imgRes] = await Promise.all([
        supabase.from('academy_scales').select('*').order('created_at', { ascending: true }),
        supabase.from('academy_article_images').select('article_id, image_url')
      ]);

      setScales(scaRes.data && scaRes.data.length > 0 ? scaRes.data : [
        { scale_key: '1:18', label: 'Escala 1:18 (3.75 pulgadas)', approx_height_cm: '9,5 – 10,5 cm', description: 'Escala histórica de figuras vintage (Star Wars 1977, G.I. Joe) y vehículos. Ideal para dioramas masivos y colecciones numerosas en poco espacio.' },
        { scale_key: '1:12', label: 'Escala 1:12 (Six Inch)', approx_height_cm: '15 – 18 cm', description: 'El estándar rey del coleccionismo mundial moderno: Marvel Legends, MAFEX, S.H. Figuarts, Mezco One:12. Gran detalle, articulación y fácil exhibición.' },
        { scale_key: '1:10', label: 'Escala 1:10 (7 pulgadas)', approx_height_cm: '18 – 22 cm', description: 'Muy utilizada en estatuas y líneas de NECA / McFarlane. Mayor peso y presencia escultórica con menor articulación interna.' },
        { scale_key: '1:6', label: 'Escala 1:6 (Sixth Scale / 12")', approx_height_cm: '28 – 32 cm', description: 'Alta gama hiperrealista con trajes de tela real cosidos a mano, cabezas pintadas con ojos móviles (PERS) y metal Die-cast (Hot Toys, Sideshow, InArt).' },
        { scale_key: '1:4', label: 'Escala 1:4 (Quarter Scale)', approx_height_cm: '45 – 55 cm', description: 'Grandes piezas centrales de museo y estatuas de resina premium. Requieren vitrinas reforzadas y espacio exclusivo dedicado.' },
        { scale_key: '1:1', label: 'Escala 1:1 (Life-Size / Busto)', approx_height_cm: '160 – 190 cm (Bustos: 60 – 90 cm)', description: 'Réplicas exactas a tamaño real 1:1 con ojos protésicos de vidrio, pelo de silicona insertado y nivel de detalle cinematográfico de museo.' },
      ]);

      // Cargar overrides de imagen desde Supabase
      if (imgRes.data && imgRes.data.length > 0) {
        const overrideMap: Record<string, string> = {};
        imgRes.data.forEach((row: any) => {
          if (row.article_id && row.image_url) {
            overrideMap[row.article_id] = row.image_url;
          }
        });
        setImageOverrides(overrideMap);
      }

      setGlossary(DEFAULT_GLOSSARY);
    } catch (err) {
      console.error(err);
      setGlossary(DEFAULT_GLOSSARY);
    } finally {
      setLoading(false);
    }
  };

  const toggleGroup = (groupName: string) => {
    setOpenGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  };

  // Filtrado de artículos según tab y buscador (con override de imagen aplicado)
  const filteredArticles = useMemo(() => {
    return ALL_ACADEMY_ARTICLES
      .filter(art => {
        const matchesTab = activeTab === 'all' || art.category_key === activeTab;
        const matchesQuery = searchQuery.trim() === '' ||
          art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          art.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
          art.category_name?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesTab && matchesQuery;
      })
      .map(art => ({
        ...art,
        featured_image: imageOverrides[art.id] ?? art.featured_image,
      }));
  }, [activeTab, searchQuery, imageOverrides]);

  // Búsqueda en el glosario
  const glossarySearchResults = useMemo(() => {
    if (!glossarySearch.trim()) return [];
    const q = glossarySearch.toLowerCase().trim();
    return DEFAULT_GLOSSARY.filter(item => 
      item.term.toLowerCase().includes(q) ||
      (item.spanish_term && item.spanish_term.toLowerCase().includes(q)) ||
      item.definition.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.group && item.group.toLowerCase().includes(q))
    );
  }, [glossarySearch]);

  // Términos de la categoría activa
  const currentCategoryTerms = useMemo(() => {
    if (selectedGlossaryCategory === 'Todos') return DEFAULT_GLOSSARY;
    return DEFAULT_GLOSSARY.filter(item => item.category === selectedGlossaryCategory);
  }, [selectedGlossaryCategory]);

  const essentialTerms = useMemo(() => {
    return currentCategoryTerms.filter(item => item.is_essential);
  }, [currentCategoryTerms]);

  const secondaryGroups = useMemo(() => {
    const groupsMap = new Map<string, GlossaryTerm[]>();
    currentCategoryTerms.forEach(item => {
      if (item.group) {
        if (!groupsMap.has(item.group)) {
          groupsMap.set(item.group, []);
        }
        groupsMap.get(item.group)!.push(item);
      }
    });
    return Array.from(groupsMap.entries()).map(([groupName, items]) => ({
      groupName,
      items
    }));
  }, [currentCategoryTerms]);

  const activeScale = scales[selectedScaleIndex] || scales[0];

  // Helper para renderizar una Card de Guía según modo compacto o regular
  const renderArticleCard = (art: AcademyArticle & { featured_image?: string }) => {
    if (isCompactView) {
      return (
        <Link
          key={art.id}
          to={`/academy/${art.slug}`}
          className="group flex flex-col justify-between bg-zinc-900/90 border border-zinc-800 hover:border-emerald-500/50 rounded-xl p-4 transition duration-200 shadow-md hover:shadow-emerald-500/5 space-y-3"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                  {art.category_name}
                </span>
                <span className="text-zinc-600">·</span>
                <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${getTypeBadgeClass(art.type)}`}>
                  {art.type}
                </span>
                {art.level && (
                  <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                    {art.level}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 text-[11px] font-medium text-zinc-400 flex-shrink-0">
                <Clock size={11} className="text-emerald-400" />
                <span>{art.read_time_minutes} min</span>
              </div>
            </div>

            <h3 className="font-bold text-sm text-white group-hover:text-emerald-400 transition leading-snug line-clamp-2">
              {art.title}
            </h3>

            <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
              {art.excerpt}
            </p>
          </div>

          <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between text-xs font-bold text-emerald-400 group-hover:translate-x-0.5 transition">
            <span>Leer guía</span>
            <ArrowRight size={13} />
          </div>
        </Link>
      );
    }

    return (
      <Link
        key={art.id}
        to={`/academy/${art.slug}`}
        className="group flex flex-col bg-zinc-900/90 border border-zinc-800 hover:border-emerald-500/50 rounded-2xl overflow-hidden transition duration-300 shadow-lg hover:shadow-emerald-500/5"
      >
        {/* Image header */}
        <div className="relative w-full h-44 bg-zinc-950 overflow-hidden">
          {art.featured_image && (
            <img
              src={art.featured_image}
              alt={art.title}
              className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
              loading="lazy"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-transparent to-black/20" />
          
          {/* Badges */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5">
            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${getTypeBadgeClass(art.type)}`}>
              {art.type}
            </span>
            {art.level && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-black/70 backdrop-blur text-zinc-300 border border-zinc-700">
                {art.level}
              </span>
            )}
          </div>

          <div className="absolute bottom-2.5 left-3 flex items-center gap-1 text-[11px] font-semibold text-zinc-300 bg-black/60 backdrop-blur px-2 py-0.5 rounded-md">
            <Clock size={11} className="text-emerald-400" />
            <span>{art.read_time_minutes} min lectura</span>
          </div>
        </div>

        {/* Content body */}
        <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
          <div className="space-y-1.5">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              {art.category_name}
            </div>
            <h3 className="font-bold text-sm text-white group-hover:text-emerald-400 transition leading-snug line-clamp-2">
              {art.title}
            </h3>
            <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
              {art.excerpt}
            </p>
          </div>

          <div className="pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-xs font-bold text-emerald-400 group-hover:translate-x-0.5 transition">
            <span>Leer guía completa</span>
            <ArrowRight size={13} />
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-[#0a0c0e] text-white py-8 px-4 sm:px-6 lg:px-8 space-y-12">
      <SEO
        title="Collector Academy | Enciclopedia & Guías del Coleccionista"
        description="Aprende sobre escalas (1:18 a 1:1 Life-Size), marcas, autenticidad de figuras, materiales PVC/resina/die-cast, cómo empezar tu colección, glosario MISB/MIB/Loose y mercado internacional."
      />

      {/* ── 1. HEADER HERO COMPACTO ────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800/80 p-6 sm:p-10 shadow-2xl">
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-black uppercase tracking-wider">
                <GraduationCap size={15} />
                <span>Collector Academy • Base de Conocimiento Editorial</span>
              </div>
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
                Aprende, compara y colecciona como un experto
              </h1>
              <p className="text-sm text-zinc-400 leading-relaxed max-w-xl">
                28 guías técnicas independientes sobre escalas, marcas, autenticidad, cuidado de piezas, mercado internacional y terminología de figuras de colección.
              </p>
              
              {/* Quick stats badges */}
              <div className="flex flex-wrap items-center gap-2.5 pt-1 text-xs text-zinc-400">
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60 font-medium">
                  <BookOpen size={13} className="text-emerald-400" /> 28 Guías completas
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60 font-medium">
                  <Layers size={13} className="text-sky-400" /> 6 Escalas analizadas
                </span>
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800/80 border border-zinc-700/60 font-medium">
                  <HelpCircle size={13} className="text-amber-400" /> Glosario técnico
                </span>
              </div>
            </div>

            {/* Quick Search Box */}
            <div className="w-full lg:w-80 flex-shrink-0 bg-zinc-950/80 backdrop-blur border border-zinc-800 p-4 rounded-2xl space-y-3">
              <div className="flex items-center justify-between text-xs font-bold text-zinc-300">
                <span className="flex items-center gap-1.5">
                  <Search size={14} className="text-emerald-400" /> Buscar en la Academy
                </span>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Ej: Escalas, Bootleg, Resina, InArt..."
                  className="w-full pl-9 pr-3 py-2.5 bg-zinc-900 border border-zinc-700/80 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition"
                />
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                {searchQuery && (
                  <button 
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 hover:text-white"
                  >
                    Limpiar
                  </button>
                )}
              </div>
              <div className="text-[11px] text-zinc-500">
                Tip: Busca en las 28 guías por título, contenido o categoría.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. SECCIÓN PRINCIPAL: TABS Y FEED DE ARTÍCULOS ─────────────────────── */}
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* ── BARRA DE NAVEGACIÓN Y HERRAMIENTAS EDITORIALES ── */}
        <div className="space-y-3">
          
          {/* Nivel 1: Menú de Categorías (7 botones de ancho idéntico, distribución equitativa de borde a borde) */}
          <div className="bg-zinc-950/80 backdrop-blur border border-zinc-800/90 rounded-2xl p-2 shadow-lg">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 w-full">
              {CATEGORY_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2 py-2 rounded-xl text-xs font-bold transition cursor-pointer w-full text-center ${
                      isActive
                        ? 'bg-emerald-500 text-black shadow-md shadow-emerald-500/25 font-black'
                        : 'bg-zinc-900/60 border border-zinc-800/80 text-zinc-400 hover:text-white hover:border-zinc-700 hover:bg-zinc-850'
                    }`}
                  >
                    <Icon size={14} className={`flex-shrink-0 ${isActive ? 'text-black' : 'text-zinc-400'}`} />
                    <span className="truncate">{tab.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold flex-shrink-0 ${
                      isActive ? 'bg-black/20 text-black' : 'bg-zinc-800 text-zinc-400'
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Nivel 2: Barra de Contexto y Herramientas (Sub-bar alineado y balanceado) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 pb-3 border-b border-zinc-800/80">
            
            {/* Info de la categoría activa / Búsqueda */}
            <div className="flex items-center gap-2.5 min-w-0">
              {searchQuery.trim() ? (
                <div className="text-xs text-zinc-400 flex items-center gap-2">
                  <span>
                    Resultados para <strong className="text-white">"{searchQuery}"</strong> ({filteredArticles.length} {filteredArticles.length === 1 ? 'guía' : 'guías'})
                  </span>
                  <button
                    onClick={() => setSearchQuery('')}
                    className="text-emerald-400 hover:underline cursor-pointer text-xs ml-2"
                  >
                    Limpiar búsqueda
                  </button>
                </div>
              ) : activeTab === 'all' ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-400">Todas las Guías</span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-xs text-zinc-400">28 guías organizadas en 7 áreas temáticas</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                    {GUIDE_CATEGORIES_METADATA.find(c => c.key === activeTab)?.name}
                  </span>
                  <span className="text-zinc-600">·</span>
                  <span className="text-xs text-zinc-400">
                    {GUIDE_CATEGORIES_METADATA.find(c => c.key === activeTab)?.description}
                  </span>
                </div>
              )}
            </div>

            {/* Controles secundarios: Todas las guías + Sin Imágenes + Switcher de Vistas */}
            <div className="flex items-center justify-between sm:justify-end gap-2.5 flex-shrink-0 flex-wrap sm:flex-nowrap">
              
              {/* Botón Todas las guías */}
              <button
                onClick={() => setActiveTab('all')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                  activeTab === 'all'
                    ? 'bg-emerald-500 text-black border-emerald-400 shadow-md shadow-emerald-500/25 font-black'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:text-white hover:border-zinc-700 hover:bg-zinc-850'
                }`}
              >
                <BookOpen size={13} className={activeTab === 'all' ? 'text-black' : 'text-emerald-400'} />
                <span>Todas las guías</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                  activeTab === 'all' ? 'bg-black/20 text-black' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  28
                </span>
              </button>

              {/* Checkbox Sin Imágenes */}
              <label 
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border cursor-pointer text-xs select-none transition ${
                  isCompactView 
                    ? 'bg-emerald-500/10 border-emerald-500/40 text-white' 
                    : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-300'
                }`}
                title="Ocultar imágenes para recorrer las guías rápidamente"
              >
                <input
                  type="checkbox"
                  checked={isCompactView}
                  onChange={(e) => handleToggleCompactView(e.target.checked)}
                  className="rounded bg-zinc-800 border-zinc-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-zinc-900 w-3.5 h-3.5 cursor-pointer accent-emerald-500"
                />
                <span className="font-bold">Sin Imágenes</span>
              </label>

              {/* View Switcher & Counter */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 font-medium hidden sm:inline">
                  {filteredArticles.length} {filteredArticles.length === 1 ? 'guía' : 'guías'}
                </span>
                
                <div className="flex items-center bg-zinc-900 border border-zinc-800 rounded-xl p-1 gap-1">
                  <button
                    onClick={() => setViewMode('grid')}
                    title="Vista de cuadrícula"
                    className={`p-1.5 rounded-lg transition cursor-pointer ${
                      viewMode === 'grid' 
                        ? 'bg-zinc-800 text-emerald-400 shadow' 
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <LayoutGrid size={14} />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    title="Vista de lista"
                    className={`p-1.5 rounded-lg transition cursor-pointer ${
                      viewMode === 'list' 
                        ? 'bg-zinc-800 text-emerald-400 shadow' 
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <List size={14} />
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* ── CASO A: VISTA "TODAS LAS GUÍAS" AGRUPADA EDITORIALMENTE (sin búsqueda activa) ── */}
        {activeTab === 'all' && !searchQuery.trim() && (
          <div className="space-y-10">
            {GUIDE_CATEGORIES_METADATA.map((catMeta) => {
              const catArticles = filteredArticles.filter(art => art.category_key === catMeta.key);
              if (catArticles.length === 0) return null;
              const CatIcon = catMeta.icon;

              return (
                <div key={catMeta.key} className="space-y-4">
                  {/* Category Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
                    <div className="flex items-center gap-2.5">
                      <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <CatIcon size={16} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base sm:text-lg font-black text-white">
                            {catMeta.name}
                          </h3>
                          <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                            {catArticles.length} {catArticles.length === 1 ? 'guía' : 'guías'}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 mt-0.5">{catMeta.description}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => setActiveTab(catMeta.key)}
                      className="text-xs font-bold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 self-start sm:self-center transition"
                    >
                      <span>Ver solo {catMeta.name}</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>

                  {/* Category Articles */}
                  {viewMode === 'grid' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                      {catArticles.map(art => renderArticleCard(art))}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {catArticles.map((art) => (
                        <Link
                          key={art.id}
                          to={`/academy/${art.slug}`}
                          className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 hover:border-emerald-500/50 hover:bg-zinc-850 transition duration-200 shadow-md"
                        >
                          <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
                            {!isCompactView && art.featured_image && (
                              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-zinc-950 overflow-hidden flex-shrink-0 relative">
                                <img
                                  src={art.featured_image}
                                  alt={art.title}
                                  className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                                  loading="lazy"
                                />
                              </div>
                            )}

                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${getTypeBadgeClass(art.type)}`}>
                                  {art.type}
                                </span>
                                <span className="text-[10px] text-zinc-500 font-medium">
                                  {art.category_name}
                                </span>
                                <span className="text-zinc-600 hidden sm:inline">·</span>
                                <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                                  <Clock size={11} className="text-emerald-400" />
                                  {art.read_time_minutes} min
                                </span>
                              </div>

                              <h4 className="font-bold text-sm text-white group-hover:text-emerald-400 transition truncate">
                                {art.title}
                              </h4>
                              <p className="text-xs text-zinc-400 line-clamp-1 leading-relaxed">
                                {art.excerpt}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-end sm:justify-center flex-shrink-0">
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 group-hover:translate-x-1 transition px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                              Leer <ChevronRight size={13} />
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── CASO B: CATEGORÍA INDIVIDUAL O RESULTADOS DE BÚSQUEDA ── */}
        {(activeTab !== 'all' || searchQuery.trim() !== '') && (
          <div>
            {/* Grid o Lista */}
            {viewMode === 'grid' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredArticles.map(art => renderArticleCard(art))}
              </div>
            )}

            {viewMode === 'list' && (
              <div className="space-y-3">
                {filteredArticles.map((art) => (
                  <Link
                    key={art.id}
                    to={`/academy/${art.slug}`}
                    className="group flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 hover:border-emerald-500/50 hover:bg-zinc-850 transition duration-200 shadow-md"
                  >
                    <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
                      {!isCompactView && art.featured_image && (
                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-zinc-950 overflow-hidden flex-shrink-0 relative">
                          <img
                            src={art.featured_image}
                            alt={art.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                            loading="lazy"
                          />
                        </div>
                      )}

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${getTypeBadgeClass(art.type)}`}>
                            {art.type}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-medium">
                            {art.category_name}
                          </span>
                          <span className="text-zinc-600 hidden sm:inline">·</span>
                          <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                            <Clock size={11} className="text-emerald-400" />
                            {art.read_time_minutes} min
                          </span>
                        </div>

                        <h3 className="font-bold text-sm text-white group-hover:text-emerald-400 transition truncate">
                          {art.title}
                        </h3>
                        <p className="text-xs text-zinc-400 line-clamp-1 leading-relaxed">
                          {art.excerpt}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end sm:justify-center flex-shrink-0">
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 group-hover:translate-x-1 transition px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        Leer <ChevronRight size={13} />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {filteredArticles.length === 0 && (
          <div className="py-12 text-center rounded-2xl bg-zinc-900 border border-zinc-800 space-y-3">
            <BookOpen size={32} className="mx-auto text-zinc-600" />
            <div className="text-sm font-bold text-zinc-300">No se encontraron guías</div>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              No hay artículos que coincidan con los filtros seleccionados o el término de búsqueda "{searchQuery}".
            </p>
            <button
              onClick={() => { setActiveTab('start'); setSearchQuery(''); }}
              className="px-4 py-2 bg-emerald-500 text-black text-xs font-bold rounded-xl hover:bg-emerald-400 transition"
            >
              Restablecer a Primeros Pasos
            </button>
          </div>
        )}
      </div>

      {/* ── 3. VISUALIZADOR INTERACTIVO DE ESCALAS (COMPACTO) ────────────────────── */}
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
          <div>
            <h2 className="text-lg sm:text-xl font-black flex items-center gap-2 text-white">
              <Layers size={20} className="text-sky-400" />
              <span>Comparador Interactivo de Escalas</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">Selecciona una escala para ver su altura real y compatibilidad en vitrina.</p>
          </div>
          <Link 
            to="/academy/guia-escalas-figuras-coleccion"
            className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1"
          >
            Guía completa <ArrowRight size={12} />
          </Link>
        </div>

        {/* Escalas Selector Bar + Ficha activa compacta */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Selector pills list */}
          <div className="lg:col-span-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2.5">
            {scales.map((s, idx) => {
              const isSelected = selectedScaleIndex === idx;
              return (
                <button
                  key={idx}
                  onClick={() => setSelectedScaleIndex(idx)}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'bg-sky-500/15 border-sky-500/80 text-white shadow-lg'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-base font-black text-white">{s.scale_key}</span>
                    <span className="text-[10px] font-mono font-bold text-sky-400 px-1.5 py-0.5 rounded bg-sky-500/10">
                      {s.approx_height_cm?.split('–')[0]?.trim()}
                    </span>
                  </div>
                  <div className="text-[11px] font-semibold text-zinc-300 truncate">
                    {s.label.split('(')[1]?.replace(')', '') || s.label}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Ficha técnica activa */}
          <div className="lg:col-span-7 bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl font-black text-white">{activeScale?.scale_key}</span>
                  <span className="text-xs font-bold text-sky-400 bg-sky-500/10 px-2.5 py-1 rounded-md border border-sky-500/30">
                    {activeScale?.label}
                  </span>
                </div>
                <div className="text-xs font-mono font-bold text-zinc-300 bg-zinc-800 px-3 py-1 rounded-lg">
                  Altura: <span className="text-emerald-400">{activeScale?.approx_height_cm}</span>
                </div>
              </div>

              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                {activeScale?.description}
              </p>
            </div>

            <div className="pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 text-zinc-400">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>Compatibilidad verificada para vitrinas estándar tipo IKEA / Detolf</span>
              </div>
              <Link
                to="/academy/guia-escalas-figuras-coleccion"
                className="text-xs font-bold text-sky-400 hover:text-sky-300 flex items-center gap-1"
              >
                Ver comparativa visual <ChevronRight size={13} />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. DICCIONARIO RÁPIDO DEL COLECCIONISTA (REDISEÑO EDITORIAL) ─────── */}
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Cabecera del Diccionario & Buscador */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <HelpCircle size={20} className="text-amber-400" />
              <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight">
                Diccionario del Coleccionista
              </h2>
              <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                {glossarySearch.trim() 
                  ? `${glossarySearchResults.length} ${glossarySearchResults.length === 1 ? 'resultado' : 'resultados'}` 
                  : selectedGlossaryCategory === 'Todos'
                    ? `${DEFAULT_GLOSSARY.length} términos totales`
                    : `${currentCategoryTerms.length} términos`}
              </span>
            </div>
            <p className="text-xs text-zinc-400 mt-1 max-w-xl">
              {CATEGORY_DESCRIPTIONS[selectedGlossaryCategory]}
            </p>
          </div>

          {/* Buscador de términos */}
          <div className="w-full md:w-80 relative">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={glossarySearch}
              onChange={(e) => setGlossarySearch(e.target.value)}
              placeholder="Buscar: bootleg, MIB, resina, chase..."
              className="w-full pl-9 pr-8 py-2 bg-zinc-900 border border-zinc-700/80 rounded-xl text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-amber-500 transition shadow-inner"
            />
            {glossarySearch && (
              <button 
                onClick={() => setGlossarySearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-zinc-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Barra de Tabs de Categorías Ordenadas (1. Autenticidad, 2. Estado, 3. Mercado, 4. Técnico, 5. Materiales, 6. Todos) */}
        {!glossarySearch && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {GLOSSARY_CATEGORIES.map((cat) => {
              const Icon = CATEGORY_ICONS[cat];
              const isSelected = selectedGlossaryCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedGlossaryCategory(cat)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    isSelected
                      ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                  }`}
                >
                  <Icon size={14} />
                  <span>{cat}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── VISTA 1: RESULTADOS DE BÚSQUEDA ── */}
        {glossarySearch.trim() !== '' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-zinc-400">
              <span>
                Mostrando resultados para <strong className="text-white">"{glossarySearch}"</strong>
              </span>
              <button
                onClick={() => setGlossarySearch('')}
                className="text-amber-400 hover:underline cursor-pointer"
              >
                Limpiar búsqueda
              </button>
            </div>

            {glossarySearchResults.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {glossarySearchResults.map((g, idx) => (
                  <div
                    key={idx}
                    className="bg-zinc-900/90 border border-zinc-800/80 hover:border-amber-500/40 rounded-2xl p-4 flex flex-col justify-between space-y-2 transition shadow-sm"
                  >
                    <div className="space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-black text-sm text-white tracking-tight leading-snug">
                          {g.term}
                        </h4>
                        <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded bg-zinc-800 text-amber-400 border border-zinc-700/80 flex-shrink-0">
                          {g.category}
                        </span>
                      </div>
                      {g.spanish_term && (
                        <div className="text-[11px] font-semibold text-amber-400/90">
                          {g.spanish_term}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed pt-1">
                      {g.definition}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center rounded-2xl bg-zinc-900 border border-zinc-800 space-y-2">
                <Search size={28} className="mx-auto text-zinc-600" />
                <div className="text-sm font-bold text-zinc-300">No se encontraron términos</div>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  No hay coincidencias para "{glossarySearch}". Intenta con palabras clave como bootleg, resina, MIB, loose o chase.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── VISTA 2: ÍNDICE GENERAL "TODOS" ── */}
        {!glossarySearch && selectedGlossaryCategory === 'Todos' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(['Autenticidad', 'Estado', 'Mercado', 'Técnico', 'Materiales'] as const).map((catName) => {
                const catTerms = DEFAULT_GLOSSARY.filter(t => t.category === catName);
                const Icon = CATEGORY_ICONS[catName];
                return (
                  <div
                    key={catName}
                    className="bg-zinc-900 border border-zinc-800/80 rounded-2xl p-5 flex flex-col justify-between space-y-4 hover:border-amber-500/40 transition shadow-lg group"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon size={18} className="text-amber-400" />
                          <h3 className="font-black text-base text-white">{catName}</h3>
                        </div>
                        <span className="text-[11px] font-mono font-bold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                          {catTerms.length} términos
                        </span>
                      </div>
                      
                      <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
                        {CATEGORY_DESCRIPTIONS[catName]}
                      </p>

                      <div className="pt-2 text-[11px] text-zinc-500 leading-relaxed line-clamp-3">
                        {catTerms.map(t => t.term).join(' · ')}
                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedGlossaryCategory(catName)}
                      className="w-full py-2 px-3 bg-zinc-800 hover:bg-amber-500 hover:text-black text-zinc-300 text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer mt-2"
                    >
                      <span>Explorar {catName}</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── VISTA 3: CATEGORÍA "MATERIALES" (LISTA DIRECTA) ── */}
        {!glossarySearch && selectedGlossaryCategory === 'Materiales' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {currentCategoryTerms.map((g, idx) => (
                <div
                  key={idx}
                  className="bg-zinc-900/90 border border-zinc-800/80 hover:border-amber-500/40 rounded-2xl p-4 flex flex-col justify-between space-y-2 transition shadow-sm"
                >
                  <div className="space-y-1">
                    <h4 className="font-black text-sm text-white tracking-tight leading-snug">
                      {g.term}
                    </h4>
                    {g.spanish_term && (
                      <div className="text-[11px] font-semibold text-amber-400/90">
                        {g.spanish_term}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed pt-1">
                    {g.definition}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── VISTA 4: CATEGORÍAS ESTRUCTURADAS (AUTENTICIDAD, ESTADO, MERCADO, TÉCNICO) ── */}
        {!glossarySearch && selectedGlossaryCategory !== 'Todos' && selectedGlossaryCategory !== 'Materiales' && (
          <div className="space-y-6">
            
            {/* Sección 1: Términos Esenciales */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <h3 className="text-xs font-black uppercase tracking-wider text-zinc-300">
                  Términos Esenciales ({essentialTerms.length})
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {essentialTerms.map((g, idx) => (
                  <div
                    key={idx}
                    className="bg-zinc-900/90 border border-zinc-800/80 hover:border-amber-500/40 rounded-2xl p-4 flex flex-col justify-between space-y-2 transition shadow-sm"
                  >
                    <div className="space-y-1">
                      <h4 className="font-black text-sm text-white tracking-tight leading-snug">
                        {g.term}
                      </h4>
                      {g.spanish_term && (
                        <div className="text-[11px] font-semibold text-amber-400/90">
                          {g.spanish_term}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed pt-1">
                      {g.definition}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Sección 2: Grupos Secundarios Desplegables (Acordeones) */}
            {secondaryGroups.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2 border-t border-zinc-800/80 pt-4">
                  <span className="w-2 h-2 rounded-full bg-zinc-500" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-zinc-400">
                    Grupos Complementarios
                  </h3>
                </div>

                <div className="space-y-3">
                  {secondaryGroups.map(({ groupName, items }) => {
                    const isOpen = !!openGroups[groupName];
                    return (
                      <div
                        key={groupName}
                        className="rounded-2xl border border-zinc-800 bg-zinc-900/70 overflow-hidden transition"
                      >
                        {/* Accordion trigger button */}
                        <button
                          onClick={() => toggleGroup(groupName)}
                          className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-zinc-850 transition cursor-pointer"
                        >
                          <div>
                            <div className="font-bold text-sm text-white flex items-center gap-2">
                              <span>{groupName}</span>
                              <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                                {items.length} {items.length === 1 ? 'término' : 'términos'}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-500 mt-0.5">
                              {isOpen ? 'Ocultar términos ↑' : 'Ver términos ↓'}
                            </div>
                          </div>

                          <div className="p-1 rounded-lg bg-zinc-800 text-zinc-400">
                            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </div>
                        </button>

                        {/* Accordion items grid */}
                        {isOpen && (
                          <div className="p-4 pt-2 border-t border-zinc-800/60 bg-zinc-950/40">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {items.map((g, idx) => (
                                <div
                                  key={idx}
                                  className="bg-zinc-900/90 border border-zinc-800/80 hover:border-zinc-700 rounded-xl p-3.5 space-y-1.5 transition"
                                >
                                  <div className="space-y-0.5">
                                    <h5 className="font-black text-xs text-white tracking-tight leading-snug">
                                      {g.term}
                                    </h5>
                                    {g.spanish_term && (
                                      <div className="text-[10px] font-semibold text-amber-400/90">
                                        {g.spanish_term}
                                      </div>
                                    )}
                                  </div>
                                  <p className="text-xs text-zinc-400 leading-relaxed">
                                    {g.definition}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 5. CTA BANNER COMPACTO ────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto p-6 sm:p-8 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-zinc-900 to-zinc-950 border border-emerald-500/30 flex flex-col md:flex-row items-center justify-between gap-5 shadow-xl">
        <div className="space-y-1.5 text-center md:text-left">
          <div className="inline-flex items-center gap-1.5 text-emerald-400 text-xs font-black uppercase tracking-wider">
            <ShieldCheck size={15} />
            <span>Figuras 100% Originales & Garantizadas</span>
          </div>
          <h3 className="text-xl sm:text-2xl font-black text-white">¿Listo para sumar una pieza a tu colección?</h3>
          <p className="text-xs text-zinc-400 max-w-xl">
            Aplica lo aprendido y explora figuras en stock inmediato en Uruguay y preventas internacionales con franquicia de USD 200.
          </p>
        </div>
        <Link
          to="/shop"
          className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs rounded-xl transition flex items-center gap-2 shadow-lg flex-shrink-0"
        >
          <ShoppingBag size={15} />
          <span>Ver Catálogo de Tienda</span>
        </Link>
      </div>
    </div>
  );
}
