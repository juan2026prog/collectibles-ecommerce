-- Migration: Vendor Terms & Conditions Mandatory Acceptance System
-- Date: 2026-08-05

BEGIN;

-- 1. Create legal_documents table
CREATE TABLE IF NOT EXISTS public.legal_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type TEXT NOT NULL,
    version TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    checksum TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    acceptance_required BOOLEAN NOT NULL DEFAULT true,
    effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    CONSTRAINT legal_docs_type_version_unique UNIQUE (document_type, version)
);

CREATE INDEX IF NOT EXISTS idx_legal_documents_type_active ON public.legal_documents(document_type, is_active);

-- 2. Create vendor_terms_acceptances table
CREATE TABLE IF NOT EXISTS public.vendor_terms_acceptances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    legal_document_id UUID NOT NULL REFERENCES public.legal_documents(id) ON DELETE CASCADE,
    document_version TEXT NOT NULL,
    document_checksum TEXT NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    accepted_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    ip_address TEXT,
    user_agent TEXT,
    device_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    source TEXT NOT NULL DEFAULT 'vendor_first_login',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT vendor_legal_doc_unique UNIQUE (vendor_id, legal_document_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_terms_acceptances_vendor ON public.vendor_terms_acceptances(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_terms_acceptances_doc ON public.vendor_terms_acceptances(legal_document_id);

-- 3. RLS Security Policies
ALTER TABLE public.legal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_terms_acceptances ENABLE ROW LEVEL SECURITY;

-- legal_documents policies
DROP POLICY IF EXISTS "Anyone can view active legal documents" ON public.legal_documents;
CREATE POLICY "Anyone can view active legal documents" ON public.legal_documents
    FOR SELECT USING (is_active = true OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
    ));

DROP POLICY IF EXISTS "Only admins can insert or update legal documents" ON public.legal_documents;
CREATE POLICY "Only admins can insert or update legal documents" ON public.legal_documents
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
        )
    );

-- vendor_terms_acceptances policies (APPEND-ONLY)
DROP POLICY IF EXISTS "Vendors can view their own acceptances" ON public.vendor_terms_acceptances;
CREATE POLICY "Vendors can view their own acceptances" ON public.vendor_terms_acceptances
    FOR SELECT USING (
        vendor_id = auth.uid() OR EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
        )
    );

DROP POLICY IF EXISTS "Vendors can insert their own acceptance" ON public.vendor_terms_acceptances;
CREATE POLICY "Vendors can insert their own acceptance" ON public.vendor_terms_acceptances
    FOR INSERT WITH CHECK (
        accepted_by = auth.uid() AND (
            vendor_id = auth.uid() OR EXISTS (
                SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
            )
        )
    );

-- STRICT RULE: Block UPDATE and DELETE on vendor_terms_acceptances for legal audit immutability

-- 4. Check & Verification Functions
CREATE OR REPLACE FUNCTION public.vendor_requires_terms_acceptance(p_vendor_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_active_doc_id UUID;
BEGIN
    -- Get active vendor terms document requiring acceptance
    SELECT id INTO v_active_doc_id
    FROM public.legal_documents
    WHERE document_type = 'vendor_terms'
      AND is_active = true
      AND acceptance_required = true
    ORDER BY effective_at DESC, created_at DESC
    LIMIT 1;

    IF v_active_doc_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- Check if vendor has already accepted this specific document version
    IF EXISTS (
        SELECT 1 FROM public.vendor_terms_acceptances
        WHERE vendor_id = p_vendor_id
          AND legal_document_id = v_active_doc_id
    ) THEN
        RETURN FALSE;
    ELSE
        RETURN TRUE;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.vendor_has_accepted_current_terms(p_vendor_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN NOT public.vendor_requires_terms_acceptance(p_vendor_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC helper to fetch active vendor terms document safely
CREATE OR REPLACE FUNCTION public.get_active_vendor_terms()
RETURNS JSONB AS $$
DECLARE
    v_doc RECORD;
BEGIN
    SELECT id, document_type, version, title, content, checksum, acceptance_required, effective_at, created_at
    INTO v_doc
    FROM public.legal_documents
    WHERE document_type = 'vendor_terms'
      AND is_active = true
    ORDER BY effective_at DESC, created_at DESC
    LIMIT 1;

    IF v_doc.id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN jsonb_build_object(
        'id', v_doc.id,
        'document_type', v_doc.document_type,
        'version', v_doc.version,
        'title', v_doc.title,
        'content', v_doc.content,
        'checksum', v_doc.checksum,
        'acceptance_required', v_doc.acceptance_required,
        'effective_at', v_doc.effective_at,
        'created_at', v_doc.created_at
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC function to accept vendor terms (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.accept_vendor_terms(
    p_document_id UUID,
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_device_metadata JSONB DEFAULT '{}'::jsonb,
    p_source TEXT DEFAULT 'vendor_first_login'
)
RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_vendor_id UUID;
    v_doc RECORD;
    v_acceptance_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuario no autenticado.';
    END IF;

    -- Verify user is vendor owner or registered vendor
    SELECT id INTO v_vendor_id
    FROM public.vendors
    WHERE id = v_user_id;

    IF v_vendor_id IS NULL THEN
        RAISE EXCEPTION 'El usuario no posee perfil de Vendedor registrado.';
    END IF;

    -- Validate legal document exists and is active
    SELECT id, version, checksum, is_active
    INTO v_doc
    FROM public.legal_documents
    WHERE id = p_document_id;

    IF v_doc.id IS NULL THEN
        RAISE EXCEPTION 'El documento legal especificado no existe.';
    END IF;

    IF NOT v_doc.is_active THEN
        RAISE EXCEPTION 'El documento legal no se encuentra activo.';
    END IF;

    -- Insert acceptance record (Idempotent)
    INSERT INTO public.vendor_terms_acceptances (
        vendor_id,
        legal_document_id,
        document_version,
        document_checksum,
        accepted_at,
        accepted_by,
        ip_address,
        user_agent,
        device_metadata,
        source
    ) VALUES (
        v_vendor_id,
        v_doc.id,
        v_doc.version,
        v_doc.checksum,
        now(),
        v_user_id,
        p_ip_address,
        p_user_agent,
        COALESCE(p_device_metadata, '{}'::jsonb),
        COALESCE(p_source, 'vendor_first_login')
    )
    ON CONFLICT (vendor_id, legal_document_id) DO UPDATE SET
        accepted_at = EXCLUDED.accepted_at
    RETURNING id INTO v_acceptance_id;

    -- Update vendor status to active if currently pending or pending_terms_acceptance
    UPDATE public.vendors
    SET status = 'active'
    WHERE id = v_vendor_id
      AND status IN ('pending', 'pending_terms_acceptance');

    RETURN jsonb_build_object(
        'success', true,
        'acceptance_id', v_acceptance_id,
        'vendor_id', v_vendor_id,
        'version', v_doc.version,
        'status', 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Insert initial mandatory version 1.0 of vendor terms
INSERT INTO public.legal_documents (
    document_type,
    version,
    title,
    content,
    checksum,
    is_active,
    acceptance_required,
    effective_at
) VALUES (
    'vendor_terms',
    '1.0',
    'Términos y Condiciones para Vendedores de Collectibles',
    '# Términos y Condiciones para Vendedores de Collectibles

**Versión:** 1.0  
**Fecha de Entrada en Vigor:** 5 de Agosto de 2026  
**Plataforma:** Collectibles.uy  

---

### 1. ACEPTACIÓN Y ALCANCE DE LOS TÉRMINOS
El presente contrato establece las condiciones legales, comerciales, operativas y de trazabilidad que regulan la relación entre la plataforma **Collectibles.uy** (en adelante "la Plataforma") y el vendedor o comercio registrado (en adelante "el Vendor"). El acceso, publicación de productos, gestión de catálogo, despacho de pedidos y operación en el Seller Center implica la aceptación expresa e incondicional de los presentes Términos y Condiciones.

---

### 2. REGISTRO, VERIFICACIÓN Y ESTADO DEL VENDOR
2.1. Para operar como Vendor, el usuario debe contar con habilitación previa otorgada por la administración de Collectibles.uy.  
2.2. Al momento de la habilitación inicial, la cuenta de Vendor permanecerá en estado `pending_terms_acceptance` hasta la suscripción y aceptación digital del presente documento.  
2.3. La aceptación formal actualizará el estado operativo a `active`.  
2.4. Collectibles.uy se reserva el derecho de auditar los datos fiscales, comerciales y de identidad (KYC) provistos por el Vendor en cualquier momento.

---

### 3. COMISIONES Y LIQUIDACIONES FINANCIERAS
3.1. **Comisión de Plataforma:** Collectibles.uy aplicará una comisión del **5% (cinco por ciento)** sobre el valor bruto total de los productos vendidos a través del marketplace, salvo acuerdos corporativos o promocionales expresamente documentados.  
3.2. **Liquidaciones:** El pago neto a los Vendors por las ventas confirmadas y entregadas se procesará de forma periódica **todos los días miércoles**, transfiriendo los fondos a la cuenta bancaria o medio de pago registrado por el Vendor.  
3.3. **Deducciones:** De las liquidaciones brutas se deducirán automáticamente las comisiones de la plataforma, los costos de envío bonificados asumidos por el Vendor y los ajustes por devoluciones o contracargos aplicables.

---

### 4. GESTIÓN DE PRODUCTOS, STOCK Y RESPONSABILIDAD FISCAL
4.1. El Vendor es el único y exclusivo responsable de la exactitud de los títulos, imágenes, precios, atributos, variantes y disponibilidad de inventario publicados en sus tiendas.  
4.2. **Garantía y Autenticidad:** Todos los productos listados deben ser 100% legítimos, originales y cumplir con las normativas comerciales vigentes en la República Oriental del Uruguay. Queda strictly prohibida la venta de productos falsificados o réplicas no autorizadas.  
4.3. **Facturación y Tributación:** El Vendor es responsable directo de la emisión de comprobantes fiscales (facturas de venta / e-facturas) al comprador final conforme a la normativa de la DGI y leyes locales aplicables.

---

### 5. LOGÍSTICA, MÉTODOS DE ENVÍO Y CUENTAS PROPIAS (BYOC)
5.1. **Envío Gratis Obligatorio por Tienda:**  
- Aplica envío gratis automático en compras que alcancen o superen los **UYU 1.500** dentro de una misma tienda Vendor.  
- El costo económico del envío gratis asumido por la promoción es a **cargo exclusivo del Vendor**, descontándose de la liquidación del pedido correspondiente.  
5.2. **DAC (Distribuidora de Agencias del Uruguay):**  
- El Vendor podrá optar por utilizar la integración estándar provista por Collectibles o su **cuenta propia de agencia DAC**.  
5.3. **SoyDelivery / Flex (Cuenta Propia Obligatoria):**  
- Para la modalidad de entregas en el día (SoyDelivery / Flex), es **obligatorio que el Vendor configure su propia cuenta comercial** con credenciales de API activas.  
- Todas las tarifas, costos operativos, recolecciones y liquidaciones del servicio SoyDelivery se facturarán y pagarán directamente desde la cuenta del Vendor con el proveedor logístico.  
- El despacho del paquete debe realizarse obligatoriamente desde la dirección física o depósito configurado por el Vendor.  
5.4. **Distrilogic (Cuenta Propia):**  
- El uso del servicio Distrilogic requerirá asimismo la vinculación de cuenta corporativa propia del Vendor.  
5.5. **Preparación de Paquetes:** El Vendor se compromete a empaquetar, etiquetar y despachar los pedidos dentro del plazo estipulado en la plataforma (máximo 24-48 horas hábiles).

---

### 6. POLÍTICA DE DEVOLUCIONES, RECLAMOS Y ATENCIÓN AL CLIENTE
6.1. El Vendor acepta los términos del Estatuto del Consumidor (Ley N° 17.250) y las políticas de devolución y garantía de Collectibles.uy.  
6.2. En caso de fallas de fábrica, envíos erróneos o insatisfacción contemplada legalmente, el Vendor deberá responder por el reemplazo del producto o la restitución del importe correspondiente.

---

### 7. TRAZABILIDAD DIGITAL Y AUDITORÍA INMUTABLE
7.1. La aceptación del presente documento se realiza mediante firma y registro digital que captura: identificador único de Vendor, identificador de usuario autenticado, versión del documento, suma de verificación Hash SHA-256 del contenido contractual, timestamp oficial del servidor, dirección IP de origen y metadatos del dispositivo.  
7.2. Dichos registros de evidencia poseen carácter inmutable y serán almacenados de forma permanente para acreditar la validez contractual.

---

### 8. MODIFICACIONES Y NUEVAS VERSIONES OBLIGATORIAS
8.1. Collectibles.uy podrá actualizar o publicar nuevas versiones de estos Términos y Condiciones.  
8.2. En caso de publicarse una nueva versión marcada como obligatoria, todos los Vendors deberán otorgar una nueva aceptación explícita antes de continuar operando o gestionando productos, pedidos y liquidaciones en el Seller Center.',
    '44d47c4c81b67272719a8685121b6d05903ebcbb93c28dfbdce816223403a45c',
    true,
    true,
    '2026-08-05 00:00:00-03'
)
ON CONFLICT (document_type, version) DO UPDATE SET
    title = EXCLUDED.title,
    content = EXCLUDED.content,
    checksum = EXCLUDED.checksum,
    is_active = EXCLUDED.is_active,
    effective_at = EXCLUDED.effective_at;

COMMIT;
