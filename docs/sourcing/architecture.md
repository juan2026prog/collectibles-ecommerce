# Sourcing Intelligence — System Architecture (Phase 7 Integration)

## 1. Overview
Sourcing Intelligence operates as the commercial selection engine of Collectibles 2026. It connects upstream suppliers (Amazon, eBay, Best Buy) with internal product master catalog entities, land cost import calculations, Uruguay market gap analysis, risk scoring, autopilot execution, Radar trend signals, AI search, personalization, dynamic merchandising, order execution via Zinc, and closed-loop learning feedback.

---

## 2. Master Domain Architecture Diagram

```mermaid
flowchart TD
    subgraph Retailers ["Retailers / Suppliers"]
        AMZ["Amazon US"]
        EBY["eBay API"]
        BBY["Best Buy US"]
    end

    subgraph Sourcing ["Sourcing Intelligence Core"]
        SI["Sourcing Discovery & Adapters"]
        PN["Product Normalization Service"]
        PM["Product Matching Engine"]
        CONF["Identity Confidence (EXACT/HIGH/MEDIUM)"]
    end

    subgraph CoreEngine ["Financial & Risk Engines"]
        IE["Import Engine (UruBox Courier & Aduanas UY)"]
        PE["Pricing Engine (Profit Protection)"]
        RE["Risk Engine (Seller Trust & Authenticity Gate)"]
        OE["Opportunity Engine (0-100 Score)"]
    end

    subgraph Decision ["Decision & Execution"]
        AP["Autopilot Policy Engine"]
        HITL["Human-in-the-Loop Backoffice"]
        CAT["Collectibles Catalog (Master & International)"]
    end

    subgraph Ecosystem ["Connected Ecosystem"]
        RADAR["Collectibles Radar"]
        AIS["AI Search (Natural Language)"]
        PERS["Personalization & Collector DNA"]
        MERCH["Dynamic Merchandising"]
    end

    subgraph Commerce ["Orders & Execution"]
        FRONT["Customer Frontend & Cart"]
        ORD["Order Processing"]
        ZINC["Zinc Purchasing Adapter"]
    end

    subgraph Analytics ["Analytics & Closed-Loop Learning"]
        AN["Analytics Events"]
        LE["Closed-Loop Learning Engine (v7.0)"]
    end

    Retailers --> SI
    SI --> PN --> PM --> CONF
    CONF --> IE --> PE --> RE --> OE
    OE --> AP & HITL
    AP & HITL --> CAT
    CAT --> RADAR & AIS & PERS & MERCH
    RADAR & AIS & PERS & MERCH --> FRONT
    FRONT --> ORD --> ZINC
    ORD --> AN --> LE
    LE -->|"Feedback Weights"| OE & SI
```

---

## 3. Core Database Schemas

```mermaid
erDiagram
    canonical_products ||--o{ product_offers : "has_offers"
    canonical_products ||--o{ product_identifiers : "has_ids"
    canonical_products ||--o{ sourcing_opportunities : "evaluates"
    release_events ||--o{ radar_signal_products : "links"
    canonical_products ||--o{ radar_signal_products : "relates"
    canonical_products ||--o{ sourcing_learning_signals : "learns"
    
    canonical_products {
        uuid id PK
        string canonical_sku
        string title
        string brand
        string license
        string line
        string character
        string scale
    }
    product_offers {
        uuid id PK
        uuid canonical_product_id FK
        string source
        string seller
        numeric price
        numeric domestic_shipping
        string availability
        numeric reliability_score
    }
    sourcing_opportunities {
        uuid id PK
        string canonical_sku
        numeric opportunity_score
        string profitability_status
        string recommendation
        jsonb reason_codes
    }
    radar_signal_products {
        uuid id PK
        uuid radar_event_id FK
        string canonical_sku
        string relationship_type
        numeric confidence
    }
    sourcing_learning_signals {
        uuid id PK
        string canonical_sku
        numeric views_count
        numeric orders_count
        numeric revenue_usd
        numeric conversion_rate
        string performance_verdict
    }
```

---

## 4. Key Pipelines & Contracts

### A. Sourcing Pipeline
`RETAILER OFFER -> NORMALIZATION -> MATCHING -> LANDED COST UY -> RISK -> OPPORTUNITY SCORE -> AUTOPILOT -> CATALOG`

### B. Connected Discovery Pipeline
`RADAR TREND -> SOURCING GAP ANALYSIS -> OPPORTUNITY CREATION -> AUTOPILOT PUBLISH -> RADAR LINK ("Ver productos")`

### C. Search & Personalization Pipeline
`USER QUERY -> AI SEARCH PARSER -> DB FILTER -> COLLECTOR DNA SIGNAL -> DYNAMIC MERCHANDISING RANKING`

### D. Order & Purchasing Pipeline
`FRONTEND CART -> PRE-PURCHASE VALIDATION -> ZINC ADAPTER -> FULFILLMENT -> LEARNING ENGINE FEEDBACK`
